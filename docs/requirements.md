# Requirements

## What this is

Solo submission for Nolan's internal promotion evaluation to Software Engineer II: Full Stack at Capitec. This repo is the only artifact the panel evaluates before a possible interview — build and document it like production, not a take-home toy.

- Deadline: ~1 month from receiving the brief (see maintainer note in `CLAUDE.md` for exact date)
- Submit by email: public GitHub link, language (TypeScript), track (Full Stack)
- Hard requirements: production-grade code, a runnable Dockerfile, a README with build/run/test instructions

## The brief

Front end + back end for customers to:

- View their transactions
- Dispute a transaction
- See a historic view of their past disputes

Of the three offered briefs (Appointment Booking System, Transactions Dispute Portal, Business Invoice Tracker), this one was picked as the most Capitec-native: an honest dispute-lifecycle state machine, a real pagination/filtering/indexing story via a large seeded transaction table, a natural authz-scoping + audit-trail story, and a clean, non-forced excuse for an event-driven status-change notification.

## Why these choices exist (JD mapping)

The Full Stack JD grades on top of generic SE II duties (SDLC, testing, CI/CD, devsecops) with these specifics — every non-trivial decision in this repo exists to earn one of these honestly, not check a box:

- DB/query optimization
- RESTful API design
- Cloud awareness (AWS/Azure)
- Microservice & event-driven architecture
- Kubernetes/containerization
- Responsive/mobile-first front end
- Browser compatibility & performance
- Front-end build tooling

If a proposed feature doesn't trace to one of these lines (or to a hard submission requirement), treat it as scope creep for a one-month solo build — flag it rather than silently adding it.

**Be precise about "microservice"** when talking about this repo: it's one Fastify app with an in-process event-driven notification pattern, not multiple deployed services. Say "event-driven," not "microservices" — an interviewer probing that word will catch the gap fast if it's overclaimed.

## Entities and what must hold true about them

These are behavioural requirements — what the system must guarantee. How each is implemented (table shapes, enum casing, index types) is documented in `docs/backend-service.md`, not here.

- **User** — must support two roles, customer and admin (`docs/progress-and-decisions.md` #16). Every login must re-prove ownership of the account's email at the moment of login, not just once at signup — a credential valid last month must not silently still be enough today (`docs/progress-and-decisions.md` #21).
- **Admin accounts** — created only by invitation from an existing admin; no self-service path to becoming an admin (`docs/progress-and-decisions.md` #16).
- **Transaction** — belongs to exactly one user. Monetary amounts must not lose precision — no floating-point currency values (`docs/progress-and-decisions.md` #28).
- **Dispute** — belongs to exactly one transaction.
  - At most one *open* dispute per transaction at a time, enforced by the system (`docs/progress-and-decisions.md` #4/#28/#40).
  - Lifecycle is forward-only and enforced server-side, not just the UI: submitted → under review → resolved or rejected, with a customer-only withdraw exit from either open state; once terminal, always terminal (`docs/progress-and-decisions.md` #41/#45).
  - Reopening a rejected dispute is a brand-new dispute, never a reopened old one — "at most one open dispute" only blocks a second concurrently-open one.
  - Admin-declines-to-review and supervisor-override are explicitly out of scope (`docs/progress-and-decisions.md` #45).
  - Every dispute carries a reason from a fixed set of categories (fraud, duplicate charge, incorrect amount, goods not received, subscription not cancelled, other) — no arbitrary free-text reasons.
- **Dispute history/audit trail** — every status change, by customer or admin, must record who changed it, when, the from/to status, and an optional note (`docs/progress-and-decisions.md` #16).
- **Auth activity audit trail** — every auth-relevant event (OTP requested, login success/failure, OTP lockout, email-change request) must be recorded, including failed attempts that never resolved to an actual user account (`docs/progress-and-decisions.md` #28/#46).
- **Notifications** — a dispute status change must trigger a notification to the affected customer. This is a behavioural requirement on state change, not a requirement for a persisted notification record.

## Non-functional requirements

- Authz: a customer only ever reads/acts on their own transactions and disputes — test this, don't just assume it (see `docs/progress-and-decisions.md`).
- Testing: Vitest unit tests on dispute state transitions + integration tests across the API surface.
- Performance: historic disputes view is paginated and filterable; index on `user_id`, `status`, `created_at`.
- Security: input validation on every mutation. `api/.env`/`web/.env`/`env/development/.env.database` are committed with working *local-only* values (fake Postgres password, freshly-generated auth secrets — no external-account access, no live deployment behind them; `docs/progress-and-decisions.md` #34/#42). Real external credentials (a Gmail App Password for real SMTP) never get committed — they go in an untracked `api/.env.local`. A real deployment injects everything from its orchestrator, not a file (`docs/production-runbook.md`).

## Seed data — make it real enough to matter

- Enough users and transactions that pagination and indexing actually do something — thousands of transaction rows across dozens of users, not a dozen rows total.
- Realistic ZAR amounts and South African merchant-style names, spread across several months.
- A deliberate spread of dispute statuses and reasons per user, including at least one user with zero disputes and one with a long history.
- One seeded admin account (Nolan's own email), the sole admin until an invite creates another. Seeding doesn't sidestep the email dependency — every account, seeded or not, needs a working OTP round-trip to log in (`docs/progress-and-decisions.md` #21).
