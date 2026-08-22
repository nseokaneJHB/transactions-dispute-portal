# Domain model & seed data

## Entities

- **User** — via Better Auth
- **Transaction** — seeded/simulated, belongs to a user, amount in ZAR
- **Dispute** — belongs to a transaction; status: `submitted → under_review → resolved | rejected`; reason: `fraudulent_charge | duplicate_charge | incorrect_amount | goods_not_received | subscription_not_cancelled | other`
- **DisputeAuditLog** — one row per status change: who, when, from/to, reason

Notifications are events, not a table — triggered on status change, simulated (logged/stubbed, never actually sent). See `docs/porting-notes.md` for the dispatcher this reuses.

## Seed data — make it real enough to matter

- Enough users and transactions that pagination and indexing are actually doing something, not decorative — thousands of transaction rows across dozens of users, not a dozen rows total
- Realistic ZAR amounts and South African merchant-style names, spread across several months
- A deliberate spread of dispute statuses and reasons per user, including at least one user with zero disputes and one with a long history

## Non-functional requirements tied to this model

- Authz: a customer only ever reads/acts on their own transactions and disputes — test this, don't just assume it (see `docs/definition-of-done.md`)
- Testing: Vitest unit tests on dispute state transitions + integration tests across the API surface
- Performance: historic disputes view is paginated and filterable; index on `user_id`, `status`, `created_at`
- Security: input validation on every mutation, no secrets committed, `.env.example` provided
