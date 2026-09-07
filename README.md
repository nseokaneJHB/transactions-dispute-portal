# Transactions Dispute Portal

Solo submission for an internal promotion evaluation. See `CLAUDE.md` and `docs/brief.md` for full context; `docs/decisions.md` for the "why" behind every non-trivial choice.

**Status: backend and web frontend both feature-complete.** The Drizzle schema, Better Auth (email-OTP), env validation, the Fastify request stack (`docs/decisions.md` #35), and every backend module are built and verified: `check`, `authentication` (OTP sign-in, a session endpoint for the client, a two-step email change, `docs/decisions.md` #46/#50), `transaction`, `dispute` (submit / list / detail / withdraw, `#40`/`#45`), `admin-dispute` (`review → resolve` lifecycle, `#41`), `admin-invite` (invite-only admin signup, `#44`). Plus new-device login alerts, dispute-status notifications over ntfy, deterministic seed/purge, and a 36-test Vitest integration suite running in CI against real Postgres + Mailpit (`#47`). `web` is a TanStack Start app with a session-gated route tree, loader-driven data fetching, one typed API client, and live dispute-status toasts over ntfy (`#51`) — customer transactions/disputes flow, admin review + invite flow, and account/email-change, all wired to the real API and given a manual browser pass end to end (8 unit tests plus sign-in → dispute → admin-review driven live in Chrome). That pass found and fixed a post-mutation UI staleness bug (`#52`) and a missing-transaction-context gap now closed on every dispute view (`#53`), and the admin review queue was compacted into a table + modal (`#54`). Deferred backend hardening is catalogued in `docs/enhance-suggestion.md`. See `docs/codebase-index.md` for a per-file map.

## Local setup

```sh
docker compose up -d
docker compose exec transaction-dispute-portal-api \
  pnpm --filter @transaction-dispute-portal/api db:seed
```

`docker compose up -d` is the whole stack — Postgres, api, web, Mailpit, ntfy, source bind-mounted with `tsx`/`vite` watch. `api/.env`, `web/.env` and `env/development/.env.database` are committed with working local values (fake Postgres password, freshly-generated auth secrets; `docs/decisions.md` #34/#42). Migrations run automatically on api start; the `db:seed` line above loads demo data (once).

- Web: http://localhost:3000
- API: http://localhost:8080
- Mailpit (caught local email): http://localhost:8025
- ntfy (dispute-status notifications): http://localhost:8090

**Logging in:** login is email-OTP (`docs/decisions.md` #21) — enter an account's email, then check `http://localhost:8025` for the one-time code. Nothing is really "sent" anywhere: SMTP points at the local Mailpit catcher. Seeded accounts: `thelowlydev@gmail.com` (admin), `customer@example.com` (long history), `newcomer@example.com` (no disputes). To use a real inbox instead, put a real Gmail App Password in `SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` in `api/.env` or an untracked `api/.env.local`.

## Performance

One number, measured on the dev stack (`docker compose up`, `tsx` watch, single machine), against the seeded dataset (~4.3k transactions):

```
autocannon -c 20 -d 20   GET /v1/transactions?limit=20   (authenticated, paginated, indexed)
  → ~230 req/s   p50 79 ms   p97.5 171 ms   p99 223 ms
```

Throughput plateaus near **250 req/s** as concurrency rises (latency grows, RPS doesn't). For contrast, `GET /readyz` — a real DB round-trip with no session — sustains **~3,700 req/s at p99 15 ms** on the same stack. So Postgres and Fastify are not the ceiling: it's Better Auth's per-request session lookup on every authenticated route. The scaling lever (cache the session check, or move to stateless JWT sessions) is noted in `docs/scaling-and-resilience.md`; a production build (no watch/bind-mount, compiled output) would also lift the floor.

## Going to production

This repo is development-only by design (`docs/decisions.md` #42) — one `compose.yml`, one dev `Dockerfile` per package, no live deployment. **`docs/production-runbook.md`** is the step-by-step for making it production-ready: multi-stage images, orchestrator-injected secrets, migrations as a gated pre-deploy step, a registry-push + gated-deploy pipeline, and k8s manifests with the probes wired to `/healthz` + `/readyz`.

## CI

`.github/workflows/build.yml` runs on every push and PR. Job `check`: `lint` / `typecheck` / `build`, then `migrate` and `test` against `postgres:18` + `mailpit` service containers (the api's 36-test integration suite drives the real OTP flow, no forged sessions; the web package runs its own 8 unit tests in the same `test` step). Job `stack`: `docker compose up -d --build --wait`, hits `/healthz`, runs `db:seed` — proving the clean-clone path. No deploy pipeline (that's `docs/production-runbook.md`).

## Docs

Start with `CLAUDE.md`, then `docs/decisions.md` for the "why did you..." log and `docs/codebase-index.md` for a per-file map of the repo.
