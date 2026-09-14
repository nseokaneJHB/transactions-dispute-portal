# Admin invite accept — duplicate email race at account creation

**Flow:** `docs/user-stories/admin/admin-invite.md` (accept)

**Trigger:** the guarded `UPDATE … accepted_at` succeeds (the invite itself
was valid and unused), but the subsequent `createUser({ name, email:
invite.email, role: ADMIN, email_verified: true })` hits Postgres error
`23505` on `user_email_uq_idx` / `user_email_unique` — an account for that
email was created through some other path between the invite being sent and
being accepted.

**Response:** the global error handler maps Postgres `23505` to `409` via
`CONFLICT_MESSAGE`.

**What the user sees / does next:** the accept page shows the conflict
message. This is distinct from
`docs/user-stories/admin/admin-invite-email-taken.md` (checked once, at send time)
— this is the same race caught again at accept time, one transaction later.
