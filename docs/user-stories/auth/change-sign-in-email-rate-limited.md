# Change sign-in email — too many requests from one IP

**Flow:** `docs/user-stories/auth/change-sign-in-email.md`

**Trigger:** more than `OTP.MAX_ATTEMPTS` calls to `POST /v1/auth/change-email`
from the same IP within a minute — the same per-route rate-limiting mechanism
used across the auth routes (`docs/progress-and-decisions.md` #37).

**Response:** `429` via the shared response envelope. `docs/user-stories/auth/change-sign-in-email.md`
documents the threshold but not bespoke copy for this case.

**What the user sees / does next:** a "too many attempts, try again shortly"
style message on `/account`; the user waits out the window and resubmits.
