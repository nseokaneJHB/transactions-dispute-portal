# System flows

How the portal actually behaves, walked through end to end — one section per
flow, each annotated with the role that drives it, the screens, the API calls,
what changes in the database, and every side effect (email, ntfy, audit rows).

For the _why_ behind a decision, follow the `docs/decisions.md #NN` pointers.
For the request/response contract, see `docs/api.md`. For the entities, see
`docs/domain-model.md`.

---

## Roles

| Role | How the account is created | What they can reach |
| --- | --- | --- |
| **Customer** | Seeded (or, in a real deployment, provisioned by the bank). No self-service signup. | `/transactions`, `/disputes`, `/account` |
| **Admin** | Invite-only — an existing admin sends an invite, the invitee accepts it (`docs/decisions.md` #16, #44). No self-service signup. | `/admin` (review queue), `/admin/invites`, `/account` |

Both roles authenticate the same way: **email OTP only** (`docs/auth.md`,
`docs/decisions.md` #21). There is no password, no social login.

Route access is enforced in two places, both reading the same session:

- **API** — every route has `preHandler: [authenticate]` (and `authorize(ROLE)`
  where role-scoped). `authenticate` reads the Better Auth session cookie; no
  session → `401` + `redirectUrl: /sign-in`. `authorize` → `403` on role
  mismatch.
- **Web** — `__root.tsx` `beforeLoad` loads `GET /v1/auth/session` once per
  navigation and seeds `context.user`. `_authenticated.tsx` redirects to
  `/sign-in` when there's no user, then keeps a customer out of `/admin` and an
  admin out of the customer pages (`/account` is shared). `_unauthenticated.tsx`
  bounces a signed-in user to `/`.

`/` itself is a pure redirector: no session → `/sign-in`; admin → `/admin`;
customer → `/transactions`.

---

## Flow 1 — Sign in (email OTP)

**Role:** anyone. **Screens:** `/sign-in` (two steps on one route, switched by
the `?email=` search param).

### Step 1 — request a code

1. User enters their email, submits. Web calls **`POST /v1/auth/otp`**
   (`{ email }`), rate-limited to `OTP.MAX_ATTEMPTS` per IP per minute.
2. Service calls Better Auth `sendVerificationOTP` (type `sign-in`). Better Auth
   generates a 6-digit code, stores it **hashed** in `verification` with a
   10-minute expiry, and calls our `sendVerificationOTP` hook →
   `buildOtpEmailSignInRequest` → `sendEmail` (SMTP / Mailpit).
3. Service writes an `auth_audit_log` row: `event: OTP_REQUESTED`, the email, IP,
   user-agent.
4. Response is **the same whether or not the account exists** — `"If an account
   exists for {email}, a sign-in code is on its way."` — plus
   `redirectUrl: /sign-in?email={email}`. Anti-enumeration.
5. Web navigates to `/sign-in?email=…`, which renders step 2.

Because `emailOTP({ disableSignUp: true })` is set, a code for an unknown email
is generated and emailed to nobody useful — sign-in never creates an account.

### Step 2 — verify the code

1. User enters the code, submits. Web calls **`POST /v1/auth/otp/verify`**
   (`{ email, otp }`), rate-limited to `2 × OTP.MAX_ATTEMPTS` per IP per minute
   (so Better Auth's own 5-attempts-per-code lockout trips first).
2. Service calls Better Auth `signInEmailOTP` (`asResponse: true` to capture the
   `Set-Cookie`). On success Better Auth creates the `session` row and returns
   the session cookie; the service forwards every `Set-Cookie` header onto the
   reply.
3. Service inspects the Better Auth response and writes one `auth_audit_log` row:
   - 2xx → `LOGIN_SUCCESS` (with `user_id`)
   - body code `TOO_MANY_ATTEMPTS` → `OTP_LOCKED`
   - otherwise → `LOGIN_FAILURE`
4. Response:
   - success → `200 "Signed in."`, `redirectUrl: /`
   - locked → `429`, "that code is now void, request a new one"
   - bad/expired → `401`, "invalid or expired", `redirectUrl: /sign-in?email=…`
5. Web, on success, invalidates the router (re-runs `__root` `beforeLoad`, which
   now sees a session) and navigates to `/`, which redirects by role.

### Side effect — new-device login alert (background)

Whenever Better Auth inserts a `session` row, its `databaseHooks.session.create.after`
fires `alertOnNewDeviceLogin(session)` — **fire-and-forget, never awaited into
the login response** (`docs/auth.md` §3, `docs/decisions.md` #46):

- No `user_agent` on the session → skip (only non-browser clients omit it).
- `hasKnownDeviceSession` — any earlier session for this `user_id` with the same
  `user_agent`? → skip.
- Otherwise → `buildNewDeviceLoginEmail` (IP, user-agent, timestamp, a sign-in
  link) → `sendEmail`.

The seed gives the admin and `customer@example.com` one session on a known
user-agent so this stays quiet on a demo login from the same browser.

---

## Flow 2 — Change sign-in email (two-step, double opt-in)

**Role:** any authenticated user. **Screens:** `/account` (request),
`/account/email-change?token=…` (confirm — reached from an emailed link, works
with or without a session).

1. On `/account` the user submits a new address. Web calls
   **`POST /v1/auth/change-email`** (`{ newEmail }`), `authenticate` required,
   rate-limited `OTP.MAX_ATTEMPTS`/min.
2. Service calls Better Auth `changeEmail`. Better Auth emails an **approval link
   to the _current_ address** (`sendChangeEmailConfirmation` →
   `buildEmailChangeApprovalEmail`), token expiry
   `EMAIL_CHANGE_TOKEN_EXPIRY_MINUTES` (30 min). Nothing changes yet.
3. Service writes `auth_audit_log`: `event: EMAIL_CHANGE_REQUESTED`.
4. Response is deliberately vague ("if that address is available, we've emailed
   an approval link to your current address") — same whether `newEmail` is taken.
5. User opens the approval link → `/account/email-change?token=…` → clicks
   confirm → **`POST /v1/auth/change-email/confirm`** (`{ token }`, no auth) →
   Better Auth `verifyEmail`. This step applies the approval; Better Auth then
   emails a **verification link to the _new_ address** (`emailVerification.
   sendVerificationEmail` → `buildEmailVerificationEmail`).
6. User opens the second link → same `/account/email-change` page, same
   `confirm` endpoint with the new token → the `user.email` column is updated.
7. Any bad/expired token → `401`, "start the change again".

The two links use the same frontend route and the same confirm endpoint; the
page just tells the user to follow whichever email is still waiting.

---

## Flow 3 — Admin invite

**Roles:** an existing **admin** sends; the **invitee** (no account yet) accepts.
**Screens:** `/admin/invites` (send + list), `/admin/invite?token=…` (accept —
outside `_authenticated`).

### Send

1. Admin submits an email on `/admin/invites`. Web calls
   **`POST /v1/admin/invites`** (`{ email }`), `authenticate` + `authorize(ADMIN)`,
   own rate limit `2 × OTP.MAX_ATTEMPTS`/min.
2. Service checks `findUserByEmail` → `409 "An account already exists for that
   email."` if taken.
3. Otherwise: generate a `randomBytes(32)` hex token, `expires_at = now +
   ADMIN_INVITE_EXPIRY_HOURS` (72h), insert an `admin_invite` row
   (`invited_by = caller`), and `sendEmail(buildAdminInviteEmail(...))` with a
   link to `/admin/invite?token=…`.
4. Response `201` with the invite (wire shape **omits the token** — it only ever
   travels in the email).
5. The list below the form (`GET /v1/admin/invites`) refreshes.

### Accept

1. Invitee opens the emailed link → `/admin/invite?token=…`, enters a display
   name, submits. Web calls **`POST /v1/admin/invites/:token/accept`**
   (`{ name }`, **no auth** — they have no session), own rate limit.
2. Service: `findAdminInviteByToken` → `404` if missing; `accepted_at` set →
   `409 "already been used"`; past `expires_at` → `409 "expired"`.
3. In one transaction: `acceptAdminInvite` — a **guarded** `UPDATE … SET
   accepted_at = now() WHERE token = ? AND accepted_at IS NULL AND expires_at >
   now()` (the race guard, `docs/decisions.md` #4/#41; empty `RETURNING` →
   `409`) — then `createUser({ name, email: invite.email, role: ADMIN,
   email_verified: true })`. The email comes from the invite row, not the
   request, so the link can't be redirected to another address.
4. A duplicate email at `createUser` → Postgres `23505` → the global error
   handler → `409` via `CONFLICT_MESSAGE` (`user_email_uq_idx` /
   `user_email_unique`).
5. Response `200`, `redirectUrl: /sign-in`. The new admin then signs in with
   **Flow 1** like anyone else — email OTP only, no `account` row needed
   (email-OTP looks up the `user` row directly).

### Invite list

`GET /v1/admin/invites` — a page of the calling admin's own invites
(`invited_by = caller`), newest first. `status` is **derived, not a column**:
`ACCEPTED` (accepted_at set) / `EXPIRED` (past expires_at, unaccepted) /
`PENDING`. Filtering by `?status=` is translated to a predicate over
`accepted_at` / `expires_at` so page counts stay honest (`statusPredicate` in
`repository/admin-invite.ts`). Supports the shared list query (below).

No new `AUTH_EVENT` values for invites — the `admin_invite` row's own
`invited_by` / `accepted_at` / timestamps _are_ the audit record.

---

## Flow 4 — Customer: browse transactions

**Role:** customer. **Screens:** `/transactions` (list), `/transactions/$id`
(detail).

- **List** — `GET /v1/transactions`, scoped to the caller in the SQL `WHERE`
  (`docs/decisions.md` #39), never a post-fetch filter. Supports the shared list
  query: `search` (merchant name), `from`/`to` (on `transacted_at`),
  `sort` ∈ {`transacted_at`, `merchant`, `amount_cents`}, `order`, `page`,
  `limit`. Default order `transacted_at` desc, `id` desc as a stable tiebreak.
  The response envelope's `count` is the full match total, `total` is the rows on
  this page.
- **Detail** — `GET /v1/transactions/:transactionId`. Another user's id or a
  missing one → `404` (not `403` — no existence leak); a malformed id → `422`.
  The loader **also** fetches `GET /v1/disputes?transaction_id=…` (limit 100):
  - an **open** dispute on this transaction → renders a "View dispute" link, the
    open-a-dispute form is **not** mounted;
  - any **closed** disputes → a "Dispute history" list underneath.

---

## Flow 5 — Customer: open a dispute

**Role:** customer. **Screen:** `/transactions/$id` (the form on the detail
page). **Entry:** only shown when the transaction has no open dispute.

1. User picks a `reason` (`DISPUTE_REASON`) and writes a description (1–2000
   chars, enforced by zod). Web calls **`POST /v1/disputes`**
   (`{ transactionId, reason, description }`), `authenticate` + `authorize(CUSTOMER)`.
2. Service: `findUserTransactionById` — not the caller's transaction → `404`
   (`docs/decisions.md` #39).
3. In one transaction: `createDispute` (status defaults to `SUBMITTED`) + the
   first `dispute_audit_log` row (`null → SUBMITTED`, "Dispute opened by the
   customer.").
4. **The one-open-dispute-per-transaction rule is the partial unique index
   `dispute_open_per_transaction_uq_idx` plus the global 409 handler** — there is
   no pre-check query and no try/catch in the service (`docs/decisions.md` #40).
   A second open dispute → Postgres `23505` → `409 "This transaction already has
   an open dispute."` Concurrent submits collapse to exactly one `201` + the
   rest `409`.
5. Response `201` with the dispute (wire shape omits `user_id` / `resolved_by`,
   nests the disputed transaction's `merchant_name` / `amount_cents` /
   `transacted_at`, `docs/decisions.md` #53).
6. Web refreshes the disputes query and navigates to `/disputes/$newId`.

No ntfy on submit — notifications are the admin transitions only
(`docs/notifications.md`).

---

## Flow 6 — Customer: view disputes

**Role:** customer. **Screens:** `/disputes` (list), `/disputes/$id` (detail).

- **List** — `GET /v1/disputes`, caller-scoped. Shared list query: `search`
  (description **and** the disputed merchant's name), `from`/`to` (on
  `created_at`), `status`, `transaction_id`,
  `sort` ∈ {`created_at`, `merchant`, `amount_cents`, `status`}, `order`,
  `page`, `limit`. `sort=status` orders by the pgEnum's declaration order, which
  is lifecycle order. Because `search` can touch the joined `transaction` table,
  the page count is an explicit joined `COUNT(*)` rather than `$count`.
- **Detail** — `GET /v1/disputes/:disputeId`, caller-scoped; other-user or
  missing → `404`, malformed → `422`. Shows the reason, status, the customer's
  own description, the disputed transaction (links to `/transactions/$id`), the
  reviewer's note once closed, and — while the dispute is open — the withdraw
  action.

---

## Flow 7 — Customer: withdraw a dispute

**Role:** customer. **Screen:** `/disputes/$id` ("Changed your mind?" card,
shown only while the dispute is open). Two-click confirm in the UI.

1. Web calls **`POST /v1/disputes/:disputeId/withdraw`**, `authenticate` +
   `authorize(CUSTOMER)`.
2. The whole handler runs in one transaction:
   - `findUserDisputeById(…, { lockForUpdate: true })` — `SELECT … FOR UPDATE`,
     so a concurrent admin transition can't change the status between this read
     and the write. Not the caller's / missing → `404`.
   - status not open (`isOpenDisputeStatus`) → `409 "already closed"`.
   - `withdrawDispute` — guarded `UPDATE … SET status = 'WITHDRAWN', resolved_at
     = now() WHERE id = ? AND user_id = ? AND status IN (open statuses)`
     (`docs/decisions.md` #45). Empty `RETURNING` → `409`.
   - `dispute_audit_log` row: `{from_status} → WITHDRAWN`, "Withdrawn by the
     customer."
3. Response `200` with the updated dispute. Web refreshes the disputes list +
   this dispute's query.

`WITHDRAWN` is terminal — there is no reopen (`docs/decisions.md` #45; the
reopen-after-close question is an open design item, see
`docs/decisions.md`'s end note).

---

## Flow 8 — Customer: live dispute-status notifications

**Role:** customer (admins don't subscribe). **Always on** while any
`_authenticated` page is mounted.

`_authenticated.tsx` calls `useDisputeNotifications(user.id)` for customers. It
opens a browser `EventSource` on `${VITE_NTFY_URL}/dispute-updates-{userId}/sse`
— the **same per-user topic** the API publishes to on admin transitions. On a
message it toasts ("One of your disputes is now Under review") and
`refreshQuery`s the disputes list + router. A stream error just closes the
connection; a dropped stream never affects the page. Best-effort, self-hosted
(`docs/notifications.md`).

---

## Flow 9 — Admin: the review queue

**Role:** admin. **Screen:** `/admin`.

### Stat cards + priority ordering

- The page loads two things in parallel: `GET /v1/admin/disputes` (the page of
  rows) and `GET /v1/admin/disputes/summary` (unfiltered count per status).
- **Stat cards** — one per status, in lifecycle order. The two open statuses
  (`SUBMITTED`, `UNDER_REVIEW`) render as a solid-filled alert whenever their
  count is non-zero — the reviewer's backlog. Clicking a card filters the queue
  to that status (`?status=`); clicking the active one clears it. The summary
  query key is a prefix of the list key, so a review/resolve mutation's cache
  removal refreshes it too.
- **Default ordering** — with no explicit `?sort`, the queue is a work list:
  `ORDER BY status ASC, created_at ASC, id DESC`. The `dispute_status` pgEnum is
  declared in lifecycle order, so `SUBMITTED` / `UNDER_REVIEW` sort ahead of the
  terminal states, oldest-first so nothing rots at the bottom. Any explicit
  `sort` overrides this entirely.

### The list

`GET /v1/admin/disputes`, `authenticate` + `authorize(ADMIN)` — a customer
session → `403`. Every customer's disputes (no owner scope). Shared list query,
with a **wider `sort` whitelist** than the customer's own list —
`ADMIN_DISPUTE_SORT` adds `customer` (the owning user's name), since a reviewer
benefits from grouping one person's disputes together. `search` matches the
description, the disputed merchant, **and** the customer's name and email. Wire
shape = the customer shape + `user_id` + the owning `customer` `{ name, email }`
(joined in, `docs/decisions.md` #53). Each row's action button opens a modal.

---

## Flow 10 — Admin: move a dispute to review

**Role:** admin. **Screen:** `/admin` → row modal → "Move to review" (shown only
for a `SUBMITTED` dispute).

1. Web calls **`POST /v1/admin/disputes/:disputeId/review`**, `authenticate` +
   `authorize(ADMIN)`.
2. Service: `findDisputeById` (unscoped) → `404` if missing. Already
   `UNDER_REVIEW` → idempotent `200` no-op. Any terminal status → `409 "already
   closed"`.
3. In one transaction: `markDisputeUnderReview` — guarded `UPDATE … SET status =
   'UNDER_REVIEW' WHERE id = ? AND status = 'SUBMITTED'` (`docs/decisions.md`
   #41; empty `RETURNING` → `409`) — plus a `dispute_audit_log` row
   (`SUBMITTED → UNDER_REVIEW`, actor = reviewer).
4. **`publishDisputeUpdate(ownerId, 'UNDER_REVIEW')`** — fire-and-forget ntfy
   POST to the owner's topic (2s timeout, failures logged not thrown). This is
   what surfaces the customer's toast in **Flow 8**.
5. Response `200` with the dispute (transaction + customer merged in from the
   pre-write read). Web refreshes the review queue.

Concurrent reviews collapse to one write / one audit row.

---

## Flow 11 — Admin: resolve or reject a dispute

**Role:** admin. **Screen:** `/admin` → row modal → the decision form (shown only
for an `UNDER_REVIEW` dispute).

1. Admin picks `RESOLVED` or `REJECTED` (`ADMIN_RESOLUTION_STATUS` — resolve
   **cannot** target `WITHDRAWN`) and writes a note (1–2000 chars, shown to the
   customer). Web calls **`POST /v1/admin/disputes/:disputeId/resolve`**
   (`{ resolution, note }`), `authenticate` + `authorize(ADMIN)`.
2. Service: `findDisputeById` → `404` if missing. Still `SUBMITTED` → `409 "move
   it to review first"` (resolve **requires** `UNDER_REVIEW`, `docs/decisions.md`
   #41). Already terminal → `409 "already closed"`.
3. In one transaction: `resolveDispute` — guarded `UPDATE … SET status =
   {resolution}, resolution_note = {note}, resolved_by = {reviewer}, resolved_at
   = now() WHERE id = ? AND status = 'UNDER_REVIEW'` (empty `RETURNING` → `409`)
   — plus a `dispute_audit_log` row (`UNDER_REVIEW → {resolution}`, the note).
4. **`publishDisputeUpdate(ownerId, {resolution})`** — ntfy, as Flow 10.
5. Response `200`. Web refreshes the review queue and closes the modal.

Concurrent resolves collapse to one `200` + the rest `409`; one audit row, one
`resolved_by`.

The full lifecycle is therefore forward-only:
`SUBMITTED → UNDER_REVIEW → RESOLVED | REJECTED`, with `SUBMITTED / UNDER_REVIEW
→ WITHDRAWN` available to the customer (Flow 7). Every closed dispute has a
complete `dispute_audit_log` chain.

---

## Flow 12 — Health probes

**Role:** infra, unauthenticated, unversioned (`docs/decisions.md` #18). Excluded
from request logging.

- `GET /healthz` — liveness. `200` normally; `503` while the process is draining
  (`isShuttingDown()`, flipped by `close-with-grace` on `SIGTERM`/`SIGINT`).
- `GET /readyz` — readiness. `503` while draining **or** if `SELECT 1` doesn't
  answer within 2s (`withTimeout`); otherwise `200` with `uptimeSeconds`.

`compose.yml` runs the migration runner before the dev server starts, so a fresh
`docker compose up` applies the schema then serves.

---

## Cross-cutting: the shared list query

`GET /v1/transactions`, `GET /v1/disputes`, `GET /v1/admin/disputes`,
`GET /v1/admin/invites` all extend `paginationQuerySchema`:

| Key | Meaning |
| --- | --- |
| `page`, `limit` | 1-based page + size (default 1 / 10, `limit` capped at 100). Always present in the URL. |
| `search` | case-insensitive substring across that list's text columns; `%` / `_` / `\` the user types are matched literally. Omitted from the URL unless set. |
| `from`, `to` | inclusive `YYYY-MM-DD` bounds on the list's date column (`from` snaps to start-of-day, `to` to end-of-day). `from > to` → `422`. |
| `sort` | a **whitelisted** column name (`TRANSACTION_SORT` / `DISPUTE_SORT` / `ADMIN_DISPUTE_SORT` / `ADMIN_INVITE_SORT`). An unlisted value → `422`, never an interpolated column. |
| `order` | `asc` / `desc`; defaults to `desc`. Omitted from the URL unless set. |

The string→`PgColumn` binding lives in each repository (`SORT_COLUMN`), typed
`Record<XSort, …>` so it can't drift from the whitelist; the whitelist itself is
in `shared`. On the web side, `sort` / `order` are driven by **clicking a column
header** (`SortableHeader`) — a 3-state cycle: 1st click desc, 2nd asc, 3rd
clears — not a dropdown. `ListControls` is the search/date/status bar and applies
on submit. URL key order is fixed by a custom `stringifySearch` in `router.tsx`:
`page, limit, search, status, …, from, to, sort, order`.

The response envelope for every list: `count` = full match total,
`total` = rows on this page, plus `page` / `limit`.
