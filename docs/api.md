# API surface

Sketch — refine, don't reinvent. All routes below versioned under `/v1/` (`docs/decisions.md` #18) except health checks.

## Response envelope

Every response is `shared`'s `globalResponseSchema` (`shared/src/schema/global.ts` — `docs/decisions.md` #22): `{ code, message, redirectUrl?, errors? }`, `code` one of `HTTP_CODE` (`shared/src/constant.ts`). Endpoints that return a payload extend it per-endpoint with `data`, e.g. `globalResponseSchema.extend({ data: disputeSchema })` — not every response needs one (a bare `204`/redirect is valid as the base envelope alone). List endpoints use `paginatedGlobalResponseSchema` instead (adds `count`/`total`/`page`/`limit`), extended with `data` the same way. Validation failures populate `errors: [{ field, message }]`.

## Auth (email-OTP login — `docs/decisions.md` #21/#37)

Our own routes wrapping the Better Auth server API, so login carries the shared envelope, an `auth_audit_log` trail, and its own per-route rate limit (`docs/decisions.md` #37).

- `POST /v1/auth/otp` — body: `email`. Sends a one-time code. Response is identical whether or not the account exists (no user probing). Writes `OTP_REQUESTED`.
- `POST /v1/auth/otp/verify` — body: `email`, `otp`. Exchanges the code for a session; forwards `Set-Cookie`. Writes `LOGIN_SUCCESS` / `LOGIN_FAILURE` / `OTP_LOCKED`.
- `POST /v1/auth/sign-out` — ends the session; safe to call without one.

## Public, customer-authenticated (Better Auth session — email-OTP login, `docs/decisions.md` #21)

Every route here is gated `authenticate` + `authorize(CUSTOMER)` — an `ADMIN` session gets `403`, not another view of the data.

- `GET /v1/transactions` — **built.** A page of the caller's own transactions, ordered on `transacted_at`. Query: `from` / `to` (`YYYY-MM-DD`, inclusive, `from ≤ to`), `order` (`asc` / `desc`, default `desc`), `page`, `limit` (≤ 100). `paginatedGlobalResponseSchema` + `data: transaction[]` — `count` is the full match total, `total` the page size.
- `GET /v1/transactions/:transactionId` — **built.** One transaction, **only if it belongs to the caller** — another user's row (or a well-formed id that doesn't exist) is a `404`, never a `403`, so ownership can't be probed (`docs/decisions.md` #39). A malformed id is a `422` (UUID params schema).
- `POST /v1/disputes` — **built.** Body: `transactionId`, `reason`, `description`. A second open dispute on the same transaction (`SUBMITTED`/`UNDER_REVIEW`) is a `409` — enforced by the partial unique index + the global error handler, no pre-check, no `Idempotency-Key` (`docs/decisions.md` #40). A transaction that isn't the caller's → `404` (#39). Opens the dispute + writes the first `DisputeAuditLog` row in one transaction.
- `GET /v1/disputes` — **built.** The historic view: a page of the caller's own disputes, optional `status` filter, `order`/`page`/`limit`.
- `GET /v1/disputes/:disputeId` — **built.** One dispute, scoped to the caller (other-user/missing → `404`, malformed id → `422`).

## Admin, admin-session-authenticated (Better Auth session carrying `admin` role — `docs/decisions.md` #16)

Every route here is `authenticate` + `authorize(ADMIN)` — a customer session is a `403`.

- `GET /v1/admin/disputes` — **built.** A page of every customer's disputes for the review queue, optional `status` filter. Wire shape is the customer dispute + `user_id`.
- `POST /v1/admin/disputes/:disputeId/review` — **built.** `SUBMITTED → UNDER_REVIEW`. Idempotent — a second call on an already-under-review dispute is a `200` no-op. Writes a `DisputeAuditLog` row, publishes to the customer's ntfy topic (`docs/decisions.md` #41).
- `POST /v1/admin/disputes/:disputeId/resolve` — **built.** The reviewer-decision path; body `{ resolution: RESOLVED | REJECTED, note }`. **Requires `UNDER_REVIEW`** — resolving a still-`SUBMITTED` dispute is a `409` ("move it to review first"). Updates `status`/`resolution_note`/`resolved_by`/`resolved_at`, writes the `DisputeAuditLog` row, publishes to ntfy — one transaction. The legal-from-status check is in the `UPDATE … WHERE`, so concurrent resolves collapse to one write (`docs/decisions.md` #41).
- `POST /v1/admin/invites` — *not built.* Seeded/existing admin invites a new admin by email; sends a real invite email (`docs/auth.md` §3-adjacent, decision 19). No self-service admin signup — an account is only created by accepting an invite.
- `POST /v1/admin/invites/:token/accept` — *not built.* Accepts an invite, creates the account with `admin` role. Login is email-OTP for every account (`docs/decisions.md` #21).

The dispute lifecycle is forward-only today (`SUBMITTED → UNDER_REVIEW → RESOLVED | REJECTED`, no backward edges, terminal states terminal). Real-world edge cases — reopen after a rejection, an admin declining a review, customer withdrawal — are a deliberate open design item (`docs/decisions.md` #41).

  A customer being able to resolve their own dispute would be a real hole in the authz story, not a shortcut — this keeps the customer and admin auth paths honestly separate.

  This is now the *only* resolve path. The original demo stand-in, `POST /internal/disputes/:id/resolve` (shared-secret `x-internal-token` header, no admin session), is removed — decision 16's open question resolved in favor of removing it, since keeping two live auth mechanisms for the same action was two things to explain instead of one.

## Health

- `GET /healthz` — liveness
- `GET /readyz` — readiness; wired into the k8s manifest's probes (see `docs/scaling-and-resilience.md`)
