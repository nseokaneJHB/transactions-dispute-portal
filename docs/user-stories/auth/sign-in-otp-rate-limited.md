# Sign in — too many OTP requests from one IP

**Flow:** `docs/user-stories/auth/sign-in.md`

**Trigger:** Both steps of email-OTP sign-in carry their own per-IP rate
limit, layered on top of Better Auth's own per-code lockout
(`docs/user-stories/auth/sign-in-otp-locked-out.md`):

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
