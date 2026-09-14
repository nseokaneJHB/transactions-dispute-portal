# Admin invite

**Roles:** an existing **admin** sends; the **invitee** (no account yet)
accepts. **Screens:** `/admin/invites` (send + list),
`/admin/invite?token=…` (accept — outside `_authenticated`).

## Send

1. Admin submits an email on `/admin/invites`. Web calls
   **`POST /v1/admin/invites`** (`{ email }`), `authenticate` +
   `authorize(ADMIN)`.
2. Service checks `findUserByEmail` — an account already exists for that email,
   see `docs/user-stories/admin/admin-invite-email-taken.md`.
3. Otherwise: generate a `randomBytes(32)` hex token, `expires_at = now +
   ADMIN_INVITE_EXPIRY_HOURS` (72h), insert an `admin_invite` row
   (`invited_by = caller`), and `sendEmail(buildAdminInviteEmail(...))` with a
   link to `/admin/invite?token=…`.
4. Response `201` with the invite (wire shape **omits the token** — it only
   ever travels in the email).
5. The list below the form (`GET /v1/admin/invites`) refreshes.

A customer session, or too many invite sends from one IP — see
`docs/user-stories/admin/admin-invite-forbidden-non-admin.md` and
`docs/user-stories/admin/admin-invite-rate-limited.md`.

## Accept

1. Invitee opens the emailed link → `/admin/invite?token=…`, enters a display
   name, submits. Web calls **`POST /v1/admin/invites/:token/accept`**
   (`{ name }`, **no auth** — they have no session).
2. Service: `findAdminInviteByToken` looks the token up — see
   `docs/user-stories/admin/admin-invite-token-not-found.md`,
   `docs/user-stories/admin/admin-invite-already-used.md`, and
   `docs/user-stories/admin/admin-invite-token-expired.md` for the ways this step can
   fail.
3. In one transaction: `acceptAdminInvite` — a **guarded** `UPDATE … SET
   accepted_at = now() WHERE token = ? AND accepted_at IS NULL AND expires_at >
   now()` (the race guard, `docs/progress-and-decisions.md` #4/#41) — then
   `createUser({ name, email: invite.email, role: ADMIN, email_verified: true
   })`. The email comes from the invite row, not the request, so the link
   can't be redirected to another address.
4. Response `200`, `redirectUrl: /sign-in`. The new admin then signs in with
   **`docs/user-stories/auth/sign-in.md`** like anyone else — email OTP only, no
   `account` row needed (email-OTP looks up the `user` row directly).

A duplicate email slipping through at `createUser`, or too many accept attempts
from one IP — see `docs/user-stories/admin/admin-invite-accept-email-conflict.md` and
`docs/user-stories/admin/admin-invite-accept-rate-limited.md`.

## Invite list

`GET /v1/admin/invites` — a page of the calling admin's own invites
(`invited_by = caller`), newest first. `status` is **derived, not a column**:
`ACCEPTED` (accepted_at set) / `EXPIRED` (past expires_at, unaccepted) /
`PENDING`. Filtering by `?status=` is translated to a predicate over
`accepted_at` / `expires_at` so page counts stay honest (`statusPredicate` in
`repository/admin-invite.ts`). Supports the shared list query — see
`docs/user-stories/admin/list-search-sort-filter.md`.

No new `AUTH_EVENT` values for invites — the `admin_invite` row's own
`invited_by` / `accepted_at` / timestamps _are_ the audit record.
