# Admin invite

**Roles:** an existing **admin** sends; the **invitee** (no account yet)
accepts. **Screens:** `/admin/invites` (send + list),
`/admin/invite?token=…` (accept — outside `_authenticated`).

## Send

1. Admin submits an email on `/admin/invites`. Web calls
   **`POST /v1/admin/invites`** (`{ email }`), `authenticate` +
   `authorize(ADMIN)`.
2. Service checks `findUserByEmail` — an account already exists for that email,
   see *email already has an account* (below).
3. Otherwise: generate a `randomBytes(32)` hex token, `expires_at = now +
   ADMIN_INVITE_EXPIRY_HOURS` (72h), insert an `admin_invite` row
   (`invited_by = caller`), and `sendEmail(buildAdminInviteEmail(...))` with a
   link to `/admin/invite?token=…`.
4. Response `201` with the invite (wire shape **omits the token** — it only
   ever travels in the email).
5. The list below the form (`GET /v1/admin/invites`) refreshes.

A customer session, or too many invite sends from one IP — see
*forbidden for a non-admin* (below) and
*too many sends from one IP* (below).

## Accept

1. Invitee opens the emailed link → `/admin/invite?token=…`, enters a display
   name, submits. Web calls **`POST /v1/admin/invites/:token/accept`**
   (`{ name }`, **no auth** — they have no session).
2. Service: `findAdminInviteByToken` looks the token up — see
   *token not found* (below),
   *already accepted* (below), and
   *token expired* (below) for the ways this step can
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
from one IP — see *duplicate email race at account creation* (below) and
*too many attempts from one IP* (below).

## Invite list

`GET /v1/admin/invites` — a page of the calling admin's own invites
(`invited_by = caller`), newest first. `status` is **derived, not a column**:
`ACCEPTED` (accepted_at set) / `EXPIRED` (past expires_at, unaccepted) /
`PENDING`. Filtering by `?status=` is translated to a predicate over
`accepted_at` / `expires_at` so the filter stays honest (`statusPredicate` in
`repository/admin-invite.ts`). Supports the shared list query — see
`docs/user-stories/admin/list-search-sort-filter.md`.

No new `AUTH_EVENT` values for invites — the `admin_invite` row's own
`invited_by` / `accepted_at` / timestamps _are_ the audit record.

## Error cases

### Duplicate email race at account creation

**Trigger:** the guarded `UPDATE … accepted_at` succeeds (the invite itself
was valid and unused), but the subsequent `createUser({ name, email:
invite.email, role: ADMIN, email_verified: true })` hits Postgres error
`23505` on `user_email_uq_idx` — an account for that
email was created through some other path between the invite being sent and
being accepted.

**Response:** the global error handler maps Postgres `23505` to `409` via
`CONFLICT_MESSAGE`.

**What the user sees / does next:** the accept page shows the conflict
message. This is distinct from
*Email already has an account* (below) (checked once, at send time)
— this is the same race caught again at accept time, one transaction later.

### Too many attempts from one IP

**Trigger:** too many calls to `POST /v1/admin/invites/:token/accept` from the
same IP within a minute. `docs/user-stories/admin/admin-invite.md` notes the accept endpoint has "own
rate limit" without stating the exact threshold (unlike the send endpoint's
documented `2 × OTP.MAX_ATTEMPTS`).

**Response:** `429` via the shared response envelope.

**What the user sees / does next:** a "too many attempts, try again shortly"
style message on `/admin/invite?token=…`; the invitee waits out the window and
resubmits.

### Already accepted

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

### Email already has an account

**Trigger:** an admin calls `POST /v1/admin/invites` (`{ email }`) for an
address that `findUserByEmail` already resolves to an existing user — customer
or admin.

**Response:** `409`, `"An account already exists for that email."`.

**What the user sees / does next:** the invite form on `/admin/invites` shows
the conflict message; no invite row is created and no email is sent.

### Forbidden for a non-admin

**Trigger:** a customer session calls `POST /v1/admin/invites`. The route is
gated `authenticate` + `authorize(ADMIN)`; `authorize` rejects on role
mismatch (`docs/user-stories.md`'s "Roles" section — `authorize` → `403` on role
mismatch).

**Response:** `403` via the shared response envelope.

**What the user sees / does next:** unreachable through the web UI — a
customer session never sees `/admin/invites` (`_authenticated.tsx` keeps a
customer out of `/admin*`). This is a direct-API-call case only; the customer
stays on their own pages.

### Too many sends from one IP

**Trigger:** more than `2 × OTP.MAX_ATTEMPTS` calls to `POST /v1/admin/invites`
from the same IP within a minute.

**Response:** `429` via the shared response envelope. `docs/user-stories/admin/admin-invite.md`
documents the threshold but not bespoke copy for this case.

**What the user sees / does next:** a "too many attempts, try again shortly"
style message on `/admin/invites`; the admin waits out the window and
resubmits.

### Token expired

**Trigger:** `POST /v1/admin/invites/:token/accept` is called after the
invite's `expires_at` (`ADMIN_INVITE_EXPIRY_HOURS`, 72h from send) has passed,
and the invite was never accepted.

**Response:** `409`, `"expired"`.

**What the user sees / does next:** the accept page shows the expiry message;
the invitee has no account and must ask the inviting admin to send a fresh
invite (`docs/user-stories/admin/admin-invite.md` send step) — there is no
self-service resend.

### Token not found

**Trigger:** `POST /v1/admin/invites/:token/accept` is called with a token
that `findAdminInviteByToken` doesn't find at all — no `admin_invite` row
with that token exists (typo'd link, tampered URL).

**Response:** `404` via the shared response envelope.

**What the user sees / does next:** the accept page shows a not-found style
error; the invitee has no account and must ask the inviting admin to send a
fresh invite (`docs/user-stories/admin/admin-invite.md` send step).
