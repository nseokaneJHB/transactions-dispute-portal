# Transactions Dispute Portal

<!--
Maintainer notes for Nolan (stripped from Claude Code's context, still visible here in VS Code):
- Fill in the exact deadline date once known — brief allows ~1 month from receipt.
- Confirm the public repo name before first push.
-->

This file loads in full at the start of every session in this repo — keep it short. Longer design discussion goes in `docs/*.md`, not here.

Solo submission for Nolan's internal promotion evaluation to Software Engineer II: Full Stack at Capitec — see `docs/brief.md` for the full context. This repo is the only artifact the panel evaluates before a possible interview.

## Read first

- `docs/decisions.md` — the "why did you..." log: problem, decision, alternatives actually considered, how it solves the problem. Add an entry here the moment a real design decision gets made, not after.
- `docs/codebase-index.md` — per-file map of the repo (what lives where). Check before grepping/exploring the tree from scratch. Not yet populated — fill it in as `api`/`web`/`shared` get scaffolded.
- `docs/brief.md` — what this is, the brief, and why each non-trivial decision exists (JD mapping)
- `docs/api.md` — the API surface (public + admin), versioned under `/v1/`, error shape
- `docs/domain-model.md` — entities, dispute lifecycle, seed data requirements, non-functional requirements
- `docs/scaling-and-resilience.md` — what to build vs. what to document for scaling/failover/traffic questions
- `docs/notifications.md` — ntfy for dispute-status events; scope boundary vs. auth-credential delivery (read before touching notifications)
- `docs/auth.md` — how login credentials are verified as belonging to the signer-in: email-OTP login, rate limiting on OTP attempts, why (`docs/decisions.md` #21)
- `docs/definition-of-done.md` — the completion checklist and suggested weekly pace

## Conventions

- Arrow functions, not function declarations
- No speculative abstraction — don't introduce a service/repository/DI layer until there's a second concrete caller that needs it
- Framework-native over generic: TanStack Router loaders for data fetching, never `useEffect` for it
- Type logic lives in centralized helper files, not inlined per-component or per-route
- Drizzle: `select` is explicit on every query's option type, never implicit

## Tech stack (decided — don't relitigate)

- Language: TypeScript everywhere, Node 24 LTS
- Package manager: pnpm + Turborepo
- Frontend: TanStack Start
- Backend: Fastify
- Auth: Better Auth, email-OTP login. Every login sends a one-time code to the account's email; entering it is the only credential (see `docs/decisions.md` #21 for why, and for the reversal from the original design). This puts outbound email delivery on the login-critical path — accepted as a real tradeoff: Mailpit for dev/demo, real SMTP documented (not built) as the production requirement (`docs/decisions.md` #21, `docs/auth.md` §2). Still no Google OAuth/social login (`docs/auth.md`)
- ORM: Drizzle
- DB: Postgres (`docs/decisions.md` #23)
- Tests: Vitest
- CI: GitHub Actions
- Containers: Docker (multi-stage) + docker-compose for local dev; `k8s/` manifests as a bonus, not deployed

## Explicitly out of scope

- No real transaction/banking integration — data is seeded/simulated
- No real delivery of _dispute-status_ notifications — simulated via self-hosted ntfy, see `docs/notifications.md` (no third-party ntfy.sh). Auth-related email (account-recovery/compromise alerts) is real, see `docs/auth.md` §3 — different category, not a contradiction
- No Google OAuth — no social login. Email-OTP login is still self-hosted-only (no external *identity provider*), but it does depend on outbound SMTP delivery working on the login path itself — a real, accepted dependency, not the OAuth-shaped one this line originally ruled out (`docs/auth.md`, `docs/decisions.md` #21)
- No live cloud deployment
- Admin portal is minimal by design — one or two pages (dispute review list + resolve action), invite-only account creation, no self-service admin signup (`docs/decisions.md` #16). Not a general back-office; the brief is still customer-facing first
