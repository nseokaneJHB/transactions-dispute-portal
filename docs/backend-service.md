# Backend service

The `api` package: Fastify + Drizzle + Postgres, Better Auth for email-OTP login. Covers the API surface, how login credentials are verified, and how the dispute/audit model is enforced in code. For *why* each decision was made, see `docs/progress-and-decisions.md`; for the requirement each satisfies, see `docs/requirements.md`. For the per-file map of what's on disk, see `docs/codebase-index.md`'s `## api` section — this doc doesn't re-list files.

## API surface

Sketch — refine, don't reinvent. All routes below versioned under `/v1/` (`docs/progress-and-decisions.md` #18) except health checks.

### Response envelope

Every response is `shared`'s `globalResponseSchema` (`shared/src/schema/global.ts` — `docs/progress-and-decisions.md` #22): `{ code, message, redirectUrl?, errors? }`, `code` one of `HTTP_CODE` (`shared/src/constant.ts`). Endpoints that return a payload extend it per-endpoint with `data`, e.g. `globalResponseSchema.extend({ data: disputeSchema })` — not every response needs one (a bare `204`/redirect is valid as the base envelope alone). List endpoints use `paginatedGlobalResponseSchema` instead (adds `count`/`total`/`page`/`limit`), extended with `data` the same way. Validation failures populate `errors: [{ field, message }]`.

### The shared list query (`docs/progress-and-decisions.md` #57)

Every list endpoint's query extends one base (`paginationQuerySchema`): `page`, `limit` (≤ 100), `search` (case-insensitive substring across that list's text columns, trimmed), `from` / `to` (`YYYY-MM-DD`, inclusive, `from ≤ to` or `422`), `order` (`asc` / `desc`, default `desc`). Each endpoint adds a **whitelisted** `sort` — an unlisted value is a `422`, never an interpolated column: transactions `transacted_at | merchant | amount_cents`; disputes `created_at | merchant | amount_cents | status`; admin disputes the same plus `customer`; admin invites `email | status | created_at | expires_at`.

### Auth (email-OTP login — `docs/progress-and-decisions.md` #21/#37)

