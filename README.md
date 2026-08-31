# Transactions Dispute Portal

Solo submission for an internal promotion evaluation. See `CLAUDE.md` and `docs/brief.md` for full context; `docs/decisions.md` for the "why" behind every non-trivial choice.

**Status: full API surface wired** — the Drizzle schema, Better Auth (email-OTP), env validation, OTP email, the Fastify request stack (`docs/decisions.md` #35), the `check` / `authentication` / `transaction` / `dispute` / `admin-dispute` modules (customer submit/list/detail + the full admin `submit → review → resolve` lifecycle, `docs/decisions.md` #40/#41), status notifications over ntfy, and deterministic seed/purge scripts all exist and are verified. Still to come: admin invites, Vitest tests, the `web` UI, and a deliberate pass on the dispute-lifecycle edge cases (`docs/decisions.md` #41 open item). See `docs/codebase-index.md` for what actually exists on disk.

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

## Going to production

This repo is development-only by design (`docs/decisions.md` #42) — one `compose.yml`, one dev `Dockerfile` per package, no live deployment. **`docs/production-runbook.md`** is the step-by-step for making it production-ready: multi-stage images, orchestrator-injected secrets, migrations as a gated pre-deploy step, a registry-push + gated-deploy pipeline, and k8s manifests with the probes wired to `/healthz` + `/readyz`.

## CI

`.github/workflows/build.yml` runs on every push and PR: `lint` / `typecheck` / `build` / `test`, then a second job that does `docker compose up -d --build --wait`, hits `/healthz`, and runs `db:seed` — proving the clean-clone path.

## Docs

Start with `CLAUDE.md`, then `docs/decisions.md` for the "why did you..." log and `docs/codebase-index.md` for a per-file map of the repo.
