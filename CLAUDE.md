# Transactions Dispute Portal

<!--
Maintainer notes for Nolan (stripped from Claude Code's context, still visible here in VS Code):
- Fill in the exact deadline date once known — brief allows ~1 month from receipt.
- Confirm the public repo name before first push.
-->

This file loads in full at the start of every session in this repo — keep it short. Longer design discussion goes in `docs/*.md`, not here.

Solo submission for Nolan's internal promotion evaluation to Software Engineer II: Full Stack at Capitec — see `docs/requirements.md` for the full context. This repo is the only artifact the panel evaluates before a possible interview.

## Read first

- `docs/requirements.md` — what this is, the brief, the JD mapping, and every functional/non-functional/seed-data requirement (what must be true, not how it's built)
- `docs/progress-and-decisions.md` — current build status + the definition-of-done checklist, then the "why did you..." log: problem, decision, alternatives actually considered, how it solves the problem. Add an entry here the moment a real design decision gets made, not after.
- `docs/backend-service.md` — the API surface (public + admin, versioned under `/v1/`, error shape), auth/OTP mechanics, and the dispute lifecycle as implemented
- `docs/frontend-service.md` — the `web` package's architecture: route tree/auth gating, the loader-driven data-fetching pattern, the query-client refresh pattern, shared list UI, live notifications
- `docs/shared-service.md` — what lives in `shared` and why it's a separate package
- `docs/infrastructure.md` — how everything connects: container topology, data model, the request-flow diagram, the target cloud/k8s shape
- `docs/dev-tools.md` — ntfy and Mailpit: why/how they're used in dev, scope boundary vs. auth-credential delivery, what replaces them in production
- `docs/user-stories.md` + `docs/user-stories/` — every user-facing flow (and every distinct error case) walked end to end, one file each: role, screens, API calls, DB changes, side effects. Read for *how the system behaves*; `progress-and-decisions.md` for *why*.
- `docs/codebase-index.md` — per-file map of the repo (what lives where). Check before grepping/exploring the tree from scratch.
- `docs/production-runbook.md` — this repo is dev-only (one `compose.yml`, one dev `Dockerfile` per package); the runbook is the step-by-step for making it production-ready (multi-stage images, real secrets, migrations as a gated step, a deploy pipeline, k8s)

## Conventions

- Arrow functions, not function declarations
- No speculative abstraction — don't introduce a service/repository/DI layer until there's a second concrete caller that needs it
- Framework-native over generic: TanStack Router loaders for data fetching, never `useEffect` for it
- Type logic lives in centralized helper files, not inlined per-component or per-route
- Drizzle: exclude unwanted columns from the query itself with `getTableColumns(table)` + rest-spread (`const { user_id, ...cols } = getTableColumns(X)`), not a `SELECT *` narrowed away in the type; a full-row `.select()` is fine for admin/internal reads that need every column

## Tech stack (decided — don't relitigate)

- Language: TypeScript everywhere, Node 24 LTS
- Package manager: pnpm + Turborepo
- Frontend: TanStack Start
- Backend: Fastify
- Auth: Better Auth, email-OTP login. Every login sends a one-time code to the account's email; entering it is the only credential (see `docs/progress-and-decisions.md` #21 for why, and for the reversal from the original design). This puts outbound email delivery on the login-critical path — accepted as a real tradeoff: Mailpit for dev/demo, real SMTP documented (not built) as the production requirement (`docs/progress-and-decisions.md` #21, `docs/backend-service.md` §2). Still no Google OAuth/social login (`docs/backend-service.md`)
- ORM: Drizzle
- DB: Postgres (`docs/progress-and-decisions.md` #23)
- Tests: Vitest
- CI: GitHub Actions — lint/typecheck/build/test plus a `docker compose` smoke test of the dev stack. A real deploy pipeline is described in `docs/production-runbook.md`, not built
- Containers: one dev `Dockerfile` per package + a single `compose.yml`. `docker compose up` is the entire local stack (Postgres, api, web, Mailpit, ntfy, an nginx reverse proxy in front of web/api/ntfy — `docs/progress-and-decisions.md` #61), migrations run on start, `db:seed` is one command. Production containerisation lives in `docs/production-runbook.md`, not built

## Explicitly out of scope

- No real transaction/banking integration — data is seeded/simulated
- No real delivery of _dispute-status_ notifications — simulated via self-hosted ntfy, see `docs/dev-tools.md` (no third-party ntfy.sh). Auth email is real over SMTP — the OTP sign-in code, plus the new-device login alert and email-change approval (`docs/backend-service.md` §3) — different category, not a contradiction
- No Google OAuth — no social login. Email-OTP login is still self-hosted-only (no external *identity provider*), but it does depend on outbound SMTP delivery working on the login path itself — a real, accepted dependency, not the OAuth-shaped one this line originally ruled out (`docs/backend-service.md`, `docs/progress-and-decisions.md` #21)
- No live cloud deployment
- Admin portal is minimal by design — one or two pages (dispute review list + resolve action), invite-only account creation, no self-service admin signup (`docs/progress-and-decisions.md` #16). Not a general back-office; the brief is still customer-facing first
