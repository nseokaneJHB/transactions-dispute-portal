# Transactions Dispute Portal

A customer-facing portal where bank customers view their transactions, dispute a charge, and track the dispute until an admin resolves it. Built solo for a Software Engineer II: Full Stack promotion evaluation. Background: `docs/requirements.md`; the "why" behind each choice: `docs/progress-and-decisions.md`.

**Stack:** TypeScript · Fastify + Drizzle + Postgres (`api`) · TanStack Start (`web`) · zod schemas shared between them (`shared`) · Better Auth (email one-time-code login) · Vitest · pnpm + Turborepo · Docker Compose.

## Run it

**Prerequisites:** Docker (with Compose v2), Node 24 (`.nvmrc`) and pnpm. Node 24 ships pnpm via corepack: run `corepack enable` once. With nvm, run `nvm use` in the repo first, because globally installed tools are per Node version.

```sh
git clone <repo-url> transaction-dispute-portal
cd transaction-dispute-portal

pnpm docker:up   # first run builds images; takes a few minutes
pnpm db:seed     # load demo data (re-run any time to reset it)
```

Docker only, without Node/pnpm on the host: `docker compose up -d --build --wait`, then `docker compose exec api pnpm db:seed`.

The committed `api/.env` and `web/.env` hold working local values (fake secrets, nothing real), so there's no setup step. Migrations run automatically when `api` starts.

| Open | URL | What it is |
| --- | --- | --- |
| **The app** | http://localhost:3000 | Customer + admin portal |
| **Mailpit** | http://localhost:8025 | Catches every email the app sends. **Your sign-in codes are here.** |
| ntfy | http://localhost:8090 | Live dispute-status notification server (the app subscribes to it) |
| API | http://localhost:8080 | The REST API, e.g. http://localhost:8080/healthz |
| Postgres | `localhost:5432` | `postgres` / `password`, database `transaction-dispute` |

Stop with `pnpm docker:down`. `pnpm docker:reset` also wipes the containers' volumes (database, `node_modules`) and the built images.

## Signing in

There are no passwords. Enter an account's email, open Mailpit (http://localhost:8025), and type the 6-digit code.

| Account | Role | Use it for |
| --- | --- | --- |
| `customer@gmail.com` | Customer | Long transaction + dispute history |
| `newcomer@gmail.com` | Customer | Clean slate, no disputes |
| `admin@gmail.com` | Admin | Review queue, resolving disputes, sending admin invites |

## Demo script (~5 min)

1. **Customer:** sign in as `customer@gmail.com` → **Transactions** → search/sort/filter → open one → **Dispute this transaction**.
2. In a second browser (or private window), sign in as `admin@gmail.com` → **Review queue** puts open disputes first → **Review** on the new one → **Move to review**. The customer's tab gets a live toast (via ntfy).
3. Admin → **Review** again → pick a **Decision** (resolved/rejected) + **Note to the customer** → **Submit decision**. The customer sees the status and note under **Disputes**.
4. Customer → open another dispute → **Withdraw dispute**.
5. Admin → **Invitations** → **Send an invite** → the invite link lands in Mailpit → accept it → sign in as the new admin.
6. Signing in from a new browser sends a "new device" email to Mailpit. Changing your email under **Account** sends an approval link to the *old* address first.

## API endpoints

All JSON. Every response uses one envelope, `{ code, message, data?, errors?, redirectUrl? }`. Lists add `limit`, `total` (rows on this page) and `next_cursor` / `prev_cursor`. Auth is a session cookie set by `POST /v1/auth/otp/verify`. Full contract and status codes: `docs/backend-service.md`.

**Health** (no auth)

| Method | Path | Does |
| --- | --- | --- |
| GET | `/healthz` | Liveness |
| GET | `/readyz` | Readiness: checks the DB answers |

**Auth**

| Method | Path | Auth | Does |
| --- | --- | --- | --- |
| POST | `/v1/auth/otp` | none | Email a sign-in code to `{ email }` (same response whether or not the account exists) |
| POST | `/v1/auth/otp/verify` | none | Exchange `{ email, otp }` for a session cookie |
| GET | `/v1/auth/session` | signed in | Who am I (id, email, role) |
| POST | `/v1/auth/sign-out` | any | End the session |
| POST | `/v1/auth/change-email` | signed in | Start an email change: approval link goes to the *current* address |
| POST | `/v1/auth/change-email/confirm` | none | Apply one step of the change with the emailed `{ token }` |

**Customer** (customer session; an admin session gets `403`)

