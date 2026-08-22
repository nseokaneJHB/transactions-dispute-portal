# Repo layout & porting notes

## Repo layout

```
api/       # Fastify backend
web/       # TanStack Start frontend
shared/    # shared types: Transaction, Dispute, DisputeReason, etc.
turbo.json
pnpm-workspace.yaml
```

Flat, not nested under `apps/`/`packages/` — this matches `ubuntu-stories`' actual layout (`/home/nolan/Desktop/ubuntu-stories`) exactly, confirmed by inspecting the real repo. That's the repo to port patterns from, not the `ubuntustories`/`ubuntuStories` React Native projects also on the Desktop.

Root scripts (via turbo): `dev` (web+api concurrently), `lint`, `typecheck`, `format`. Each package also gets its own `build`/`typecheck`/`lint` scripts — see `docs/codebase-index.md` once scaffolded.

## Patterns to port from ubuntu-stories — don't rebuild these

- Better Auth setup and session handling
- Drizzle typed layer conventions (see Conventions in `CLAUDE.md`)
- The event-driven `sendEmail` dispatcher and its `EMAIL_TEMPLATES` map — extend with dispute-status templates rather than writing a new notification system
- `MutateToast` for mutation feedback
- Axios client with typed error handling

## Docker — production habits, not a demo container

- Multi-stage: deps → build → runtime, so the final image doesn't ship devDependencies or source maps
- Runs as a non-root user
- `.dockerignore` covers `node_modules`, `.env`, `.git`
- `docker-compose.yml` brings up the app + Postgres for local dev with one command
