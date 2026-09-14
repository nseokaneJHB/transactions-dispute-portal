# Admin invite accept — token not found

**Flow:** `docs/user-stories/admin/admin-invite.md` (accept)

**Trigger:** `POST /v1/admin/invites/:token/accept` is called with a token
that `findAdminInviteByToken` doesn't find at all — no `admin_invite` row
with that token exists (typo'd link, tampered URL).

**Response:** `404` via the shared response envelope.

**What the user sees / does next:** the accept page shows a not-found style
error; the invitee has no account and must ask the inviting admin to send a
fresh invite (`docs/user-stories/admin/admin-invite.md` send step).
