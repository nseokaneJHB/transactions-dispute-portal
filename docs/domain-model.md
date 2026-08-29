# Domain model & seed data

## Entities

- **User** — via Better Auth; `role: CUSTOMER | ADMIN` (`docs/decisions.md` #16); login is email-OTP for every account, which re-proves email ownership on every login rather than once at signup (`docs/decisions.md` #21, supersedes the old `emailVerified`-gate model)
- **AdminInvite** — email, invite token, expiry, accepted-at; created by an existing admin, consumed once to create a new admin `User` (`docs/decisions.md` #16) — no self-service admin signup
- **Transaction** — seeded/simulated, belongs to a user, amount stored as integer ZAR cents (`amount_cents`, `bigint`; `docs/decisions.md` #28)
- **Dispute** — belongs to a transaction; status: `SUBMITTED → UNDER_REVIEW → RESOLVED | REJECTED`; reason: `FRAUDULENT_CHARGE | DUPLICATE_CHARGE | INCORRECT_AMOUNT | GOODS_NOT_RECEIVED | SUBSCRIPTION_NOT_CANCELLED | OTHER`. Enum values are SCREAMING_SNAKE end to end (`docs/decisions.md` #30). A DB-level partial unique index enforces at most one `SUBMITTED`/`UNDER_REVIEW` dispute per transaction (`docs/decisions.md` #4/#28)
- **DisputeAuditLog** — one row per status change: actor, when, from/to status, note (now includes admin-portal resolutions, `docs/decisions.md` #16)
- **AuthAuditLog** — one row per auth event (OTP requested, login success/failure, OTP lockout); keyed by `email` since a failed attempt may not resolve to a user (`docs/decisions.md` #28)

Notifications are events, not a table — triggered on status change, simulated (logged/stubbed, never actually sent).

## Seed data — make it real enough to matter

- Enough users and transactions that pagination and indexing are actually doing something, not decorative — thousands of transaction rows across dozens of users, not a dozen rows total
- Realistic ZAR amounts and South African merchant-style names, spread across several months
- A deliberate spread of dispute statuses and reasons per user, including at least one user with zero disputes and one with a long history
- One seeded admin account (Nolan's own email), the sole `role: admin` user until an invite creates another. Seeding doesn't sidestep the email dependency — every account, seeded or not, needs a working OTP round-trip to log in (`docs/decisions.md` #21)

## Non-functional requirements tied to this model

- Authz: a customer only ever reads/acts on their own transactions and disputes — test this, don't just assume it (see `docs/definition-of-done.md`)
- Testing: Vitest unit tests on dispute state transitions + integration tests across the API surface
- Performance: historic disputes view is paginated and filterable; index on `user_id`, `status`, `created_at`
- Security: input validation on every mutation, no secret ever committed as a real, working value — `api/.env`/`env/development/.env.database` are committed but every secret-shaped key in them is blank; real values live in gitignored `api/.env.local`/`env/development/.env.local.database`, layered over the committed files by `compose.yml`. Non-secret operational config (ports, CORS origin, rate limits) stays real. `web/.env` has no secrets at all. See `docs/decisions.md` #20 and README.md "Local setup"
