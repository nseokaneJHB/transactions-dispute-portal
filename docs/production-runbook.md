# Production runbook

This repo is **development-only**. A fresh clone runs one command:

```sh
docker compose up -d          # Postgres, api, web, Mailpit, ntfy, an nginx reverse proxy; migrations run on api start
docker compose exec transaction-dispute-portal-api \
  pnpm --filter @transaction-dispute-portal/api db:seed   # once, for demo data
```

There is one `compose.yml`, one `Dockerfile` per package (a dev image: full workspace, `tsx`/`vite` watch, source bind-mounted), one committed `.env` per package plus `env/development/.env.database`. No live deployment, no staging, no production images are built anywhere.

That is a deliberate scope choice (`docs/decisions.md` #34, and the earlier #24–#27 / #32–#33 that built — then this pass removed — a staging pipeline). This document is the step-by-step for the reviewer's question *"and how would you actually ship this?"*. Nothing here is wired; each section is what you would add.

---

## 1. Build a real runtime image

The dev `Dockerfile` installs devDependencies and runs the TypeScript source through `tsx`. A production image should be multi-stage and ship only compiled output:

```dockerfile
# deps  — full workspace install (dev + prod) so the build can run
# build — pnpm --filter @transaction-dispute-portal/api... build   (tsc -> dist/)
# prod  — pnpm install --frozen-lockfile --prod   (no dev deps)
# runtime — FROM node:24-alpine, USER node, NODE_ENV=production
#   COPY --from=prod  node_modules (root + api + shared)
#   COPY --from=build api/dist shared/dist
#   COPY --from=build api/src/database/migrations   (static SQL, needed by the migrate runner)
#   CMD ["node", "dist/app.js"]
```

Notes carried over from when this existed:

- `shared/dist` loads `zod` at module-eval time, and the api runtime imports `shared` — so `shared/node_modules` must ship in the runtime stage, not just `api/node_modules`.
- The web SSR build externalises `react` / `react-dom` rather than bundling them, so the web runtime stage still needs `node_modules` alongside `dist/`.
- `drizzle-kit` stays a devDependency and never ships; the runtime uses the standalone `src/database/migrate.ts` runner (`node dist/database/migrate.js`).

Running the compiled artifact instead of `tsx` on source is what buys the fail-fast `tsc` gate in CI, a small attack surface, fast cold starts, and a deterministic artifact — see the discussion in the session notes / `docs/decisions.md`.

## 2. Configuration and secrets

Committed env files hold **working local-only fakes** (`docs/decisions.md` #34): a throwaway Postgres password, freshly-generated `BETTER_AUTH_SECRET` / `COOKIE_SECRET`, `SMTP_*` pointed at Mailpit, `NTFY_URL=http://ntfy`.

A real deployment:

- injects every value from the orchestrator's secret store (Kubernetes `Secret`, cloud secret manager) — **no `.env` file in the image or the repo**;
- generates fresh `BETTER_AUTH_SECRET` and `COOKIE_SECRET` (32+ bytes each) per environment;
- sets `NODE_ENV=production`, real `API_URL` / `FRONTEND_URL` / `CORS_ORIGIN`;
- keeps a real Gmail App Password (or SES/Postmark credentials) out of git — locally that already goes in an untracked `api/.env.local` (`docs/domain-model.md`), in production it is an orchestrator secret.

## 3. Networking: a stable public API URL, not a raw infra address

`web/.env`'s `VITE_API_URL` is a Vite **build-time** env var — Vite inlines it as a literal string into the client JS bundle when `web` is built, so it ships to every browser baked in. `SERVER_API_URL` is different: server-side code reads it from `process.env` at request time (SSR runs in Node, never in a browser), so a change there takes effect on the next server restart with no client involved at all. The risk is entirely on the `VITE_*` side.

That's the mechanism behind the "if we move to AWS with a new URL, what happens to a client already on the frontend" question. If `VITE_API_URL` points at a raw infrastructure address — an ALB's auto-generated DNS name, an ECS task's IP, anything that changes when compute moves — then every already-built `web` bundle has that address hardcoded, including one sitting open in a customer's browser right now. Moving infrastructure means that bundle's requests start failing the moment the old address stops resolving, and there's no way to push it a new URL short of the customer getting a fresh build (a reload after a redeploy, at best).

**Mitigation: `VITE_API_URL` never points at infrastructure directly — it points at one owned domain that a reverse proxy / load balancer sits behind**, and that domain is the only thing ever baked into a client bundle:

- **AWS shape:** a Route53 record for `api.<yourdomain>` → an Application Load Balancer (optionally CloudFront in front of it) → a target group pointing at whatever's currently serving traffic (an ECS service, an EKS Ingress, an EC2 Auto Scaling Group). Migrating infrastructure — new region, ECS → EKS, a whole new AWS account — is a change to what the target group points at. The frontend's built-in URL never changes, so no rebuild is needed and a customer mid-session never notices.
- **Kubernetes shape (§8 below):** the same indirection one layer down — `Ingress` *is* that reverse proxy: `api.<yourdomain>` → `Ingress` → `Service` → whichever `Deployment`'s pods are currently live. Swapping deployments behind a `Service` is invisible above the `Ingress` line.
- **This is now the dev stack's actual shape, not just prose:** `docs/decisions.md` #61 puts an nginx reverse proxy (`proxy/nginx.conf`) in front of `web`/`api`/`ntfy` in `compose.yml` — neither service publishes its own port any more, the proxy on `:80` is the only one that does. It's a toy version of exactly this section (one static config file instead of Route53 + an ALB + a target group), but it proves the same point live: the frontend is built against one address that never changes, and what's behind it can be swapped freely.
- The same reasoning applies to every other client-facing URL: `FRONTEND_URL` / `CORS_ORIGIN` (§2) and `NTFY_URL` (§6) should resolve through a domain the team owns, never a cloud-generated hostname, for the same reason.

**Further indirection, if it's ever worth the change:** serving `web` and `api` from the same origin (the reverse proxy routes `/api/*` on the frontend's own domain to the backend, instead of a separate `api.<yourdomain>`) removes even the domain-name dependency — `VITE_API_URL` becomes a relative path (`/api`) that's true by construction, nothing to bake in that could ever go stale. Not the default recommendation here: it changes the CORS/cookie model this repo's current auth flow relies on (`docs/decisions.md` #51's `withCredentials` + explicit `CORS_ORIGIN`), so it's a real architectural decision, not a networking tweak — worth its own `docs/decisions.md` entry if it's ever actually pursued, not built speculatively now.

## 4. Database

- Managed Postgres (RDS / Cloud SQL), not a container. Point `DATABASE_URL` at it.
- Connection pooling: the app opens one pool per instance; put PgBouncer (or the provider's proxy) in front once instance count grows.
- Backups + PITR enabled on the managed instance.

### Migrations as their own gated step

Do **not** run migrations from the app's start command in production (the dev `compose.yml` does this only because it is safe to re-run against a disposable database). A schema change is a reviewed, approved step, independent of the code rollout (`docs/decisions.md` #24).

The shape that existed before (`.github/workflows/migrate.yml`, removed in `docs/decisions.md` #42): `workflow_dispatch` → `drizzle-kit check` (snapshot/drift guard, no DB needed) → fail if the environment's `DATABASE_URL` secret is missing → `pnpm --filter @transaction-dispute-portal/api migrate`. `concurrency` with `cancel-in-progress: false` so two runs never touch one database at once.

## 5. Email (SMTP) — on the login-critical path

Login is email-OTP (`docs/decisions.md` #21, `docs/auth.md` §2): every sign-in sends a code over SMTP, so outbound email is a hard dependency, not best-effort.

- Real transactional provider (SES, Postmark, SendGrid), authenticated domain (SPF/DKIM/DMARC).
- `sendEmail` currently swallows transport errors (`docs/decisions.md` #31) — in production, surface them: alert on send-failure rate, and consider a fallback provider.
- Rate-limit knobs are `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW` (global) and `OTP.MAX_ATTEMPTS` (per-OTP, shared constant); the auth routes inherit the global window.

## 6. Notifications (ntfy)

Dispute-status changes publish to a per-user ntfy topic (`docs/notifications.md`). This is explicitly a *simulated* notification channel — not real push/SMS.

- Dev: the `ntfy` service in `compose.yml`, web UI on `localhost:8090`.
- Production: either run a self-hosted ntfy instance and set `NTFY_URL` to it, or accept that this stays a demo affordance. It must never carry auth credentials (OTP codes) — see the scope boundary in `docs/notifications.md`.

## 7. CI/CD

Current CI (`.github/workflows/build.yml`): lint / typecheck / build / test, plus a `docker compose up --wait` smoke test that seeds and hits `/healthz`.

To deploy, add a workflow that on `main`:

1. reuses the check job (`workflow_call`), then
2. builds the multi-stage `api` / `web` images and pushes them to a registry (GHCR: `ghcr.io/<owner>/transaction-dispute-portal-{api,web}`), tagged `sha-<commit>` and `latest`;
3. deploys — `kubectl apply` / Helm / Argo — into an environment protected by GitHub **Environments** required-reviewers (configured in repo Settings → Environments, not expressible in YAML — `docs/decisions.md` #25).

Build tags explicitly from `github.sha` / `github.ref_name`, not `docker/metadata-action` (`docs/decisions.md` #25). Keep migrations (§4) a separate manually-approved workflow, not a step here.

## 8. Kubernetes

`k8s/` manifests are not in the repo yet (CLAUDE.md lists them as a bonus). A minimal set:

- `Deployment` for api and web, `Service` each, `Ingress` with TLS.
- Probes wired to the endpoints that exist for exactly this: `livenessProbe` → `GET /healthz`, `readinessProbe` → `GET /readyz` (the latter does a 2s `select 1`, so it fails the pod out of rotation when the DB is unreachable — `docs/scaling-and-resilience.md`).
- `HorizontalPodAutoscaler` on CPU / RPS.
- Secrets from a `Secret` (or External Secrets Operator), config from a `ConfigMap`.
- A one-shot `Job` (or Argo pre-sync hook) for the migration step.

## 9. Observability and the load-test number

- Logs: structured JSON (Pino) to stdout, shipped by the platform. The `correlationId` (from `x-correlation-id` / `x-request-id`, echoed on every response) is the request-tracing key.
- Metrics: add a `/metrics` endpoint (prom-client) — request rate, p50/p95/p99 latency, error rate, pool saturation.
- The DoD asks for one load-test number (p95 / RPS) in the README: run `k6` / `autocannon` against `GET /v1/transactions` on the seeded dataset (~4.6k rows, pagination + indexes exercised) and record it.

## 10. Pre-ship checklist

- [ ] Multi-stage images build and run (`node dist/app.js`), non-root, no dev deps / source
- [ ] All secrets injected by the orchestrator; none in the image or git
- [ ] Fresh `BETTER_AUTH_SECRET` / `COOKIE_SECRET` per environment
- [ ] Managed Postgres with backups; `DATABASE_URL` points at it; pooling in front if multi-instance
- [ ] Migration workflow run and green before the app rollout
- [ ] Real SMTP with an authenticated domain; send-failure alerting
- [ ] Probes green (`/healthz`, `/readyz`), HPA configured
- [ ] Logs + metrics flowing; load-test number captured
