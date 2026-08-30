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

- `GET /v1/transactions` — paginated, filterable by date range; scoped to current user
- `GET /v1/transactions/:id`
- `POST /v1/disputes` — body: `transactionId`, `reason`, `description`; idempotent — reject with a clear error if the transaction already has an open dispute (`SUBMITTED` or `UNDER_REVIEW`), and treat a duplicate idempotency key as a no-op rather than a second row. This is the answer to "what happens on a client retry/double-click" and doubles as the one-open-dispute-per-transaction guard.
- `GET /v1/disputes` — the historic view: paginated, filterable by status
- `GET /v1/disputes/:id`

## Admin, admin-session-authenticated (Better Auth session carrying `admin` role — `docs/decisions.md` #16)

- `GET /v1/admin/disputes` — disputes needing review, paginated/filterable by status
- `POST /v1/admin/disputes/:id/resolve` — the real reviewer-decision path; body carries the resolution + reason, written to `DisputeAuditLog` same as today
- `POST /v1/admin/invites` — seeded/existing admin invites a new admin by email; sends a real invite email (`docs/auth.md` §3-adjacent, decision 19). No self-service admin signup — an account is only created by accepting an invite
- `POST /v1/admin/invites/:token/accept` — accepts an invite, creates the account with `admin` role. Login is email-OTP for every account, admin or customer, so there's nothing else to set up (`docs/decisions.md` #21)

  A customer being able to resolve their own dispute would be a real hole in the authz story, not a shortcut — this keeps the customer and admin auth paths honestly separate.

  This is now the *only* resolve path. The original demo stand-in, `POST /internal/disputes/:id/resolve` (shared-secret `x-internal-token` header, no admin session), is removed — decision 16's open question resolved in favor of removing it, since keeping two live auth mechanisms for the same action was two things to explain instead of one.

## Health

- `GET /healthz` — liveness
- `GET /readyz` — readiness; wired into the k8s manifest's probes (see `docs/scaling-and-resilience.md`)