| Method | Path | Does |
| --- | --- | --- |
| GET | `/v1/transactions` | Your transactions (paginated, search/date-range/sort) |
| GET | `/v1/transactions/:transactionId` | One of your transactions (someone else's → `404`) |
| POST | `/v1/disputes` | Dispute a transaction: `{ transactionId, reason, description }` (already open → `409`) |
| GET | `/v1/disputes` | Your disputes (filter by `status`, `transaction_id`) |
| GET | `/v1/disputes/:disputeId` | One of your disputes |
| POST | `/v1/disputes/:disputeId/withdraw` | Withdraw your own open dispute |

**Admin** (admin session; a customer session gets `403`)

| Method | Path | Does |
| --- | --- | --- |
| GET | `/v1/admin/disputes` | Review queue: every customer's disputes, unresolved oldest first |
| GET | `/v1/admin/disputes/summary` | Count of disputes per status (the stat cards) |
| POST | `/v1/admin/disputes/:disputeId/review` | `SUBMITTED → UNDER_REVIEW`, notifies the customer |
| POST | `/v1/admin/disputes/:disputeId/resolve` | `UNDER_REVIEW → RESOLVED \| REJECTED` with `{ resolution, note }`, notifies the customer |
| GET | `/v1/admin/invites` | Invites you've sent |
| POST | `/v1/admin/invites` | Invite a new admin by `{ email }` |
| POST | `/v1/admin/invites/:token/accept` | No auth: invitee sets `{ name }`, creating the admin account |

List endpoints share the query params `limit` (≤ 100), `cursor` (a `next_cursor` / `prev_cursor` from the previous response, or `last`), `search`, `from`/`to` (`YYYY-MM-DD`), `sort` (a per-endpoint whitelist) and `order` (`asc`/`desc`). Transactions, disputes and the review queue also take `min_amount_cents` / `max_amount_cents` (inclusive, ZAR cents; set from the amount slider in the UI's Filters modal).

**Dispute lifecycle:** `SUBMITTED → UNDER_REVIEW → RESOLVED | REJECTED`. The customer can `WITHDRAW` from either open state. It's forward-only, enforced in SQL, with one open dispute per transaction and an audit row for every transition.

## Tests and checks

These run on the host. Keep the compose stack up: the api tests use its Postgres (in a separate `transaction-dispute-test` database, so your demo data is untouched) and read sign-in codes from its Mailpit.

```sh
pnpm install
pnpm lint && pnpm typecheck && pnpm build
pnpm test        # 92 api tests (real OTP flow, real DB) + 12 web unit tests
```

Don't run `pnpm test` *inside* the `api` container. Its `DATABASE_URL` points at the dev database, which the suite would reset.

CI (`.github/workflows/build.yml`) runs the same checks on every push, plus a smoke test that runs `docker compose up`, hits `/healthz` and `/`, and seeds.

## Scripts

Run from the repo root with `pnpm <name>`.

| Script | Runs | Does |
| --- | --- | --- |
| `docker:up` | `docker compose up -d --build --wait` | Build (if needed) and start the stack, wait until healthy |
| `docker:down` | `docker compose down` | Stop and remove the containers, keep the data |
| `docker:logs` | `docker compose logs -f` | Follow every service's logs (`docker compose logs -f api` for one) |
| `docker:reset` | `docker compose down -v --rmi local --remove-orphans` | Full cleanup: containers, network, volumes (database included), built images |
| `db:seed` | `docker compose exec api pnpm db:seed` | Reset the demo data |
| `db:purge` | `docker compose exec api pnpm db:purge` | Empty every table, keep the schema |
| `clean` | `rm -rf node_modules dist .turbo …` | Delete host-side install/build output (keeps `pnpm-lock.yaml`) |

Source changes hot-reload without a restart. After editing a `.env` file, run `docker:up` again: a plain `docker compose restart` doesn't re-read env files.

## Troubleshooting

- **`address already in use` on startup.** Something else on your machine holds one of 3000, 8080, 5432, 1025, 8025 or 8090. Stop it, or change the left-hand side of that service's `ports:` in `compose.yml`. If it's 3000 or 8080, also update `CORS_ORIGIN`/`FRONTEND_URL` in `api/.env` and `VITE_API_URL` in `web/.env` to match.
- **No sign-in code arrives.** Codes never go to a real inbox. Look in Mailpit at http://localhost:8025.
- **First page load is slow.** Vite bundles dependencies on the first request after a fresh `up`. Later loads are fast.
- **Stuck after pulling new dependencies.** Run `pnpm docker:reset && pnpm docker:up`, then `pnpm db:seed`.

## Performance

One measurement on the dev stack (watch mode, single machine, seeded data): `autocannon -c 20 -d 20` against `GET /v1/transactions?limit=20` (authenticated) gives **~230 req/s, p50 79 ms, p99 223 ms**. `GET /readyz` (a DB round trip with no session) does ~3,700 req/s, so the ceiling is Better Auth's per-request session lookup, not Postgres or Fastify. The fix is in `docs/infrastructure.md`.

List queries at scale (2.2M transactions, 1.05M disputes): every list page, at any depth and on any sort, is an index seek of about 0.3–3 ms. Before the rework, a deep admin-queue page took 1.8 s and every admin request paid a 450 ms count. The before / after / current numbers, method and scripts are in `docs/list-query-performance.md`.

## Repo layout

```
api/      Fastify API: modules/<name>/{route,service,type}.ts, database/{schema,repository,migrations}, test/
web/      TanStack Start app: routes/, api/ (typed client), components/
shared/   zod schemas, types and constants used by both
docs/     design docs (below)
compose.yml, */Dockerfile   the dev stack
```

## Docs

| Doc | Read it for |
| --- | --- |
| `docs/requirements.md` | The brief and what must be true |
| `docs/progress-and-decisions.md` | Status, definition of done, and every "why did you..." decision |
| `docs/backend-service.md` | API contract, auth/OTP mechanics, lifecycle enforcement |
| `docs/frontend-service.md` | Web architecture: route gating, loaders, cache refresh, live toasts |
| `docs/infrastructure.md` | Container topology, data model, request-flow diagram |
| `docs/user-stories.md` | Every user flow and error case, end to end |
| `docs/dev-tools.md` | Mailpit and ntfy: why, and what replaces them in production |
| `docs/production-runbook.md` | How you'd actually ship this (images, secrets, pipeline, k8s) |
| `docs/list-query-performance.md` | Measured evidence for the list-query rework: before, after the index refactor, and now |
| `docs/presentation/engineering-exchange.md` | Engineering Exchange deck: the pagination evidence, TanStack, Drizzle, HTTP/2, Zod contracts, npm supply chain, Next.js vs this stack (Marp markdown) |
| `docs/codebase-index.md` | File-by-file map |

This repo is dev-only by design. There's no deployment; `docs/production-runbook.md` covers what production would add.
