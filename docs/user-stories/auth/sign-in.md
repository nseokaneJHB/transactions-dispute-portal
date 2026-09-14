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
`docs/user-stories/auth/sign-in-otp-rate-limited.md`.

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
`docs/user-stories/auth/sign-in-otp-invalid-or-expired.md`,
`docs/user-stories/auth/sign-in-otp-locked-out.md`, and
`docs/user-stories/auth/sign-in-otp-rate-limited.md`.

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
