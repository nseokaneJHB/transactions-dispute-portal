# Admin invite accept — token expired

**Flow:** `docs/user-stories/admin/admin-invite.md` (accept)

**Trigger:** `POST /v1/admin/invites/:token/accept` is called after the
invite's `expires_at` (`ADMIN_INVITE_EXPIRY_HOURS`, 72h from send) has passed,
and the invite was never accepted.

**Response:** `409`, `"expired"`.

**What the user sees / does next:** the accept page shows the expiry message;
the invitee has no account and must ask the inviting admin to send a fresh
invite (`docs/user-stories/admin/admin-invite.md` send step) — there is no
self-service resend.
