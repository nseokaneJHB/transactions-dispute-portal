# Sign in — OTP locked out after too many bad attempts

**Flow:** `docs/user-stories/auth/sign-in.md` (step 2 — verify the code)

**Trigger:** Better Auth enforces its own 5-attempts-per-code lockout inside
`signInEmailOTP`. Once a code has failed 5 times, that code is void even if
the correct value is entered afterward.

**Response:** the service inspects the Better Auth response body; a
`TOO_MANY_ATTEMPTS` code writes an `auth_audit_log` row `event: OTP_LOCKED`
and the API responds `429`, `"that code is now void, request a new one"`.

**What the user sees / does next:** the sign-in form shows the lockout
message and prompts the user back to step 1 (`POST /v1/auth/otp`) to request
a fresh code.
