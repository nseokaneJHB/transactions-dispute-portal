# Transactions Dispute Portal

<!--
Maintainer notes for Nolan (stripped from Claude Code's context, still visible here in VS Code):
- Fill in the exact deadline date once known — brief allows ~1 month from receipt.
- DB defaults to Postgres below; swap to MySQL if you'd rather lean on your RDS experience — no functional difference for this brief.
- Confirm the public repo name before first push.
-->

This file loads in full at the start of every session in this repo — keep it short. Longer design discussion goes in `docs/*.md`, not here.

Solo submission for Nolan's internal promotion evaluation to Software Engineer II: Full Stack at Capitec — see `docs/brief.md` for the full context. This repo is the only artifact the panel evaluates before a possible interview.

## Read first

- `docs/decisions.md` — the "why did you..." log: problem, decision, alternatives actually considered, how it solves the problem. Add an entry here the moment a real design decision gets made, not after.
- `docs/codebase-index.md` — per-file map of the repo (what lives where). Check before grepping/exploring the tree from scratch. Not yet populated — fill it in as `api`/`web`/`shared` get scaffolded.
- `docs/brief.md` — what this is, the brief, and why each non-trivial decision exists (JD mapping)
- `docs/api.md` — the API surface (public + internal), error shape
- `docs/domain-model.md` — entities, dispute lifecycle, seed data requirements, non-functional requirements
- `docs/scaling-and-resilience.md` — what to build vs. what to document for scaling/failover/traffic questions
- `docs/notifications.md` — ntfy for dispute-status events; scope boundary vs. auth-credential delivery (read before touching notifications)
- `docs/auth.md` — how login credentials are verified as belonging to the signer-in: what's built (rate limiting, breach-check) vs. documented-only (email verification) and why
- `docs/porting-notes.md` — repo layout (flat: `api/`, `web/`, `shared/`, matching `ubuntu-stories` — `/home/nolan/Desktop/ubuntu-stories`, not the `ubuntustories`/`ubuntuStories` React Native decoys also on the Desktop), what to port, Docker habits
- `docs/definition-of-done.md` — the completion checklist and suggested weekly pace

## Conventions

- Arrow functions, not function declarations
- No speculative abstraction — don't introduce a service/repository/DI layer until there's a second concrete caller that needs it
- Framework-native over generic: TanStack Router loaders for data fetching, never `useEffect` for it
- Type logic lives in centralized helper files, not inlined per-component or per-route
- Drizzle: `select` is explicit on every query's option type, never implicit

## Tech stack (decided — don't relitigate)

- Language: TypeScript everywhere, Node 24 LTS
- Package manager: pnpm + Turborepo (matches `ubuntu-stories`)
- Frontend: TanStack Start
- Backend: Fastify
- Auth: Better Auth, plain email+password — deliberately not the passwordless email-OTP pattern `ubuntu-stories` uses; the brief never asked for passwordless/social login, and skipping it means no Gmail SMTP or Google OAuth dependency to carry over (see `docs/notifications.md`)
- ORM: Drizzle
- DB: Postgres (see maintainer note)
- Tests: Vitest
- CI: GitHub Actions
- Containers: Docker (multi-stage) + docker-compose for local dev; `k8s/` manifests as a bonus, not deployed

## Explicitly out of scope

- No real transaction/banking integration — data is seeded/simulated
- No real notification delivery — simulated via self-hosted ntfy, see `docs/notifications.md` (no real email/SMS/push, no third-party ntfy.sh)
- No Google OAuth or Gmail SMTP — no social login, no passwordless email-OTP; plain email+password needs neither
- No live cloud deployment
- No separate admin/reviewer portal — the brief is customer-facing only; `POST /internal/disputes/:id/resolve` is the demo stand-in
