# Sign in (email OTP)

**Role:** anyone. **Screens:** `/sign-in` (two steps on one route, switched by
the `?email=` search param).

## Step 1 — request a code

1. User enters their email, submits. Web calls **`POST /v1/auth/otp`**
   (`{ email }`).
2. Service calls Better Auth `sendVerificationOTP` (type `sign-in`). Better Auth
   generates a 6-digit code, stores it **hashed** in `verification` with a
   10-minute expiry, and calls our `sendVerificationOTP` hook →
   `buildOtpEmailSignInRequest` → `sendEmail` (SMTP / Mailpit).
3. Service writes an `auth_audit_log` row: `event: OTP_REQUESTED`, the email, IP,
   user-agent.
4. Response is **the same whether or not the account exists** — `"If an account
   exists for {email}, a sign-in code is on its way."` — plus
   `redirectUrl: /sign-in?email={email}`. Anti-enumeration.
5. Web navigates to `/sign-in?email=…`, which renders step 2.

Because `emailOTP({ disableSignUp: true })` is set, a code for an unknown email
is generated and emailed to nobody useful — sign-in never creates an account.

Too many requests from one IP — see
*too many OTP requests from one IP* (below).

## Step 2 — verify the code

1. User enters the code, submits. Web calls **`POST /v1/auth/otp/verify`**
   (`{ email, otp }`).
2. Service calls Better Auth `signInEmailOTP` (`asResponse: true` to capture the
   `Set-Cookie`). On success Better Auth creates the `session` row and returns
   the session cookie; the service forwards every `Set-Cookie` header onto the
   reply.
3. Service inspects the Better Auth response and writes one `auth_audit_log`
   row: `LOGIN_SUCCESS` (with `user_id`).
4. Response: `200 "Signed in."`, `redirectUrl: /`.
5. Web, on success, invalidates the router (re-runs `__root` `beforeLoad`, which
   now sees a session) and navigates to `/`, which redirects by role.

A wrong or expired code, an account locked out after too many bad attempts, or
too many verify requests from one IP — see
*invalid or expired OTP* (below),
*OTP locked out after too many bad attempts* (below), and
*too many OTP requests from one IP* (below).

## Side effect — new-device login alert (background)

Whenever Better Auth inserts a `session` row, its
`databaseHooks.session.create.after` fires `alertOnNewDeviceLogin(session)` —
**fire-and-forget, never awaited into the login response**
(`docs/backend-service.md` §3, `docs/progress-and-decisions.md` #46):

- No `user_agent` on the session → skip (only non-browser clients omit it).
- `hasKnownDeviceSession` — any earlier session for this `user_id` with the same
  `user_agent`? → skip.
- Otherwise → `buildNewDeviceLoginEmail` (IP, user-agent, timestamp, a sign-in
  link) → `sendEmail`.

The seed gives the admin and `customer@example.com` one session on a known
user-agent so this stays quiet on a demo login from the same browser.

## Route access (applies to every authenticated flow)

- **API** — every route has `preHandler: [authenticate]` (and `authorize(ROLE)`
  where role-scoped). `authenticate` reads the Better Auth session cookie; no
  session → `401` + `redirectUrl: /sign-in`. `authorize` → `403` on role
  mismatch.
- **Web** — `__root.tsx` `beforeLoad` loads `GET /v1/auth/session` once per
  navigation and seeds `context.user`. `_authenticated.tsx` redirects to
  `/sign-in` when there's no user, then keeps a customer out of `/admin` and an
  admin out of the customer pages (`/account` is shared). `_unauthenticated.tsx`
  bounces a signed-in user to `/`.

`/` itself is a pure redirector: no session → `/sign-in`; admin → `/admin`;
customer → `/transactions`.

## Error cases

### Invalid or expired OTP

**Trigger:** the user submits a code that is wrong, or that has passed its
10-minute expiry, to `POST /v1/auth/otp/verify`, and the attempt count for
that code is still under Better Auth's 5-attempt lockout
(*Locked out* (in this section) covers the lockout itself).

**Response:** the service writes an `auth_audit_log` row `event:
LOGIN_FAILURE` and responds `401`, `"invalid or expired"`, plus
`redirectUrl: /sign-in?email=…`.

**What the user sees / does next:** the verify form shows the error and stays
on step 2 so the user can retry the code, or navigate back to request a new
one.

### OTP locked out after too many bad attempts

**Trigger:** Better Auth enforces its own 5-attempts-per-code lockout inside
`signInEmailOTP`. Once a code has failed 5 times, that code is void even if
the correct value is entered afterward.

**Response:** the service inspects the Better Auth response body; a
`TOO_MANY_ATTEMPTS` code writes an `auth_audit_log` row `event: OTP_LOCKED`
and the API responds `429`, `"that code is now void, request a new one"`.

**What the user sees / does next:** the sign-in form shows the lockout
message and prompts the user back to step 1 (`POST /v1/auth/otp`) to request
a fresh code.

### Too many OTP requests from one IP

**Trigger:** Both steps of email-OTP sign-in carry their own per-IP rate
limit, layered on top of Better Auth's own per-code lockout
(*Locked out* (in this section)):

- `POST /v1/auth/otp` (request a code) — more than `OTP.MAX_ATTEMPTS` calls
  from the same IP within a minute.
- `POST /v1/auth/otp/verify` (verify a code) — more than `2 × OTP.MAX_ATTEMPTS`
  calls from the same IP within a minute. The threshold is deliberately double
  the request limit so Better Auth's own 5-attempts-per-code lockout trips
  first in the normal case — this limit exists as a backstop against IPs
  cycling through many different emails/codes, not as the primary defense.

**Response:** `429` via the shared response envelope
(`{ code, message, redirectUrl?, errors? }`, `docs/backend-service.md` "Response
envelope"). `docs/user-stories/auth/sign-in.md` documents the thresholds but not bespoke copy for
this specific case, unlike the account-lockout case below, which has its own
message.

**What the user sees / does next:** a "too many attempts, try again shortly"
style message; the user waits out the window and retries. No `auth_audit_log`
row is specific to this case — it is enforced before the request reaches the
service layer.
