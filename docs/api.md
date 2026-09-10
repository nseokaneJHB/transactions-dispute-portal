# API surface

Sketch — refine, don't reinvent. All routes below versioned under `/v1/` (`docs/decisions.md` #18) except health checks.

## Response envelope

Every response is `shared`'s `globalResponseSchema` (`shared/src/schema/global.ts` — `docs/decisions.md` #22): `{ code, message, redirectUrl?, errors? }`, `code` one of `HTTP_CODE` (`shared/src/constant.ts`). Endpoints that return a payload extend it per-endpoint with `data`, e.g. `globalResponseSchema.extend({ data: disputeSchema })` — not every response needs one (a bare `204`/redirect is valid as the base envelope alone). List endpoints use `paginatedGlobalResponseSchema` instead (adds `count`/`total`/`page`/`limit`), extended with `data` the same way. Validation failures populate `errors: [{ field, message }]`.

## The shared list query (`docs/decisions.md` #57)

Every list endpoint's query extends one base (`paginationQuerySchema`): `page`, `limit` (≤ 100), `search` (case-insensitive substring across that list's text columns, trimmed), `from` / `to` (`YYYY-MM-DD`, inclusive, `from ≤ to` or `422`), `order` (`asc` / `desc`, default `desc`). Each endpoint adds a **whitelisted** `sort` — an unlisted value is a `422`, never an interpolated column: transactions `transacted_at | merchant | amount_cents`; disputes `created_at | merchant | amount_cents | status`; admin disputes the same plus `customer`; admin invites `email | status | created_at | expires_at`.

## Auth (email-OTP login — `docs/decisions.md` #21/#37)