Our own routes wrap the Better Auth server API, so login carries the shared envelope, an `auth_audit_log` trail, and its own per-route rate limit (`docs/progress-and-decisions.md` #37).

- `POST /v1/auth/otp` — body: `email`. Sends a one-time code. Response is identical whether or not the account exists (no user probing). Writes `OTP_REQUESTED`.
- `POST /v1/auth/otp/verify` — body: `email`, `otp`. Exchanges the code for a session; forwards `Set-Cookie`. Writes `LOGIN_SUCCESS` / `LOGIN_FAILURE` / `OTP_LOCKED`.
- `POST /v1/auth/sign-out` — ends the session; safe to call without one.
- `POST /v1/auth/change-email` — body: `newEmail`. Authenticated. Wraps Better Auth's `changeEmail`; an approval link goes to the account's *current* address first (see §3 below). Response is identical whether or not `newEmail` already exists.
- `POST /v1/auth/change-email/confirm` — body: `token` (from the approval email, then the verification email). Applies one step of the change; a bad or expired token is a `401`.

### Public, customer-authenticated (Better Auth session — email-OTP login, `docs/progress-and-decisions.md` #21)

Every route here is gated `authenticate` + `authorize(CUSTOMER)` — an `ADMIN` session gets `403`, not another view of the data.

- `GET /v1/transactions` — a page of the caller's own transactions. The shared list query above (`search` matches the merchant name; `sort` default `transacted_at`). `paginatedGlobalResponseSchema` + `data: transaction[]` — `count` is the full match total, `total` the page size.
- `GET /v1/transactions/:transactionId` — one transaction, **only if it belongs to the caller** — another user's row (or a well-formed id that doesn't exist) is a `404`, never a `403`, so ownership can't be probed (`docs/progress-and-decisions.md` #39). A malformed id is a `422` (UUID params schema).
- `POST /v1/disputes` — body: `transactionId`, `reason`, `description`. A second open dispute on the same transaction (`SUBMITTED`/`UNDER_REVIEW`) is a `409` — enforced by the partial unique index + the global error handler, no pre-check, no `Idempotency-Key` (`docs/progress-and-decisions.md` #40; mechanics under "Dispute lifecycle implementation" below). A transaction that isn't the caller's → `404` (#39). Opens the dispute + writes the first `DisputeAuditLog` row in one transaction.
- `GET /v1/disputes` — the historic view: a page of the caller's own disputes. The shared list query (`search` matches the description and the disputed merchant; `sort` default `created_at`), plus optional `status` and `transaction_id` filters (the latter drives the transaction detail page's open-dispute check + history list, `docs/progress-and-decisions.md` #56).
- `GET /v1/disputes/:disputeId` — one dispute, scoped to the caller (other-user/missing → `404`, malformed id → `422`).
- `POST /v1/disputes/:disputeId/withdraw` — the caller closes their *own* open dispute (`SUBMITTED` or `UNDER_REVIEW`) — status → `WITHDRAWN`, `resolved_at` set, a `DisputeAuditLog` row written, in one transaction. Another user's dispute / a missing one → `404`; one already closed → `409`. The ownership + open-status check is in the `UPDATE … WHERE` (`docs/progress-and-decisions.md` #4). Withdrawing frees the transaction for a fresh dispute later (the partial unique index only covers open statuses).

### Admin, admin-session-authenticated (Better Auth session carrying `admin` role — `docs/progress-and-decisions.md` #16)

Every route here is `authenticate` + `authorize(ADMIN)` — a customer session is a `403`.

- `GET /v1/admin/disputes` — a page of every customer's disputes for the review queue. The shared list query (`search` also matches the owning customer's name and email; `sort` adds `customer`), optional `status` filter. **With no explicit `sort`** the queue orders as a work list — unresolved first (`status` enum order), oldest of those at the top (`docs/progress-and-decisions.md` #58). Wire shape is the customer dispute + `user_id` + a nested `customer: { name, email }`.
- `GET /v1/admin/disputes/summary` — how many disputes sit in each lifecycle status right now — one unfiltered `GROUP BY status`, zero-filled to all five. Drives the review-queue stat cards (`docs/progress-and-decisions.md` #58). `globalResponseSchema` + `data: { SUBMITTED, UNDER_REVIEW, RESOLVED, REJECTED, WITHDRAWN }`.
- `POST /v1/admin/disputes/:disputeId/review` — `SUBMITTED → UNDER_REVIEW`. Idempotent — a second call on an already-under-review dispute is a `200` no-op. Writes a `DisputeAuditLog` row, publishes to the customer's ntfy topic (`docs/progress-and-decisions.md` #41).
- `POST /v1/admin/disputes/:disputeId/resolve` — the reviewer-decision path; body `{ resolution: RESOLVED | REJECTED, note }`. **Requires `UNDER_REVIEW`** — resolving a still-`SUBMITTED` dispute is a `409` ("move it to review first"). Updates `status`/`resolution_note`/`resolved_by`/`resolved_at`, writes the `DisputeAuditLog` row, publishes to ntfy — one transaction. The legal-from-status check is in the `UPDATE … WHERE`, so concurrent resolves collapse to one write (`docs/progress-and-decisions.md` #41).
- `GET /v1/admin/invites` — a page of the calling admin's own invites for the invite-list view. The shared list query (`search` matches the invitee email; `sort` `email | status | created_at | expires_at`), optional `status` filter. `status` is *derived* server-side (`PENDING` / `ACCEPTED` / `EXPIRED` from `accepted_at` / `expires_at`), not a column, so `?status=` is translated to a predicate. Wire shape omits the token.
- `POST /v1/admin/invites` — an existing admin invites a new admin by `email`; a one-time token goes out in a real invite email (Mailpit for dev/demo). Inviting an address that already has an account is a `409`. No self-service admin signup — an account is only created by accepting an invite (`docs/progress-and-decisions.md` #16). Response wire shape omits the token; it only ever travels in the emailed link.
- `POST /v1/admin/invites/:token/accept` — unauthenticated (the invitee has no session yet) — body is just `name`; the email is taken from the invite, not the request. A missing token is a `404`; an already-used or expired one is a `409`. Creates the account with `admin` role and `email_verified`, marks the invite accepted (guarded `UPDATE … WHERE` so concurrent accepts collapse to one, `docs/progress-and-decisions.md` #4/#41). Login is still email-OTP from there (`docs/progress-and-decisions.md` #21).

The dispute lifecycle is forward-only (`SUBMITTED → UNDER_REVIEW → RESOLVED | REJECTED`), plus the customer's own `WITHDRAWN` exit from either open state — no backward edges, terminal states terminal. "Reopen after a rejection" is handled by opening a *new* dispute (the old one stays as an immutable record; the partial unique index only blocks a second *open* dispute), not a backward transition. An admin declining a review, and any supervisor-override / assignment model, are out of scope — `UNDER_REVIEW` is an unassigned status flag and the admin portal is minimal by design (`docs/progress-and-decisions.md` #16/#41).

A customer being able to resolve their own dispute would be a real hole in the authz story, not a shortcut — this keeps the customer and admin auth paths honestly separate.

This is now the *only* resolve path. The original demo stand-in, `POST /internal/disputes/:id/resolve` (shared-secret `x-internal-token` header, no admin session), is removed — decision 16's open question resolved in favor of removing it, since keeping two live auth mechanisms for the same action was two things to explain instead of one.

### Health

- `GET /healthz` — liveness
- `GET /readyz` — readiness; wired into the k8s manifest's probes — see `docs/infrastructure.md`

## Auth: verifying credentials belong to the signer-in

"How do we know the credentials being used to sign in actually belong to the person signing in?" Login is email-OTP — Better Auth's built-in email-OTP plugin (`docs/progress-and-decisions.md` #21; see that decision for why username+password was rejected). Every login sends a one-time code to the account's email; entering it correctly, within its expiry, is the only credential. There's no separate signup-time "prove you own this email" step — every login already is that proof (decision 17's one-time signup-only verification gate is superseded: OTP subsumes it).

### 1. OTP code integrity — built

A 6-digit OTP code has a narrow search space (1,000,000 possibilities) and a short shelf life. The controls target that:

- **Rate limiting + lockout on OTP verification attempts, per account** — a handful of wrong guesses (e.g. 5) invalidates the code and requires a fresh one, rather than allowing unlimited guesses within the expiry window. Tighter than the general `@fastify/rate-limit` config on other endpoints (see "Scaling and resilience" below) — an attacker distributing guesses across IPs still hits the per-account limit.
- **Short code expiry** (e.g. 5–10 minutes) — narrows the window a leaked/intercepted code is useful for.
- **Secure session cookies** — `httpOnly`/`SameSite`, DB-backed sessions, no session token exposed to client-side JS.
- **Auth audit log** — login success/failure, timestamp, source IP, extending the same `DisputeAuditLog` pattern (see "Dispute lifecycle implementation" below) to auth events. A spike of failed OTP attempts against one account is visible, not silent.

### 2. The login-critical-path dependency this creates — accepted, and resolved

Decision 1 originally rejected email-OTP because it puts outbound email delivery on the path every login depends on — a real risk for the one review event with no do-over. Decision 21 reverses that call by explicit instruction; this section accounts for what that costs and how it's resolved (`docs/progress-and-decisions.md` #21).

**Resolved: Mailpit is accepted as sufficient for dev/demo.** Committed `api/.env` points `SMTP_HOST`/`SMTP_PORT` at the local Mailpit catcher; the OTP code is readable at `localhost:8025` the moment it's "sent" — no auth, no external call, nothing secret in that config. Real SMTP is **documented as a production requirement, not built** — the same "documented, not built" pattern decision 13 used for signup verification.

**Mailpit's real limitation, and why it doesn't matter here:** no per-recipient mailbox isolation — its only auth option (`MP_UI_AUTH_FILE`) is one shared username/password for the *entire* web UI. Anyone holding that credential sees every account's OTP in one inbox — the same shared-topic problem decision 3 flagged for ntfy, and not configurable away. Acceptable because Mailpit's actual audience is one trusted operator (Nolan locally, or a reviewer running their own `docker compose up`) reading codes for accounts they themselves are testing, not multiple people sharing one instance — this project has no live cloud deployment.

**Production:** real per-recipient isolation is inherent to not using Mailpit at all — swap `SMTP_HOST`/`PORT`/`USER`/`PASS` (already provider-agnostic, decisions 14/19) for a real transactional provider and every user's OTP goes to their own inbox, gated by their own email login. Zero code change, an env-var swap — documented, not built, since this submission has no production deployment to point it at.

### 3. Account-recovery & compromise alerts — built, via outbound SMTP

Different from OTP delivery: these are **notifications**, not the login gate — a slow/down mail provider delays an alert but never blocks logging in (which already depends on mail for a different reason, §2 above; this is additional, non-blocking traffic).

Built:

- **New-device login alert** — a Better Auth `databaseHooks.session.create.after` hook (`lib/security-notifications.ts`) fires an email (async, `void`-ed, never awaited into the login response) when a session's `user_agent` has no earlier session on record. Missing `user_agent` is skipped (can't be matched; only non-browser clients omit it). Seed data gives demo accounts a known-device session so "quiet on known device, alert on new" is demonstrable — the primary way a compromised account gets noticed, now that "compromised" means "someone else can receive your OTP codes."
- **Email-change approval to the _old_ address** — `POST /v1/auth/change-email` (`{ newEmail }`, authenticated) wraps Better Auth's `changeEmail`: an approval link goes to the account's **current** address first (`sendChangeEmailConfirmation`), then a verification link to the new one (`sendVerificationEmail`); `POST /v1/auth/change-email/confirm` (`{ token }`) applies each step. An attacker with a live session can't quietly redirect where OTP codes go — the real owner gets an approval request first. Response is identical whether or not the target address already exists (no account probing).

No separate recovery credential exists: email access *is* the credential, and losing it means no self-service recovery — accepted, documented not built (`docs/progress-and-decisions.md` #14's narrowing note).

SMTP config is provider-agnostic (`SMTP_HOST`/`PORT`/`USER`/`PASS`/`FROM` — Gmail App Password or any transactional provider). Committed `api/.env` points at the local Mailpit catcher (no auth, nothing secret). For real inbox delivery, put real credentials in `SMTP_USER`/`PASS`/`FROM` — `api/.env` directly or the gitignored `api/.env.local` (`docs/progress-and-decisions.md` #34).

### Explicitly rejected: CAPTCHA / third-party bot detection on login

A hosted CAPTCHA (hCaptcha/Turnstile/reCAPTCHA) sitting in front of the login flow the reviewer has to use is an external dependency on the one flow that gates everything else, for the one review event with no do-over. Rate limiting + lockout (above) covers the same automated-attack surface without adding a second external dependency on top of the one §2 already accepts.

## Dispute lifecycle implementation

What follows is the *how*: this backend's actual enforcement of the dispute lifecycle and audit trail. For the requirement itself (why a dispute has these states, why an audit trail exists at all), see `docs/requirements.md`.

- **State machine.** `SUBMITTED → UNDER_REVIEW → RESOLVED | REJECTED`, plus a customer-only `WITHDRAWN` exit from either open state (`SUBMITTED` or `UNDER_REVIEW`). No backward edges; terminal states (`RESOLVED`/`REJECTED`/`WITHDRAWN`) are terminal. "Reopen after a rejection" is a *new* dispute row, not a transition (`docs/progress-and-decisions.md` #45).
- **At most one open dispute per transaction.** A Postgres partial unique index (`dispute_open_per_transaction_uq_idx`, on `dispute.ts`) covers only `SUBMITTED`/`UNDER_REVIEW` rows — any number of *closed* disputes, never a second concurrently-open one. `POST /v1/disputes` has no pre-check: the DB constraint fires and the global error handler (`src/middleware/error.ts`) translates the Postgres `23505` unique-violation into a `409` via `CONFLICT_MESSAGE` (keyed by constraint name, `docs/progress-and-decisions.md` #40). No `Idempotency-Key`, no separate idempotency table — the constraint *is* the mechanism.
- **Forward-only transition guards live in the `UPDATE … WHERE` clause, not application code.** `markDisputeUnderReview`, `resolveDispute`, `withdrawDispute` (`src/database/repository/dispute.ts`) each encode the required from-status in the guarded `UPDATE`'s `WHERE`: `/review` only matches `SUBMITTED`, `/resolve` only matches `UNDER_REVIEW`, `/withdraw` only matches an open status owned by the caller. An empty `RETURNING` becomes the service layer's `404`/`409` — and two concurrent calls collapse to exactly one successful write instead of racing (`docs/progress-and-decisions.md` #4/#41/#45).
- **`DisputeAuditLog`** — one row per status transition: actor, timestamp, `from_status`, `to_status`, note. Written by `recordDisputeStatusChange` (`src/database/repository/dispute-audit-log.ts`) inside the same DB transaction as the status-changing `UPDATE`, so a transition and its audit row can never diverge. Admin-portal resolutions extend the same table (`docs/progress-and-decisions.md` #16).
- **`AuthAuditLog`** — one row per auth event (`OTP_REQUESTED`, `LOGIN_SUCCESS`, `LOGIN_FAILURE`, `OTP_LOCKED`, `EMAIL_CHANGE_REQUESTED`). Keyed by `email` rather than `user_id`, since a failed login attempt may not resolve to an existing account at all (`docs/progress-and-decisions.md` #28/#46). `recordAuthEvent` (`src/database/repository/auth-audit-log.ts`) clamps `ip`/`user-agent` to 255 characters before insert.

## Scaling and resilience — backend

These exist so questions on scaling/failover/traffic have a real answer backed by code, not just a claim. Infra-level items (managed DB, load balancer/gateway, k8s manifests, the load-test number, event durability, session-lookup-cost mitigation) are `docs/infrastructure.md`'s territory, not repeated here.

- **Stateless API** — Better Auth sessions live in Postgres, not in-memory. No server-local state is what actually _makes_ horizontal scaling true.
- **Rate limiting** — `@fastify/rate-limit` on write endpoints (plus the OTP-specific tighter limit under "Auth" above). Real answer to "how do you handle traffic spikes/abuse."
- **Idempotency / one-open-dispute-per-transaction** — see "Dispute lifecycle implementation" above.
- **Health endpoints** — `/healthz`, `/readyz` (see "Health" above). `/readyz` does a bounded `select 1`, so it fails a pod out of rotation when the DB is unreachable — the hook for the failover conversation (pod dies → readiness probe fails → traffic drained → rolling replacement). k8s probe wiring itself is `docs/infrastructure.md`.
