# User stories

An index over `docs/user-stories/`: one file per user-facing flow, with the happy path first and every distinct error response under that file's **Error cases** section. Ground truth for the detail is `docs/user-stories/`; this page is the scannable entry point. The folder is split into `auth/` (account flows both roles share), `admin/`, and `client/` (customer-facing). For the request/response contract see `docs/backend-service.md`; for the "why" behind a design choice, `docs/progress-and-decisions.md`.

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
| [Sign in (email OTP)](user-stories/auth/sign-in.md) | Any user authenticates with a one-time code emailed to their address — no password, no social login. | Too many OTP requests from one IP · Locked out after too many bad attempts · Invalid or expired code |
| [Change sign-in email](user-stories/auth/change-sign-in-email.md) | Any authenticated user swaps their account email through a double opt-in link sent to the current address, then a verification link sent to the new one. | Too many requests from one IP · Bad or expired confirm token |

## Admin

| Flow | Summary | Error cases |
| --- | --- | --- |
| [Admin invite](user-stories/admin/admin-invite.md) | An existing admin invites a new admin by email; the invitee accepts via a one-time link and signs in with email OTP like anyone else — no self-service admin signup. | Email already has an account · Forbidden for a non-admin (send) · Too many sends from one IP · Accept: token not found · already used · expired · duplicate email race · rate limited |
| [The review queue](user-stories/admin/admin-review-queue.md) | An admin sees every customer's disputes as a prioritised work list, with stat cards that filter by status. | Forbidden for a non-admin |
| [Move a dispute to review](user-stories/admin/admin-move-to-review.md) | An admin moves a `SUBMITTED` dispute into `UNDER_REVIEW`, notifying the customer live. | Not found · Already closed · Forbidden for a non-admin |
| [Resolve or reject a dispute](user-stories/admin/admin-resolve-or-reject.md) | An admin closes an `UNDER_REVIEW` dispute as `RESOLVED` or `REJECTED` with a note, notifying the customer live. | Not found · Requires under review first · Already closed · Forbidden for a non-admin |
| [Shared list query (admin side)](user-stories/admin/list-search-sort-filter.md) | The search/filter/sort/paginate contract for `GET /v1/admin/disputes` and `GET /v1/admin/invites`. | Invalid date range · Invalid sort column |

## Client (customer-facing)

| Flow | Summary | Error cases |
| --- | --- | --- |
| [Browse transactions](user-stories/client/browse-transactions.md) | A customer lists and views their own transactions, seeing any open dispute or dispute history alongside. | Not found (missing or another customer's) · Malformed id |
| [Open a dispute](user-stories/client/open-a-dispute.md) | A customer opens a dispute against one of their own transactions, shown only when it has no open dispute already. | Transaction not found · Duplicate open dispute rejected · Forbidden for a non-customer |
| [View disputes](user-stories/client/view-disputes.md) | A customer lists and views their own disputes, including status, reviewer notes, and the withdraw action while open. | Not found (missing or another customer's) · Malformed id |
| [Withdraw a dispute](user-stories/client/withdraw-a-dispute.md) | A customer closes their own open dispute early, via a two-click confirm. | Not found (missing or another customer's) · Already closed · Forbidden for a non-customer |
| [Live dispute-status notifications](user-stories/client/live-dispute-notifications.md) | A customer's authenticated session subscribes to a live per-user ntfy stream, toasting on any admin transition to their disputes. | Dropped or errored stream |
| [Shared list query (client side)](user-stories/client/list-search-sort-filter.md) | The search/filter/sort/paginate contract for `GET /v1/transactions` and `GET /v1/disputes`. | Invalid date range · Invalid sort column |
