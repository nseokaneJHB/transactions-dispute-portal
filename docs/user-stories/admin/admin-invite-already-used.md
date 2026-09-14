# Admin invite accept — already accepted

**Flow:** `docs/user-stories/admin/admin-invite.md` (accept)

**Trigger:** `POST /v1/admin/invites/:token/accept` is called with a token
whose `admin_invite.accepted_at` is already set — either the invitee already
completed the flow once, or two accept requests raced and this one lost the
guarded `UPDATE` (`docs/progress-and-decisions.md` #4/#41; an empty
`RETURNING` from the guarded update also lands here).

**Response:** `409`, `"already been used"`.

**What the user sees / does next:** the accept page shows the conflict
message. If the invitee already has an account from an earlier successful
accept, they sign in instead (`docs/user-stories/auth/sign-in.md`); if this was a
concurrent double-submit, exactly one of the two requests succeeded and
created the account.
