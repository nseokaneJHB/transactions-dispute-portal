# Admin invite accept — too many attempts from one IP

**Flow:** `docs/user-stories/admin/admin-invite.md` (accept)

**Trigger:** too many calls to `POST /v1/admin/invites/:token/accept` from the
same IP within a minute. `docs/user-stories/admin/admin-invite.md` notes the accept endpoint has "own
rate limit" without stating the exact threshold (unlike the send endpoint's
documented `2 × OTP.MAX_ATTEMPTS`).

**Response:** `429` via the shared response envelope.

**What the user sees / does next:** a "too many attempts, try again shortly"
style message on `/admin/invite?token=…`; the invitee waits out the window and
resubmits.
