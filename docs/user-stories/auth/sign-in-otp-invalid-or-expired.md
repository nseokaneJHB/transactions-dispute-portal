# Sign in — invalid or expired OTP

**Flow:** `docs/user-stories/auth/sign-in.md` (step 2 — verify the code)

**Trigger:** the user submits a code that is wrong, or that has passed its
10-minute expiry, to `POST /v1/auth/otp/verify`, and the attempt count for
that code is still under Better Auth's 5-attempt lockout
(`docs/user-stories/auth/sign-in-otp-locked-out.md` covers the lockout itself).

**Response:** the service writes an `auth_audit_log` row `event:
LOGIN_FAILURE` and responds `401`, `"invalid or expired"`, plus
`redirectUrl: /sign-in?email=…`.

**What the user sees / does next:** the verify form shows the error and stays
on step 2 so the user can retry the code, or navigate back to request a new
one.
