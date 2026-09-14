# Admin invite — too many sends from one IP

**Flow:** `docs/user-stories/admin/admin-invite.md` (send)

**Trigger:** more than `2 × OTP.MAX_ATTEMPTS` calls to `POST /v1/admin/invites`
from the same IP within a minute.

**Response:** `429` via the shared response envelope. `docs/user-stories/admin/admin-invite.md`
documents the threshold but not bespoke copy for this case.

**What the user sees / does next:** a "too many attempts, try again shortly"
style message on `/admin/invites`; the admin waits out the window and
resubmits.
