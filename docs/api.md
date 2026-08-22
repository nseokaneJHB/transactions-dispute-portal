# API surface

Sketch — refine, don't reinvent. One consistent error shape everywhere: `{ error: { code, message } }`.

## Public, customer-authenticated (Better Auth session)

- `GET /api/transactions` — paginated, filterable by date range; scoped to current user
- `GET /api/transactions/:id`
- `POST /api/disputes` — body: `transactionId`, `reason`, `description`; idempotent — reject with a clear error if the transaction already has an open dispute (`submitted` or `under_review`), and treat a duplicate idempotency key as a no-op rather than a second row. This is the answer to "what happens on a client retry/double-click" and doubles as the one-open-dispute-per-transaction guard.
- `GET /api/disputes` — the historic view: paginated, filterable by status
- `GET /api/disputes/:id`

## Internal only — not reachable via customer auth, kept out of any public API docs

- `POST /internal/disputes/:id/resolve` — simulates a reviewer decision so the status-change event has something to trigger from, in absence of a real reviewer portal. Gated by a separate shared-secret header (e.g. `x-internal-token`) checked in its own middleware, deliberately distinct from the customer session model.

  A customer being able to resolve their own dispute would be a real hole in the authz story, not a shortcut — this keeps the two auth paths honestly separate and gives a second, demoable auth mechanism to talk about (curl-able live in an interview, no shelling into the codebase needed).

## Health

- `GET /healthz` — liveness
- `GET /readyz` — readiness; wired into the k8s manifest's probes (see `docs/scaling-and-resilience.md`)
