# Transactions Dispute Portal

Solo submission for an internal promotion evaluation. See `CLAUDE.md` and `docs/brief.md` for full context; `docs/decisions.md` for the "why" behind every non-trivial choice.

**Status: initial scaffold** — `api`, `web`, `shared` are empty-but-runnable skeletons. See `docs/codebase-index.md` for what actually exists on disk.

## Local setup

No secret is ever committed as a real, working value (`docs/decisions.md` #20) — `api/.env` and `env/development/.env.database` are committed with every secret-shaped key blank. Before `docker-compose up` will work, create the gitignored local overrides and fill them in:

```sh
cp api/.env api/.env.local
cp env/development/.env.database env/development/.env.local.database
```

Then edit the two new files (both gitignored, never committed):

- **`api/.env.local`** — only these four keys need real values, everything else in the file is already real and working:
  - `DATABASE_URL` — `postgresql://postgres:<password>@transaction-dispute-portal-database:5432/transaction-dispute`, using the same `<password>` you set below in `.env.local.database`. (Host is the compose service name, not `localhost` — the api container reaches Postgres over the compose network.)
  - `BETTER_AUTH_SECRET`, `COOKIE_SECRET` — any random string works locally, e.g. `openssl rand -base64 32` for each.
  - Optional: `SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` with a real Gmail App Password, only if you want mail delivered to a real inbox instead of the local Mailpit catcher — see `docs/decisions.md` #19/#20.
- **`env/development/.env.local.database`** — `POSTGRES_PASSWORD=<the same password you used above>`.

`web/.env` (`VITE_APP_NAME`, `VITE_API_URL`) has no secrets and needs no local override — it's committed as-is and read directly by `compose.yml`.

Then:

```sh
docker-compose up
```

- Web: http://localhost:3000
- API: http://localhost:8080
- Mailpit (caught local email): http://localhost:8025

**Logging in:** login is email-OTP (`docs/decisions.md` #21) — enter an account's email, then check `http://localhost:8025` for the one-time code (the default committed config points SMTP at Mailpit, so nothing is ever really "sent" anywhere outside your own machine unless you filled in real Gmail creds above).

## CI/CD

`build.yml` runs lint/typecheck/build/test + a Docker build matrix — on every PR/non-`main` push standalone, and on `main` pushes as the first job of `deploy.yml` (called via `uses:`, so both show up as one connected run in the Actions tab instead of two separate entries — `docs/decisions.md` #26). `deploy.yml` then runs, in order, all in that same run:

- **staging** — deploys both apps automatically once `build` passes. Images tagged `staging` and `sha-<commit>`.
- **tag** — once staging passes for both apps, automatically bumps and pushes the next `v*` patch tag. No manual tagging step (`docs/decisions.md` #27).
- **production** — waits for a required reviewer to approve ("Review deployments" button in the run, GitHub Environments' protection rules, configured once in repo Settings → Environments → `production` → Required reviewers — not expressible in the workflow file itself). Images tagged `latest` and the auto-created tag (e.g. `v1.2.0`).

No live infra exists to deploy to (out of scope, `CLAUDE.md`) — "deploy" here means publishing a versioned, deployable image, which is the honest boundary given that. See `docs/decisions.md` #24.

## Docs

Start with `CLAUDE.md`, then `docs/decisions.md` for the "why did you..." log and `docs/codebase-index.md` for a per-file map of the repo.