Our own routes wrapping the Better Auth server API, so login carries the shared envelope, an `auth_audit_log` trail, and its own per-route rate limit (`docs/decisions.md` #37).

- `POST /v1/auth/otp` — body: `email`. Sends a one-time code. Response is identical whether or not the account exists (no user probing). Writes `OTP_REQUESTED`.
- `POST /v1/auth/otp/verify` — body: `email`, `otp`. Exchanges the code for a session; forwards `Set-Cookie`. Writes `LOGIN_SUCCESS` / `LOGIN_FAILURE` / `OTP_LOCKED`.
- `POST /v1/auth/sign-out` — ends the session; safe to call without one.
- `POST /v1/auth/change-email` — **built.** Body: `newEmail`. Authenticated. Wraps Better Auth's `changeEmail`; an approval link goes to the account's *current* address first (`docs/auth.md` §3). Response is identical whether or not `newEmail` already exists.
- `POST /v1/auth/change-email/confirm` — **built.** Body: `token` (from the approval email, then the verification email). Applies one step of the change; a bad or expired token is a `401`.

## Public, customer-authenticated (Better Auth session — email-OTP login, `docs/decisions.md` #21)

Every route here is gated `authenticate` + `authorize(CUSTOMER)` — an `ADMIN` session gets `403`, not another view of the data.

- `GET /v1/transactions` — **built.** A page of the caller's own transactions. The shared list query above (`search` matches the merchant name; `sort` default `transacted_at`). `paginatedGlobalResponseSchema` + `data: transaction[]` — `count` is the full match total, `total` the page size.
- `GET /v1/transactions/:transactionId` — **built.** One transaction, **only if it belongs to the caller** — another user's row (or a well-formed id that doesn't exist) is a `404`, never a `403`, so ownership can't be probed (`docs/decisions.md` #39). A malformed id is a `422` (UUID params schema).
- `POST /v1/disputes` — **built.** Body: `transactionId`, `reason`, `description`. A second open dispute on the same transaction (`SUBMITTED`/`UNDER_REVIEW`) is a `409` — enforced by the partial unique index + the global error handler, no pre-check, no `Idempotency-Key` (`docs/decisions.md` #40). A transaction that isn't the caller's → `404` (#39). Opens the dispute + writes the first `DisputeAuditLog` row in one transaction.
- `GET /v1/disputes` — **built.** The historic view: a page of the caller's own disputes. The shared list query (`search` matches the description and the disputed merchant; `sort` default `created_at`), plus optional `status` and `transaction_id` filters (the latter drives the transaction detail page's open-dispute check + history list, `docs/decisions.md` #56).
- `GET /v1/disputes/:disputeId` — **built.** One dispute, scoped to the caller (other-user/missing → `404`, malformed id → `422`).
- `POST /v1/disputes/:disputeId/withdraw` — **built.** The caller closes their *own* open dispute (`SUBMITTED` or `UNDER_REVIEW`) — status → `WITHDRAWN`, `resolved_at` set, a `DisputeAuditLog` row written, in one transaction. Another user's dispute / a missing one → `404`; one already closed → `409`. The ownership + open-status check is in the `UPDATE … WHERE` (`docs/decisions.md` #4). Withdrawing frees the transaction for a fresh dispute later (the partial unique index only covers open statuses).

## Admin, admin-session-authenticated (Better Auth session carrying `admin` role — `docs/decisions.md` #16)

Every route here is `authenticate` + `authorize(ADMIN)` — a customer session is a `403`.

- `GET /v1/admin/disputes` — **built.** A page of every customer's disputes for the review queue. The shared list query (`search` also matches the owning customer's name and email; `sort` adds `customer`), optional `status` filter. **With no explicit `sort`** the queue orders as a work list — unresolved first (`status` enum order), oldest of those at the top (`docs/decisions.md` #58). Wire shape is the customer dispute + `user_id` + a nested `customer: { name, email }`.
- `GET /v1/admin/disputes/summary` — **built.** How many disputes sit in each lifecycle status right now — one unfiltered `GROUP BY status`, zero-filled to all five. Drives the review-queue stat cards (`docs/decisions.md` #58). `globalResponseSchema` + `data: { SUBMITTED, UNDER_REVIEW, RESOLVED, REJECTED, WITHDRAWN }`.
- `POST /v1/admin/disputes/:disputeId/review` — **built.** `SUBMITTED → UNDER_REVIEW`. Idempotent — a second call on an already-under-review dispute is a `200` no-op. Writes a `DisputeAuditLog` row, publishes to the customer's ntfy topic (`docs/decisions.md` #41).
- `POST /v1/admin/disputes/:disputeId/resolve` — **built.** The reviewer-decision path; body `{ resolution: RESOLVED | REJECTED, note }`. **Requires `UNDER_REVIEW`** — resolving a still-`SUBMITTED` dispute is a `409` ("move it to review first"). Updates `status`/`resolution_note`/`resolved_by`/`resolved_at`, writes the `DisputeAuditLog` row, publishes to ntfy — one transaction. The legal-from-status check is in the `UPDATE … WHERE`, so concurrent resolves collapse to one write (`docs/decisions.md` #41).
- `GET /v1/admin/invites` — **built.** A page of the calling admin's own invites for the invite-list view. The shared list query (`search` matches the invitee email; `sort` `email | status | created_at | expires_at`), optional `status` filter. `status` is *derived* server-side (`PENDING` / `ACCEPTED` / `EXPIRED` from `accepted_at` / `expires_at`), not a column, so `?status=` is translated to a predicate. Wire shape omits the token.
- `POST /v1/admin/invites` — **built.** An existing admin invites a new admin by `email`; a one-time token goes out in a real invite email (Mailpit for dev/demo). Inviting an address that already has an account is a `409`. No self-service admin signup — an account is only created by accepting an invite (`docs/decisions.md` #16). Response wire shape omits the token; it only ever travels in the emailed link.
- `POST /v1/admin/invites/:token/accept` — **built.** Unauthenticated (the invitee has no session yet) — body is just `name`; the email is taken from the invite, not the request. A missing token is a `404`; an already-used or expired one is a `409`. Creates the account with `admin` role and `email_verified`, marks the invite accepted (guarded `UPDATE … WHERE` so concurrent accepts collapse to one, `docs/decisions.md` #4/#41). Login is still email-OTP from there (`docs/decisions.md` #21).

The dispute lifecycle is forward-only (`SUBMITTED → UNDER_REVIEW → RESOLVED | REJECTED`), plus the customer's own `WITHDRAWN` exit from either open state — no backward edges, terminal states terminal. "Reopen after a rejection" is handled by opening a *new* dispute (the old one stays as an immutable record; the partial unique index only blocks a second *open* dispute), not a backward transition. An admin declining a review and any supervisor-override / assignment model are ruled out of scope — `UNDER_REVIEW` is an unassigned status flag and the admin portal is minimal by design (`docs/decisions.md` #16/#41).

  A customer being able to resolve their own dispute would be a real hole in the authz story, not a shortcut — this keeps the customer and admin auth paths honestly separate.

  This is now the *only* resolve path. The original demo stand-in, `POST /internal/disputes/:id/resolve` (shared-secret `x-internal-token` header, no admin session), is removed — decision 16's open question resolved in favor of removing it, since keeping two live auth mechanisms for the same action was two things to explain instead of one.

## Health

- `GET /healthz` — liveness
- `GET /readyz` — readiness; wired into the k8s manifest's probes (see `docs/scaling-and-resilience.md`)
