# User stories

An index over `docs/user-stories/` — one file per user-facing story (happy path), plus one file per distinct error/non-happy-path response. Ground truth for the detail is `docs/user-stories/`; this page is the scannable entry point. The folder is split into `auth/` (account flows both roles share), `admin/`, and `client/` (customer-facing). For the request/response contract see `docs/backend-service.md`; for the "why" behind a design choice, `docs/progress-and-decisions.md`.

## Roles

| Role | How the account is created | What they can reach |
| --- | --- | --- |
| **Customer** | Seeded (or, in a real deployment, provisioned by the bank). No self-service signup. | `/transactions`, `/disputes`, `/account` |
| **Admin** | Invite-only — an existing admin sends an invite, the invitee accepts it (`docs/progress-and-decisions.md` #16, #44). No self-service signup. | `/admin` (review queue), `/admin/invites`, `/account` |

Both roles authenticate the same way: **email OTP only** (`docs/backend-service.md`, `docs/progress-and-decisions.md` #21). There is no password, no social login.

Route access is enforced in two places, both reading the same session:

- **API** — every route has `preHandler: [authenticate]` (and `authorize(ROLE)` where role-scoped). `authenticate` reads the Better Auth session cookie; no session → `401` + `redirectUrl: /sign-in`. `authorize` → `403` on role mismatch.
- **Web** — `__root.tsx` `beforeLoad` loads `GET /v1/auth/session` once per navigation and seeds `context.user`. `_authenticated.tsx` redirects to `/sign-in` when there's no user, then keeps a customer out of `/admin` and an admin out of the customer pages (`/account` is shared). `_unauthenticated.tsx` bounces a signed-in user to `/`.

`/` itself is a pure redirector: no session → `/sign-in`; admin → `/admin`; customer → `/transactions`.

## Auth (shared by both roles)

| Flow | Summary | Error cases |
| --- | --- | --- |
| [Sign in (email OTP)](user-stories/auth/sign-in.md) | Any user authenticates with a one-time code emailed to their address — no password, no social login. | [Too many OTP requests from one IP](user-stories/auth/sign-in-otp-rate-limited.md) · [Locked out after too many bad attempts](user-stories/auth/sign-in-otp-locked-out.md) · [Invalid or expired code](user-stories/auth/sign-in-otp-invalid-or-expired.md) |
| [Change sign-in email](user-stories/auth/change-sign-in-email.md) | Any authenticated user swaps their account email through a double opt-in link sent to the current address, then a verification link sent to the new one. | [Too many requests from one IP](user-stories/auth/change-sign-in-email-rate-limited.md) · [Bad or expired confirm token](user-stories/auth/change-sign-in-email-invalid-or-expired-token.md) |

## Admin

| Flow | Summary | Error cases |
| --- | --- | --- |
| [Admin invite](user-stories/admin/admin-invite.md) | An existing admin invites a new admin by email; the invitee accepts via a one-time link and signs in with email OTP like anyone else — no self-service admin signup. | [Email already has an account](user-stories/admin/admin-invite-email-taken.md) · [Forbidden for a non-admin (send)](user-stories/admin/admin-invite-forbidden-non-admin.md) · [Too many sends from one IP](user-stories/admin/admin-invite-rate-limited.md) · [Accept: token not found](user-stories/admin/admin-invite-token-not-found.md) · [already used](user-stories/admin/admin-invite-already-used.md) · [expired](user-stories/admin/admin-invite-token-expired.md) · [duplicate email race](user-stories/admin/admin-invite-accept-email-conflict.md) · [rate limited](user-stories/admin/admin-invite-accept-rate-limited.md) |
| [The review queue](user-stories/admin/admin-review-queue.md) | An admin sees every customer's disputes as a prioritised work list, with stat cards that filter by status. | [Forbidden for a non-admin](user-stories/admin/admin-review-queue-forbidden-non-admin.md) |
| [Move a dispute to review](user-stories/admin/admin-move-to-review.md) | An admin moves a `SUBMITTED` dispute into `UNDER_REVIEW`, notifying the customer live. | [Not found](user-stories/admin/admin-move-to-review-not-found.md) · [Already closed](user-stories/admin/admin-move-to-review-already-closed.md) · [Forbidden for a non-admin](user-stories/admin/admin-move-to-review-forbidden-non-admin.md) |
| [Resolve or reject a dispute](user-stories/admin/admin-resolve-or-reject.md) | An admin closes an `UNDER_REVIEW` dispute as `RESOLVED` or `REJECTED` with a note, notifying the customer live. | [Not found](user-stories/admin/admin-resolve-not-found.md) · [Requires under review first](user-stories/admin/admin-resolve-requires-under-review.md) · [Already closed](user-stories/admin/admin-resolve-already-closed.md) · [Forbidden for a non-admin](user-stories/admin/admin-resolve-forbidden-non-admin.md) |
| [Shared list query (admin side)](user-stories/admin/list-search-sort-filter.md) | The search/filter/sort/paginate contract for `GET /v1/admin/disputes` and `GET /v1/admin/invites`. | [Invalid date range](user-stories/admin/list-search-sort-filter-invalid-date-range.md) · [Invalid sort column](user-stories/admin/list-search-sort-filter-invalid-sort-column.md) |

## Client (customer-facing)

| Flow | Summary | Error cases |
| --- | --- | --- |
| [Browse transactions](user-stories/client/browse-transactions.md) | A customer lists and views their own transactions, seeing any open dispute or dispute history alongside. | [Not found (missing or another customer's)](user-stories/client/browse-transactions-not-found.md) · [Malformed id](user-stories/client/browse-transactions-malformed-id.md) |
| [Open a dispute](user-stories/client/open-a-dispute.md) | A customer opens a dispute against one of their own transactions, shown only when it has no open dispute already. | [Transaction not found](user-stories/client/open-a-dispute-transaction-not-found.md) · [Duplicate open dispute rejected](user-stories/client/open-a-dispute-duplicate-rejected.md) · [Forbidden for a non-customer](user-stories/client/open-a-dispute-forbidden-non-customer.md) |
| [View disputes](user-stories/client/view-disputes.md) | A customer lists and views their own disputes, including status, reviewer notes, and the withdraw action while open. | [Not found (missing or another customer's)](user-stories/client/view-disputes-not-found.md) · [Malformed id](user-stories/client/view-disputes-malformed-id.md) |
| [Withdraw a dispute](user-stories/client/withdraw-a-dispute.md) | A customer closes their own open dispute early, via a two-click confirm. | [Not found (missing or another customer's)](user-stories/client/withdraw-a-dispute-not-found.md) · [Already closed](user-stories/client/withdraw-a-dispute-already-closed.md) · [Forbidden for a non-customer](user-stories/client/withdraw-a-dispute-forbidden-non-customer.md) |
| [Live dispute-status notifications](user-stories/client/live-dispute-notifications.md) | A customer's authenticated session subscribes to a live per-user ntfy stream, toasting on any admin transition to their disputes. | [Dropped or errored stream](user-stories/client/live-dispute-notifications-stream-error.md) |
| [Shared list query (client side)](user-stories/client/list-search-sort-filter.md) | The search/filter/sort/paginate contract for `GET /v1/transactions` and `GET /v1/disputes`. | [Invalid date range](user-stories/client/list-search-sort-filter-invalid-date-range.md) · [Invalid sort column](user-stories/client/list-search-sort-filter-invalid-sort-column.md) |
