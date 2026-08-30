# Transactions Dispute Portal

Solo submission for an internal promotion evaluation. See `CLAUDE.md` and `docs/brief.md` for full context; `docs/decisions.md` for the "why" behind every non-trivial choice.

**Status: request stack + auth module wired** — the Drizzle schema, Better Auth (email-OTP), env validation, OTP email, the Fastify request stack (`build()`/`app.ts` split, middleware layer, module triad; `docs/decisions.md` #35), the `check` and `authentication` modules, and deterministic seed/purge scripts all exist and are verified. Still to come: the `transactions` / `disputes` / `admin` modules, Vitest tests, and the `web` UI. See `docs/codebase-index.md` for what actually exists on disk.

## Local setup

```sh
docker compose up
```

That's it — `api/.env`, `web/.env` and `env/.env.database` are committed with working local values (fake Postgres password, freshly-generated auth secrets; `docs/decisions.md` #34). `compose.yml` is the staging base; `compose.override.yml` holds the dev deltas and is auto-merged by any bare `docker compose` command, so the line above gives the full dev stack (source bind mounts, `tsx`/`vite` watch, Mailpit) with no flags.

- Web: http://localhost:3000
- API: http://localhost:8080
- Mailpit (caught local email): http://localhost:8025

**Logging in:** login is email-OTP (`docs/decisions.md` #21) — enter an account's email, then check `http://localhost:8025` for the one-time code. Nothing is really "sent" anywhere: SMTP points at the local Mailpit catcher. To use a real inbox instead, put a real Gmail App Password in `SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` — either in `api/.env` or in an untracked `api/.env.local` (the only env file `.gitignore` still ignores).

## Staging dry-run

`docker compose -f compose.yml up --build` runs the staging shape — the real `Dockerfile`s, built images, no source mounts, no Mailpit (`docs/decisions.md` #32/#34). It's a local sanity check of the deployable images; there's no live deployment target (`CLAUDE.md`). It reads the same committed `.env` files, so no extra setup. (OTP email won't send in this stack — no Mailpit — which is expected.)

## Migrations

`.github/workflows/migrate.yml` applies the committed migrations to the `staging` environment, triggered manually from the Actions tab (`docs/decisions.md` #33/#34). Dormant until the `staging` environment has a `DATABASE_URL` secret. Locally, `pnpm --filter @transaction-dispute-portal/api migrate` runs the same standalone runner against the compose database.

## CI/CD

`build.yml` runs lint/typecheck/build/test + a Docker build matrix — on every PR/non-`main` push standalone, and on `main` pushes as the first job of `deploy.yml` (called via `uses:`, so both show up as one connected run in the Actions tab instead of two separate entries — `docs/decisions.md` #26). `deploy.yml` then runs `staging` in the same run: builds both production images and pushes them to GHCR tagged `latest`, `staging`, and `sha-<commit>`. No production tier — no live infra to promote to, and none planned (`docs/decisions.md` #24/#34), so "deploy" means publishing a versioned, deployable image and stopping there.

## Docs

Start with `CLAUDE.md`, then `docs/decisions.md` for the "why did you..." log and `docs/codebase-index.md` for a per-file map of the repo.
