# Progress & Decisions

## Progress

Backend and web frontend are both feature-complete. The Fastify API implements every planned module — auth (email-OTP sign-in, a session endpoint for the client, a two-step email change), transactions, disputes (submit/list/detail/withdraw), the admin review-then-resolve flow, and invite-only admin account creation — backed by a 63-test Vitest integration suite running in CI against real Postgres and Mailpit. `web` is a TanStack Start app with a session-gated route tree, loader-driven data fetching, one typed API client, and live dispute-status toasts over ntfy, with every customer and admin flow given a manual browser pass on top of its own unit tests. Two regression passes after the app first worked end to end fixed a post-mutation UI staleness bug, a missing-transaction-context gap, and a cross-user 404 crash (#52–#56), then consolidated the four list pages behind one generic `<DataList>`, added per-status review-queue stat cards, and put a real nginx reverse proxy in front of the whole dev stack (#57–#61). A later live-browser session found and fixed a dead toast-notification bug (#63). `docs/user-stories.md` walks every flow end to end per role; `docs/codebase-index.md` maps the repo file by file.

### Definition of done

- [x] View / dispute / historic-view all work end-to-end (verified live in a browser: sign in, view transactions, open/withdraw a dispute, sign in as admin, move to review, resolve — #52/#53/#54)
- [x] Dispute lifecycle enforced server-side, not just in the UI (#41/#45 — `dispute-lifecycle.test.ts`)
- [x] Auth scoping has a test proving you can't read another user's data (`transaction-scoping.test.ts` / `dispute-scoping.test.ts`, #47)
- [x] `POST /v1/admin/disputes/:id/resolve` is unreachable via a customer session, and reachable only with the `admin` role (`admin-authz.test.ts`, #16/#47)
- [x] Duplicate-dispute submission (retry/double-click) is rejected, not double-inserted (#40 — `duplicate-dispute.test.ts`)
- [x] Seed data is realistic and voluminous enough to justify the pagination/indexing story (~31 users, ~4.6k transactions, ~260 disputes)
- [x] `/healthz` and `/readyz` exist — k8s manifests + probe wiring are documented in `docs/production-runbook.md` §7, not built (#42)
- [x] One load-test number (p95 latency/RPS) is in the README — `autocannon` against `GET /v1/transactions`, dev stack, ~230 req/s / p97.5 171 ms; auth session-lookup identified as the ceiling
- [x] `docker compose up -d` on a clean checkout gives a working local stack incl. DB, migrations applied, zero setup — `.env` files committed with working local values (#34/#42). No standalone `docker build`/`run` — production containerisation is `docs/production-runbook.md` §1, not built.
- [x] README build/run/test steps verified on a clean machine (fresh `git clone`: `docker compose up -d --wait` + `db:seed` gives the documented 31/4306/265 seed counts and all five endpoints respond; `pnpm install --frozen-lockfile` + `turbo lint typecheck build test` also green — 44/44 tests pass, dev DB untouched)
- [x] CI green on default branch (build #18, `12924e0`, `.github/workflows/build.yml`)
- [x] Repo is public

### Regression proof

Full-suite regression re-run at `12924e0` (2026-09-09), in place (not a clean clone — that pass is the "clean machine" bullet above): `turbo run lint typecheck build test` across all three packages — 11/11 tasks green, 44/44 tests pass (36 api + 8 web), zero lint/typecheck errors. Dev database row counts checked before and after (31 users / 4,306 transactions / 265 disputes, unchanged) — the api test suite runs against its own isolated `transaction-dispute-test` database (#55), so it no longer touches the dev stack's seed data.

### Suggested pace

- Week 1 — data model, auth, API skeleton, seed data
- Week 2 — dispute business logic + tests
- Week 3 — front end (responsive, build tooling, browser-compat pass) + integration
- Week 4 — Docker, CI, README, `k8s/` manifests, dry run of the submission checklist

### Deferred / known gaps

- The original generic query-builder DSL (`core/helpers.ts` — hand-rolled `buildWhere`/`buildOrder`/generic CRUD) and the `CoreService`/per-table-class layer were speculative abstraction built ahead of any real caller; both were deleted in favor of plain per-module Drizzle queries and free functions (`docs/overkill-implementation.md` #1–#2, done 2026-08-30).
- The `event` middleware/`X-Event-Name` header/`EVENT_NAMES` registry, the duplicate correlation-id scheme, the custom Pino level redefinitions, and the three-state `readyz` health model were all trimmed as machinery with no real consumer (`docs/overkill-implementation.md` #3–#6, done 2026-08-30).
- The two overlapping rate limiters (global `@fastify/rate-limit` vs. Better Auth's own) were resolved by disabling Better Auth's built-in limiter and keeping the global limiter plus the OTP-attempt lockout as one documented layering (`docs/overkill-implementation.md` #7, done).
- `docs/enhance-suggestion.md` #1 (build the actual customer/admin flows end to end) and #2 (add the Vitest suite) were the two items that mattered most for the submission — both done; #2 landed as the 63-test integration suite (#47 below).
- Pagination's unfiltered double-count and unbounded `limit`, the missing stable sort tiebreak, and untyped repo-layer errors surfacing as `500`s (`docs/enhance-suggestion.md` #3/#4/#6) were rendered moot by the same deletion — the plain per-module queries don't have this class of bug. Idempotent dispute submission (`docs/enhance-suggestion.md` #5) was deliberately not built as an `Idempotency-Key` column; the DB partial unique index plus a global 409 handler covers it instead (#40 below).
- The `readyz` timeout and the shutdown-ordering fix (`docs/enhance-suggestion.md` #7/#8) both shipped.
- A backend audit (2026-09-06) found and fixed two real bugs in place — a broken sign-in link in the new-device alert email, and a stale `from_status` on a withdraw audit row racing an admin review (#45/#49 below) — plus three smaller cross-module consistency fixes.
- Genuinely still open, none blocking submission (`docs/enhance-suggestion.md`'s "Backend audit" section, E1/E2/E3/E5/E6/E7/E8/E9/E10): coarsening new-device fingerprinting so a browser point-release doesn't trigger a false alert; suppressing the new-device alert on an account's very first login; routing best-effort email/ntfy send failures through structured logging instead of `console.error`; an integration test pinning Better Auth's two-step email-change token handling; splitting the change-email request/confirm rate limits; an `EMAIL_CHANGE_CONFIRMED` audit row; minor env-var and timeout-constant duplication; and a product decision on whether confirming an email change from a link should also log the user in.

---

A running log of non-obvious engineering decisions: the problem each one solves, what we did, the alternative(s) actually considered, and why the chosen approach solves the problem better _for this project_ — not just "which is better in general." Alternatives aren't strawmen; some are genuinely better in a different context, and that context is called out.

This is the doc to open before an interview question that starts with "why did you..." — and the doc to add to the moment a real design decision gets made during implementation, not retrofitted afterward. Numbered in the order decided, oldest first.

---

## 1. Auth: originally username+password, not Google OAuth or passwordless email-OTP

**Problem:** Customer auth is the one thing every other feature depends on, for a single, no-redo review event.

**Decision:** Plain Better Auth username+password — self-contained, no external identity provider, no delivery channel, works entirely inside `docker-compose up`.

**Why not the alternatives:** Google OAuth relocates the sensitive-data problem (`GOOGLE_CLIENT_SECRET` custody, CSRF/PKCE, ID-token verification) and adds a hard external dependency — an unverified OAuth app shows warning screens to non-whitelisted accounts, a real risk if the reviewer's Google account isn't a test user. Passwordless email-OTP needs a real delivery channel (real Gmail SMTP, or an insecure stand-in) — see decision 3.

_Superseded by decision 21:_ reversed by explicit instruction — login is email-OTP, precisely the "insecure stand-in" tradeoff this decision rejected. See #21.

## 2. Dispute resolution: an internal-only route, not a customer-facing endpoint

**Problem:** No admin portal existed, but the dispute-status-change event (decision 3) needed something to trigger it.

**Decision:** `POST /internal/disputes/:id/resolve`, gated by a shared-secret header (`x-internal-token`), deliberately outside the customer Better Auth session model — kept separate from customer auth rather than letting a customer resolve their own dispute (backwards for the domain, and a real authz hole otherwise).

_Superseded by decision 16:_ a real (small) admin portal replaces this outright — the route and `INTERNAL_API_TOKEN` are removed. See #16.

## 3. Notifications: self-hosted ntfy, not real email/SMS or a bare console.log

**Problem:** The brief only requires a simulated notification on dispute status change — a bare `console.log` would be the least convincing demo of an event-driven architecture.

**Decision:** Publish to a self-hosted [ntfy](https://github.com/binwiederhier/ntfy) topic (per-user) on status change (`docs/dev-tools.md`), chosen over real email/SMS (a worse demo — spam/delay risk vs. ntfy's instant on-screen push, even though SMTP is used elsewhere for auth, decision 14) and over plain `console.log` (zero dependency but the least honest attempt at the JD's event-driven line). Explicitly not used for OTP delivery — pub/sub topics are broadcast by design, the wrong shape for a credential (`docs/dev-tools.md`).

**How it solves the problem:** A real HTTP pub/sub delivery watchable live, self-hosted so the submission doesn't depend on a third party during review.

## 4. Idempotency: reject duplicate disputes server-side, not just client-side

**Problem:** Dispute creation is a financial action — a retry or double-click submitting two disputes on one transaction is a realistic failure mode.

**Decision:** `POST /api/disputes` rejects a second dispute while one is already `submitted`/`under_review` on the same transaction, enforced at the DB level, not just a disabled submit button (which doesn't survive a retry, a second tab, or a client bug).

## 5. TypeScript: staying on 6.0.3, not adopting 7.0 yet

**Problem:** TypeScript 7.0 (the Go-native rewrite, ~10x faster) reached GA July 2026 — worth knowing about, not necessarily worth adopting yet.

**Decision:** Stay on `typescript@6.0.3`. TS 7.0 shipped without a stable programmatic Compiler API (landing in 7.1), and `typescript-eslint` — which `pnpm lint` depends on — filed-and-closed a "not planned until 7.1" issue on GA day; switching would break CI outright. Revisit once `typescript-eslint` ships 7.x support.

## 6. Node & pnpm: latest Active LTS, not latest overall

**Problem:** "Latest version" is ambiguous — Node 26 was already out and newer than Node 24.

**Decision:** Node 24.19.0 ("Krypton", Active LTS) and pnpm 11.22.0 (latest stable; pnpm 12 is RC-only) — Node 26 is "Current," not LTS until 2026-10-28, the wrong tradeoff for demonstrating production judgment, where "stable" means the maintained-for-years line.

## 7. `shared` compiles to `dist/`, not `.ts` source directly

**Problem:** `api` ships compiled `dist/app.js` run by plain `node` (decision 9), but `shared`'s `package.json` pointed `exports` at `.ts` source directly — fine under `tsx`/`vite`, but plain `node` can't resolve a `.ts` import target.

**Decision:** `shared` gets a real `tsc` build step; `exports` points at `dist/index.js`/`dist/index.d.ts`; `turbo.json`'s `typecheck` depends on `^build` so `dist` exists before dependents typecheck. Found by building and running the production image, not by inspection — `pnpm build` failed with a real `tsc` `rootDir` error the first time.

## 8. API production runtime: compiled JS + `node`, not `tsx`

**Problem:** How the production container actually runs the compiled app — `tsx` (used in `Dockerfile.dev` for watch-mode convenience) was the closest available shortcut.

**Decision:** Build stage runs `tsc` to `dist/`; runtime stage runs `node dist/app.js`; `tsx` stays dev-only. Running `tsx` in production too was rejected: it's a devDependency (violates the no-devDependencies-in-the-final-image rule), re-transpiles on every cold start (fights the HPA/autoscaling story in `docs/infrastructure.md`), and doesn't type-check.

## 9. Web production runtime: `srvx`-wrapped Node server, not TanStack Start's build output directly

**Problem:** `vite build`'s `dist/server/server.js` exits cleanly with zero output when run with plain `node` — it never listens on a port.

**Decision:** `web/server.mjs` wraps the built handler with `srvx` (`serve({ fetch: handler.fetch, port, hostname: "0.0.0.0" })`, promoted to a direct dependency) — TanStack Start's build target is a bare Web-standard `fetch` handler meant for a hosting adapter, not a self-starting server. Caught only by building and running the production image, not by reading docs.

## 10. Kubernetes: manifests with substance, not live deployment

**Problem:** The Kubernetes/containerization JD line needs to be earned without a month-long budget or real infra to run a cluster.

**Decision:** `k8s/` manifests with substance — `replicas: 3`, resource requests/limits, an HPA keyed on CPU, a PodDisruptionBudget — real enough to point to on screen, plus a README paragraph on the intended AWS target (ECS/Fargate + RDS), never actually deployed. Skipping Kubernetes for just the README paragraph was rejected — "we thought about it" is a much weaker answer than a manifest an interviewer can actually read.

## 11. CI: lint/typecheck/build/test + a Docker build matrix, not a deploy pipeline

**Problem:** "CI green on default branch" is a hard DoD item, and the two production Dockerfiles already had real bugs (decisions 7–9) that only a full `docker build` catches.

**Decision:** `.github/workflows/ci.yml` — one job for lint/typecheck/build/test, a second matrix job building both production Dockerfiles, no deploy step. Skipping the Docker-build job to save CI minutes was rejected — it would have let the `rootDir`/`srvx`/`node_modules` bugs merge silently, and those bugs were real, not hypothetical.

## 12. Login credential integrity: rate limiting, not CAPTCHA

**Problem:** Proving someone knew the right credential (decision 1) doesn't prove it wasn't guessed or brute-forced.

**Decision:** Per-account rate limiting with progressive backoff on login, over a hosted CAPTCHA (hCaptcha/Turnstile/reCAPTCHA) — same reasoning as rejecting Google OAuth in decision 1: an external dependency sitting in front of the one flow the reviewer has to use, for the one event with no do-over.

_Superseded by decision 21:_ the credential model this targeted no longer exists; per-account rate limiting survives, retargeted from login-guessing to OTP-code-guessing — see `docs/backend-service.md` §1.

## 13. Signup email verification: documented, not built

**Problem:** Classic email verification needs a real outbound channel, and building it would gate a flow the demo doesn't actually exercise.

**Decision:** State the production answer (a real transactional email provider) in `docs/backend-service.md`; don't build it — self-registration isn't in the reviewed path anyway (the reviewer signs into seeded accounts with real transaction history), and a self-hosted mail catcher (MailHog/Mailpit) wouldn't deliver to a real inbox regardless.

_Correction on this entry's original reasoning:_ the first version wrongly equated this with decision 1's Gmail-dependency rejection. Decision 1 rejected Google OAuth as the **login mechanism**, where an outage blocks every login; outbound SMTP (used for decision 14) is a notification channel that only delays, never blocks — the two were never in tension.

_Superseded by decision 17:_ revisited again — this is now actually built. See #17.

## 14. Account-recovery & compromise alerts: build via outbound SMTP

**Problem:** The login protections in decision 12 don't help _after_ a credential has already leaked — an account owner needs a way to notice and recover.

**Decision:** Provider-agnostic outbound SMTP (a Gmail App Password or any transactional provider), fire-and-forget and never on the login-critical path, for: new-device/new-location login alerts and email-changed confirmations sent to the _old_ address (`docs/backend-service.md` §3). Initially planned to skip this too, on the mistaken assumption that "avoid outbound email" was a blanket rule from decision 1 — it wasn't: decision 1's objection was specifically to an external identity provider gating the login path itself, and a notification channel that just arrives late carries no such risk. Without it, a compromised account has no recovery path short of manual support.

_Narrowed by decision 21, built by decision 46:_ one of the two original alerts is dropped as no longer applicable; both survivors (new-device alert, email-change approval) are implemented for real, not just documented. See #21, #46.

## 15. Local dev env files: committed with fresh secrets, not real ones

**Problem:** `docker-compose up` needs to work out of the box on a clean checkout, meaning local env files must exist and be committed — but committing *real* credentials (a Gmail App Password, a Google OAuth client secret tied to Nolan's real accounts) was briefly on the table as a shortcut.

**Decision:** Commit `api/.env`/`web/.env`/`env/development/.env.database` with freshly generated values (`BETTER_AUTH_SECRET`/`COOKIE_SECRET`/`INTERNAL_API_TOKEN`/Postgres password) — never real ones — SMTP pointed at a new local Mailpit service instead of real Gmail. Committing real values as literally requested was rejected outright: a real Gmail App Password or OAuth secret in a public repo's git history is a permanent leak, and moot anyway since decision 1 already ruled out Google OAuth. Mailpit is also a strict upgrade for viewing the decision-14 recovery emails — anyone who clones the repo can see them at `localhost:8025`, no real email account required.

_Superseded by decision 20, then largely restored by decision 34:_ #20 reversed the "commit working values" premise; #34 reverses that again — working local values are back, since they're fake local-only secrets with nothing to leak. The never-commit-real-account-credentials and Mailpit-over-Gmail parts still stand.

## 16. Admin portal: a real (small) one, superseding the internal-token workaround

**Problem:** Decision 2's `/internal/disputes/:id/resolve` was a shared-secret header standing in for a UI that didn't exist. Revisited: a demo with a real reviewer flow and role-based access is a stronger answer.

**Decision:** A minimal admin portal — a disputes-needing-review list and a resolve action, one or two pages — gated by a Better Auth session carrying an `admin` role, not a shared-secret header. Admin accounts are invite-only: a seeded admin emails an invite, and the link is what creates the account — no self-service admin signup. `/internal/disputes/:id/resolve` and `INTERNAL_API_TOKEN` are removed outright rather than kept alongside the portal — two live auth mechanisms for the same action would be two things to explain instead of one.

**How it solves the problem:** A real role-based authz story (customer vs. admin session, not two disconnected mechanisms) and a visual surface to demo resolution live.

## 17. Signup email verification: built, not documented-only (supersedes 13)

**Problem:** Decision 13 skipped building this because the demo path signs into seeded accounts, not self-registered ones. Revisited: proving a customer owns the email before they can dispute a *real* transaction is a genuine requirement, not a nicety for a flow the demo doesn't exercise.

**Decision:** Build it for real — accounts start `unverified`, a verification link goes out via outbound SMTP, every action is blocked (not soft-nudged) until the link is clicked. Seeded demo accounts ship pre-verified so the reviewed path is never gated by an email round-trip. Replacing the login mechanism itself with email-OTP/magic-link was rejected again here — that would put email delivery on the login-critical path decision 1 protected; a signup-time gate only blocks the rare self-registration path, not every login.

_Superseded by decision 21:_ decision 1's login-path protection this decision was careful not to reopen gets reopened anyway, by explicit instruction — email-OTP login means every login already re-proves email ownership, making this separate signup-verification step redundant. Folded into the OTP decision. See #21.

## 18. API versioning: `/v1/` prefix

**Problem:** No versioning scheme had been decided; unversioned routes (`/api/...`) don't communicate a compatibility contract.

**Decision:** Public and admin routes move under `/v1/` — `/v1/disputes`, `/v1/transactions`, `/v1/admin/...`. Health checks (`/healthz`, `/readyz`) stay unversioned — they're infra probes, not API consumers. Costs nothing to get right from the start versus retrofitting every route later.

## 19. Real outbound email for local testing: gitignored `.env.local`, never committed

**Problem:** Decision 15 keeps `api/.env` pointed at Mailpit for a zero-setup clean clone — but that also means nobody, including Nolan, can see a real verification/invite email land in an actual inbox without a second, uncommitted path to real SMTP.

**Decision:** `api/.env.local` (gitignored, matching the `.env.*` pattern) can hold a real Gmail App Password for local testing only; `compose.yml` lists it as a second, `required: false` `env_file` entry layering on top when present, silently skipped otherwise. Committing the real credentials directly, as first asked, was rejected for the same reason as decision 15: a public repo's git history is permanent.

_Superseded by decision 20, then decision 34:_ #20 generalized this override to every secret-shaped value; #34 removes the override files entirely — real Gmail creds now go straight into `api/.env`, or a personal untracked `.env.local` if preferred. See #34.

## 20. Committed env files hold blanked secrets, not working values — `.env.local` (no template) required per package

**Problem:** Decision 15 committed real (freshly generated, never externally-tied) working values so a clean clone runs zero-setup. Revisited: even a generated secret with no external account behind it (`BETTER_AUTH_SECRET`, `POSTGRES_PASSWORD`) is still a real secret sitting in git history — the new preference is that *no* secret, however low-stakes, is ever committed working.

**Decision:** Every secret-shaped value in a committed env file is blank (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `COOKIE_SECRET`, `POSTGRES_PASSWORD`); non-secret operational config stays real, since blanking it buys no security. Real values live in a gitignored `.env.local` per package, layered on by `compose.yml`. No committed `.example` template — the committed file already shows the key names; README's "Local setup" is the instructions.

**Alternative, and why this is a real reversal, not a refinement:** keeping decision 15's zero-setup model with `.env.local` scoped only to genuinely external credentials (SMTP) is what was actually asked for and answered one exchange earlier in this same session — revisited immediately after by explicit instruction: "no live secrets in git, however low-stakes" was judged worth losing the zero-setup convenience for.

_Superseded by decision 34:_ the blank-secret model is reversed back — a generated secret with nothing real behind it being technically "a secret in git history" was judged, on reflection, to cost more than it's worth for a repo with no live deployment. See #34.

## 21. Auth: email-OTP login, no password — reverses decision 1

**Problem:** Restated from decision 1 — however customer auth is done, it becomes the single thing every other feature depends on for the one review event that matters. Revisited by explicit instruction: username+password is out, replaced with Better Auth's email-OTP plugin.

**Why not username+password:** a stored credential is something to get right forever — hashing, strength rules, breach-checking, reset flows. OTP collapses that whole category: there's no long-lived secret to store, guess, reuse from a breach, or reset, since the "credential" is a fresh one-time code proven by owning the inbox, every login. It also removes decision 1's separate signup-verification step, since OTP re-proves email ownership on every login.

**Decision:** Email-OTP is the only login mechanism (`docs/backend-service.md`: rate limiting/lockout on verify attempts, short code expiry, audit log). This is, in fact, the same model explicitly rejected two exchanges earlier in this same session — recorded here as a direct reversal, not a refinement, at the cost of reopening the exact dependency decision 1 avoided: outbound email is now on every login's path, not zero.

**Resolved:** Mailpit is accepted as sufficient for dev/demo (no manual setup); real SMTP is documented as a production requirement (`docs/backend-service.md` §2), not built — the same "documented, not built" pattern decision 13 originally used. Mailpit's lack of per-mailbox access control is explicitly a production concern, resolved by not using Mailpit in production.

## 22. API response envelope: a generic `globalResponseSchema`/`paginatedGlobalResponseSchema`

**Problem:** `docs/backend-service.md` only had a placeholder error shape — no real answer for success responses, field-level errors, or pagination metadata.

**Decision:** A generic response envelope in `shared` — `globalResponseSchema` (`code`, `message`, optional `redirectUrl`, optional `errors: [{ field, message }]`) and `paginatedGlobalResponseSchema` (adds `count`/`total`/`page`/`limit`); endpoints extend either with `.extend({ data })`. Only the minimal dependencies these two schemas actually need shipped with it — nothing domain-specific bolted on speculatively (`CLAUDE.md`'s no-speculative-abstraction rule). Caught one real bug while building it: `tsconfig.base.json`'s `moduleResolution: "Bundler"` doesn't rewrite relative-import extensions, but `shared`'s compiled output needs explicit `.js` extensions to run under plain Node ESM — fixed and verified by running the built output through `node`, not just `tsc`.

## 23. DB engine: Postgres, not MySQL

**Problem:** Left open as a real choice in `CLAUDE.md`'s maintainer note — no functional difference for this brief.

**Decision:** Postgres — already the default throughout `compose.yml`/env files, so this closes the question rather than changing anything. MySQL/RDS experience remains a fine talking point without the code needing to reflect it.

## 24. CI/CD split into `build.yml`/`deploy.yml`; migrations run standalone, decoupled from API boot

**Problem:** The single `ci.yml` conflated verification with publishing, with no live infra to deploy to; separately, there was no way to run Drizzle migrations independent of the API process.

**Decision:** `ci.yml` renamed `build.yml` (unchanged checks); a new `deploy.yml` triggers on `build.yml` succeeding on `main` or a `v*` tag, builds both production images, and pushes them to GHCR — the honest boundary given no live infra is to publish a versioned artifact and stop, not fake a deploy against nothing. Migrations get their own layout mirroring Nolan's prior project (Ubuntu Stories), consolidated under one `api/src/database/` directory, with one deliberate deviation: a standalone `migrate.ts` using `drizzle-orm`'s runtime migrator instead of `drizzle-kit migrate`, since `drizzle-kit` is a devDependency this repo's pruned production image doesn't ship. Running migrations automatically on API startup was rejected — it couples schema changes to every boot/restart/scale-out event.

_Revised by decision 25, finalised by decision 42:_ the pipeline shape here is fully superseded — see #42 for the end state (one `build.yml`, no deploy workflow; the dev stack runs `migrate` on api start).

## 25. Deploy: staging (auto) / production (gated) via GitHub Environments; drop `docker/metadata-action`

**Problem:** Decision 24's single `publish` job failed its first real run — `docker/metadata-action`'s `context: git` can't introspect a detached-HEAD, single-SHA checkout. Separately, production needed a human approval gate that staging shouldn't have.

**Decision:** Split into `staging` (auto-deploys whenever `build.yml` succeeds on `main`) and `production` (`v*` tag, gated by a GitHub Environment's required-reviewer rule, configured once by hand in repo settings); `docker/metadata-action` is dropped entirely in favor of tags built explicitly from known event context, removing the whole class of failure rather than patching the one instance. Fixing `context: git` narrowly (adding `fetch-depth: 0`, checking out a real branch) was rejected — it still leaves tag construction depending on the same kind of implicit inference that failed silently until an actual run caught it.

_Superseded by decision 34, then decision 42:_ the `production` tier is removed (#34), then the whole pipeline is removed (#42). The required-reviewer pattern and explicit-tagging approach are preserved in `docs/production-runbook.md` §6 for a real future pipeline.

## 26. `deploy.yml` calls `build.yml` via `workflow_call`, not `workflow_run`

**Problem:** With `workflow_run`, `build.yml`/`deploy.yml` were two independently-triggered runs, only loosely linked — two separate Actions-tab entries instead of one visible build→staging→production flow.

**Decision:** `deploy.yml` triggers directly on push/tag and calls `build.yml` via `uses: ./.github/workflows/build.yml` (`workflow_call`), so GitHub renders one connected job graph. Fully separate per-app job chains were considered and deferred — `needs:` in a caller workflow can only depend on the reusable call as a whole, not an individual job inside it.

_Revised by decision 27, narrowed by decision 34, superseded by decision 42:_ the tag-push trigger this decision describes is removed by #27; the graph shrinks to `build → staging` only under #34; there is no `deploy.yml` at all after #42.

## 27. Production trigger: auto-created tag after staging succeeds, not a manual `v*` push

**Problem:** Decision 26 still required a manual `v*` tag push to reach production — a disconnected manual step in an otherwise visually-connected pipeline.

**Decision:** `deploy.yml` drops the tag-push trigger; a new `tag` job (`needs: staging`) auto-bumps the patch version and pushes the tag using the job's own `GITHUB_TOKEN` (which deliberately doesn't trigger a second run, by GitHub design) — `production` then runs in the same run, gated by `needs: tag`. A PAT/deploy-key to let the tag push trigger its own fresh run was rejected — it reintroduces the exact two-runs problem decision 26 just fixed.

_Superseded by decision 34, then decision 42:_ the `tag` and `production` jobs are removed by #34; `deploy.yml` is deleted outright by #42.

## 28. Drizzle schema & Better Auth wiring: mirror the Ubuntu Stories house style, don't invent one

**Problem:** The domain + auth tables needed a concrete Drizzle schema and Better Auth wiring — invent a fresh convention, or reuse the one from a project already in production (Ubuntu Stories)?

**Decision:** Mirror Ubuntu Stories verbatim: one table per file (`XxxModel`, snake_case columns, uuid PKs), relations centralized in one `relations.ts`, `pgEnum` for every enum generated from SCREAMING_SNAKE constants in `shared`, `bigint` cents for money rather than `numeric` (avoids float/decimal representation questions entirely), a partial unique index enforcing the one-open-dispute rule in-schema (ties to #4), `auth_audit_log` keyed by `email` rather than `user_id` (a failed login may name no real user), and Better Auth wired via `drizzleAdapter` with explicit split tables + `fields` maps rather than auto-created tables (`emailAndPassword` off, `emailOTP` only — 6-digit, hashed, 10-min expiry, 5 attempts, #21; row IDs routed through the same v7 generator as #29). A repository/service layer over Drizzle from the start was rejected per the no-speculative-abstraction rule — there's no second caller yet; the `XxxModelUniqueWhere` types are the one concession, costing almost nothing while defining the lookup contract query code leans on.

**How it solves the problem:** The schema looks like code that already ships in production, and every enum/ID/money choice has a one-line defensible reason.

## 29. Primary keys: UUID v7 via Postgres 18's native `uuidv7()`, no separate public-id column

**Problem:** Sequential integer PKs leak information and are enumerable if they ever reach a URL — the usual fix is a separate opaque public-id column.

**Decision:** Every PK is `uuid("id").primaryKey().default(sql\`uuidv7()\`)` — Postgres 18's native function, no extension needed. No separate public-id column, since a v7 UUID is already non-guessable. A separate `public_id` was rejected as pure ceremony with nothing extra to protect; UUID v4 (Ubuntu Stories' choice) was rejected because full randomness scatters every insert across the PK's B-tree, where v7's timestamp-ordered high bits keep inserts roughly append-ordered — a deliberate divergence from Ubuntu Stories, possible only because this repo is on Postgres 18 where `uuidv7()` is native.

## 30. Enum wire values: SCREAMING_SNAKE, not lowercase

**Problem:** Enum constants needed a canonical wire form; docs originally sketched them lowercase (`submitted`, `fraudulent_charge`).

**Decision:** SCREAMING_SNAKE (`SUBMITTED`, `FRAUDULENT_CHARGE`, `ADMIN`) — matches Ubuntu Stories' convention exactly, so `pgEnum(...)` takes the constant objects directly with no case transform; the docs were updated to match rather than the code forking for aesthetics.

## 31. OTP email delivery: nodemailer + Mailpit, wired for real (not a stub)

**Problem:** Decision 21 accepted Mailpit as the dev/demo transport, but Better Auth's `sendVerificationOTP` callback was still a `console.warn` placeholder.

**Decision:** `nodemailer` (pinned, matching Ubuntu Stories) via one `lib/mailer.ts` that logs and swallows failures rather than throwing — Better Auth advises against awaiting OTP delivery (a timing side-channel), so a transport error must never surface as a login failure. Deviates from Ubuntu Stories by collapsing its transport/mailer split into one file and configuring `secure`/auth conditionally for Mailpit's plaintext, no-credential listener. Keeping it a stub and documenting real SMTP only was rejected — decision 21 already documents the *production* requirement; the point of Mailpit is that the demo login flow actually sends.

## 32. Compose split: `compose.yml` is the production base, `compose.override.yml` holds the dev deltas

**Problem:** `compose.yml` was a development compose — nothing ran the production Dockerfiles as a stack.

**Decision:** `compose.yml` becomes the production shape (real Dockerfiles, no bind mounts, no Mailpit); `compose.override.yml` holds dev-only deltas and auto-merges on a bare `docker compose up`, so the zero-setup dev experience is unchanged. Base and override needed distinct explicit `image:` names — without them a bare `up` after a `-f compose.yml build` reused the production image for the dev service and crashed on a missing compiled entrypoint.

_Revised by decision 34, superseded by decision 42:_ "production" becomes "staging" under #34; the split itself is deleted under #42, leaving one dev-only `compose.yml`.

## 33. Database migrations: a manually-triggered GitHub Actions workflow

**Problem:** Decision 24 built a standalone migration runner but nothing invoked it in CI/CD — a migration should be a deliberate, auditable action, not automatic on deploy.

**Decision:** A manually-triggered `migrate.yml` (`workflow_dispatch`, a staging/production environment choice), gated the same way as `deploy.yml`'s production tier, running `drizzle-kit check` then the migrate script — dormant, since no live database exists to target. Running migrations automatically before rollout was rejected for the same reason decision 24 decoupled migration from boot.

_Revised by decision 34, superseded by decision 42:_ narrowed to staging-only, then deleted outright — the dev `compose.yml` runs `migrate` on api start instead; a gated pre-deploy step for a real pipeline is `docs/production-runbook.md` §3.

## 34. Collapse to one committed `.env` per package; drop the production tier

**Problem:** Decisions #15→#19→#20 spent three rounds on committed env files, landing on blank secrets plus gitignored overrides; decisions #24→#25→#27 built a full `build → staging → tag → production` pipeline with a required-reviewer gate. Revisited by explicit instruction: both are more machinery than this project needs — the "secrets" involved are a local Postgres password and two freshly-generated auth secrets with no external-account access and no live deployment to leak into, and the `production` tier gates a promotion that will never happen.

**Decision:** One committed `.env` per package holding real, working local values again (`api/.env`, `env/.env.database`) — no `.env.local`/`.production` variants. `deploy.yml` shrinks to `build → staging`: the `tag` and `production` jobs, and the `production` GitHub Environment, are deleted; `staging` now also carries the `:latest` tag. `compose.yml` becomes the staging base, reading the same committed files directly. Keeping #20's blank-secret model and only dropping the production split was rejected — if the committed values are fake local-only secrets anyway, blanking them protects nothing and just adds a mandatory copy-and-fill step to every clone.

**How it solves the problem:** `docker compose up` works on a clean clone again with zero setup, and the pipeline describes exactly what exists — one build, one staging publish — instead of a promotion flow with no destination. Known wart: the staging compose run has no Mailpit, so OTP sends silently fail there (`sendEmail` swallows transport errors, #31) — acceptable for a staging sanity-check, not a real deployment.

_Finalised by decision 42:_ the "one `.env` per package with working values" model is kept and taken further; the staging tier itself is removed entirely. See #42.

## 35. API skeleton: mirror the Ubuntu Stories request stack, with the over-builds named and trimmed

**Problem:** Nothing on disk yet turned a request into a response — no app factory, plugin registration, module structure, or error/auth wiring. Same fork as #28: invent a fresh stack, or reuse Ubuntu Stories'.

**Decision:** Reuse the Ubuntu Stories structure — a `build()` factory split from `app.ts`, one `middleware/index.ts` registering every cross-cutting concern (helmet, CORS, rate-limit, cookie, zod compilers, error/not-found handlers, `authenticate`/`authorize`/`connection` decorators), and a `modules/<name>/{route,service,type}` triad mounted under `shared`'s `API_URLS`. Several Ubuntu Stories over-builds were deliberately trimmed rather than copied, each because the panel reads this repo against `CLAUDE.md`'s own no-speculative-abstraction rule: no generic query DSL (per-module hand-written Drizzle instead, #36), no event middleware, one correlation id not two, no custom Pino levels, a flat `readyz` instead of a three-state health model, and Better Auth's own rate limiter left off (the global limiter plus per-route caps cover it, #37). Full detail in `docs/overkill-implementation.md`.

## 36. Data access: per-table hand-written Drizzle functions taking an `Executor`, not a query builder

**Problem:** #35 deleted Ubuntu Stories' generic query DSL; query code still needs somewhere to live.

**Decision:** `api/src/database/repository/<table>.ts` — one file per table, plain arrow functions writing Drizzle queries by hand, each taking an `Executor` (the pooled connection or an open transaction) as its first argument, so the *caller* controls transaction scope. A full repository class/DI container was rejected per the no-speculative-abstraction rule — these are just functions, and it's the one piece of structure that already pays for itself (the dispute module needs transactions, auth doesn't).

## 37. Auth module: wrap Better Auth's server API in our own routes, don't mount its HTTP handler

**Problem:** Better Auth ships a catch-all handler mountable at `/v1/auth/*`, but then responses wouldn't match `shared`'s envelope, there'd be no `auth_audit_log` trail, and Better Auth's own rate limiter would own login-abuse instead of a chosen one.

**Decision:** `modules/authentication/` defines three explicit routes (`otp`, `otp/verify`, `sign-out`) whose services call `auth.api.*` and then shape the result into the shared envelope, forward `Set-Cookie` verbatim, write an `AUTH_EVENT` audit row, and apply a per-route rate limit derived from `shared`'s `OTP` constant — loose enough that Better Auth's own 5-attempt lockout is what a fat-fingering user actually hits, not a `429`. `/v1/auth/otp` responds identically whether or not the account exists — no user-probing.

## 38. Dates: `date-fns`

**Problem:** Date math was about to start (seed spread, resolve timestamps, range filters) with raw `Date` mutation as the default.

**Decision:** `date-fns` — operates on native `Date` (no wrapper type at the DB boundary, unlike luxon's `DateTime`), function-based and tree-shakeable, matching the repo's arrow-function style; `new Date()` for "now" stays fine. Chosen over luxon (a wrapper needing conversion at every DB read/write) and dayjs (mutable-by-default plugins, a less explicit API).

## 39. Customer data scoping: the owner filter is in the query, and a miss is a 404 not a 403

**Problem:** Customers must only read/act on their own data — where does the ownership check live, and what does a cross-owner request return?

**Decision:** The `user_id = :caller` predicate is part of every customer query itself, never a fetch-then-check — there is no code path that loads a row and then decides whether the caller may see it. A row that exists but isn't the caller's returns `404`, identical to a missing row, never `403` — a `403` confirms the id is real, where a uniform `404` leaks nothing (a malformed id is a separate `422` from schema validation). Route-level `authorize(CUSTOMER)` sits on top, since the admin surface is its own namespace, not a second way in.

**How it solves the problem:** The guarantee lives one layer down from the handler, in the repository query, so a new endpoint gets it by using the scoped function rather than re-implementing a check.

## 40. Dispute submission: the DB is the one-open-dispute guard, not an application pre-check

**Problem:** `POST /v1/disputes` needs an idempotent submit — reject a duplicate open dispute cleanly. A pre-check `SELECT`, or let the database reject it?

**Decision:** No pre-check, no `Idempotency-Key` header, no new column — the partial unique index from #4/#28 is the entire mechanism; a second open dispute hits a `23505` that the global error handler turns into a `409`. A pre-check `SELECT` was rejected as a TOCTOU race (two concurrent submits both pass, both insert) that needs the unique index anyway, making the `SELECT` redundant. Verified: 5 parallel submits for one transaction → exactly one `201`, four `409`s, one dispute row, one audit row.

## 41. Dispute lifecycle: forward-only, each transition guarded inside the `UPDATE … WHERE`

**Problem:** The lifecycle is `SUBMITTED → UNDER_REVIEW → RESOLVED | REJECTED`, but nothing yet moved a dispute into `UNDER_REVIEW`, and pre-check races (per #40) rule out a `SELECT`-then-`UPDATE` guard.

**Decision:** Add `POST .../review` (`SUBMITTED → UNDER_REVIEW`) alongside `.../resolve`, which now **requires** `UNDER_REVIEW` — resolving a still-`SUBMITTED` dispute is a `409`. Both transitions are guarded inside the `UPDATE … WHERE status = X` itself, not a prior read; an empty `RETURNING` means the wrong state, returned as `409` (a cheap pre-read only distinguishes that from a genuine `404`). `review` is idempotent. No `reviewer_id` — `UNDER_REVIEW` is a flag any admin can act on, matching the portal's minimal-by-design scope (#16). Backward/reopen edges were deliberately left as an open item rather than guessed at — resolved later by #45.

## 42. One dev-only environment; productionising the repo is a runbook, not a pipeline

**Problem:** #24–#27 built a `build → staging → tag → production` pipeline, #32 split prod/dev compose files, #33 added a manual migration workflow, #34 trimmed all of it to "staging only" but kept the shape. By explicit instruction: this repo never goes to production (`CLAUDE.md`), a promotion panel is the entire audience, and every one of those pieces models a deploy that doesn't exist.

**Decision:** One `compose.yml` (the override file's dev deltas folded in, plus the `ntfy` service); one `Dockerfile` per package (multi-stage production images deleted, `Dockerfile.dev` renamed `Dockerfile`); the api command chains `shared build && migrate && dev`, so a fresh clone works with no manual step (the `shared build` step is load-bearing — `dist/` is gitignored and nothing else builds it first). CI (`build.yml`) becomes checks plus a `docker compose` smoke test; `deploy.yml` and `migrate.yml` are deleted outright. Everything removed moves to `docs/production-runbook.md` — multi-stage images, a gated pipeline, k8s manifests, the load-test number — as the complete "how would you actually ship this" answer. Keeping #34's staging tier was rejected: it builds and pushes an image nobody deploys, and "staging" with no production is just a name for the only tier.

**How it solves the problem:** `git clone && docker compose up -d` is the whole setup, CI proves exactly that path, and the production story is told once, completely, in a document — not half-modelled across six workflow/compose files each needing a "this doesn't really deploy anywhere" caveat.

## 43. Repository reads: exclude columns with `getTableColumns` rest-spread

**Problem:** Customer-facing dispute/transaction queries must not expose `user_id`/`resolved_by`. A hand-listed `COLUMNS` object drifts when the schema grows; `SELECT *` plus `Omit<>` still returns every column over the wire.

**Decision:** `const { user_id, resolved_by, ...CUSTOMER_COLUMNS } = getTableColumns(DisputeModel)`, then `.select(CUSTOMER_COLUMNS)` — a real projection (verified against Postgres statement logging), expressed as "everything except these" so a new column is included automatically. Admin/internal reads that need every column keep a bare `.select()`. Drizzle's relational query API was rejected — this repo removed the relational/DSL layer (#35/#36).

## 44. Admin invites: a dedicated `admin_invite` table, not Better Auth's `verification`

**Problem:** #16 needs somewhere to persist a pending admin invite. Better Auth's `verification` table was the obvious first reuse candidate.

**Decision:** A hand-rolled `admin_invite` table (`email`, unique `token`, `expires_at`, nullable `accepted_at`, `invited_by`). `POST .../invites` 409s if an account already exists for the email and emails a token-bearing link (the token never appears in the response body). `POST .../invites/:token/accept` has no `authenticate` preHandler (the invitee has no session yet); the "still valid" check lives in the accept `UPDATE`'s `WHERE` clause (per #4/#41) so a concurrent second accept cleanly 409s, then creates the user in the same transaction. Reusing `verification` was rejected — it has no `invited_by` audit trail, Better Auth deletes rows on use (a second click should cleanly 409, not silently fail), and there's no Better Auth endpoint that creates an admin-role account from it anyway, so accept logic would be hand-written regardless.

## 45. Dispute lifecycle edge cases: `WITHDRAWN` is the only new state; "reopen" is a new dispute

**Problem:** #41 left real-world edge cases open: new evidence after a rejection, an admin who can't finish a review, a customer withdrawing a mistaken dispute, supervisor override, and whether any backward move notifies the customer.

**Decision:** Add `WITHDRAWN` as a terminal state, reachable only by the customer via `POST .../withdraw` from either open status — both ownership and open-status live in the guarded `UPDATE … WHERE`, and the handler runs in one transaction with a `SELECT … FOR UPDATE` first so a concurrent admin `review` can't make the audit row lie about the `from_status` (a real bug caught in the backend audit, item A2). "Reopening" a rejected dispute is just opening a *new* dispute — the partial unique index only blocks a second *open* dispute per transaction, so this already works with no `/reopen` endpoint or backward edge needed. An admin declining a review, and supervisor override of a resolved dispute, are both ruled out of scope — the first because `UNDER_REVIEW` has no assignee to hand back from, the second because a second admin tier is a back-office feature the minimal-by-design portal (#16) doesn't ask for.

**How it solves the problem:** Every edge case from #41 now has an explicit answer — one built, the rest ruled out against an existing scope decision — with the lifecycle staying forward-only.

## 46. Account-security emails: built on Better Auth's session hook and two-step change-email

**Problem:** #14 committed to new-device alerts and email-change confirmation over SMTP, and #21 made the account email the entire credential — so an attacker redirecting where OTP codes go *is* the whole attack. #14 was still documented-only.

**Decision:** A Better Auth `session.create.after` hook emails the account on a session from a first-seen user-agent for that user (fire-and-forget, never awaited into the login response, per #14). Change-email is a two-token dance: Better Auth emails an approval link to the **current** address first; only after that's clicked does a verification link go to the new one — so a live-session attacker can't silently redirect where codes land, since the real owner gets an approval request first. `POST .../change-email` writes an `EMAIL_CHANGE_REQUESTED` audit row; the confirm step (an unauthenticated link click with no user context) is deliberately not separately audited — capturing it would mean coupling to Better Auth's internal token shape for marginal gain, left as a documented open item. A single-step change-email (verify the new address only) was rejected outright — that's the exact redirect vector this exists to close.

**How it solves the problem:** A compromise now has a tripwire, and the one silent-takeover path #21 opened requires an approval the attacker can't intercept.

## 47. Tests: a Vitest integration suite that drives the real OTP flow, not forged sessions

**Problem:** Security-critical behaviour (cross-user isolation, admin-only routes, duplicate rejection, lifecycle guards, OTP rate limits) needed real test coverage — unit-test with mocked auth/DB, or run the stack for real?

**Decision:** Integration tests only (`api/test/**/*.test.ts`) — the same `build()` factory as `app.ts`, `app.inject()` against real Postgres and real Mailpit, sessions obtained by driving the actual OTP flow (reading the code out of Mailpit's HTTP API), never a forged session cookie. A shared `resetDatabase()` fixture truncates/reseeds a deterministic dataset per file. 33 tests across 8 files. Mocking Better Auth and the repository was rejected — the behaviour under test *is* the integration (the owner filter is in SQL #39, the lifecycle guard is an `UPDATE … WHERE` #41), so mocking any of it would test the mock.

## 48. Load-test number: measure once, document the fix rather than build it

**Problem:** One real load-test number (p95/RPS) was wanted in the README — a number beats a claim, for near-zero effort.

**Decision:** One `autocannon` run against `GET /v1/transactions` on the seeded ~4.3k-row dataset: ~230 req/s, p97.5 171 ms. A matching run against `GET /readyz` (no session, a real DB round-trip) hit ~3,700 req/s / p99 15 ms — isolating the ceiling on authenticated routes to Better Auth's per-request session lookup, not Postgres or Fastify. The mitigation (a short-TTL session cache, or Better Auth's cookie-cache/JWT mode) is written up as a "document, don't build" item in `docs/infrastructure.md`, rather than tuned blind against a dev-mode measurement.

## 49. Backend audit pass: fix the bugs and the cross-module inconsistencies, defer the hardening

**Problem:** A read-through after the four backend modules landed turned up ~20 findings — two real bugs, several "same concept, different idiom" inconsistencies, and a batch of hardening gaps.

**Decision:** Fixed only the bugs and cross-module inconsistencies now, deferred hardening to `docs/enhance-suggestion.md`. Bugs: the new-device alert email rendered a dead relative link (now built from `env.FRONTEND_URL`); the withdraw handler's audit row could record a stale `from_status` under a race with an admin review (fixed by #45's row lock). Consistency: a shared `isOpenDisputeStatus`/`isTerminalDisputeStatus` helper replaces a per-file status-list alias; `change-email` now writes its audit row like the OTP handlers. Fixing everything in one pass was rejected — several hardening items need their own design choices and bundling them would make the diff unreviewable.

## 50. `GET /v1/auth/session` and `buildUrlWithParams`: the two seams the frontend needs from the backend

**Problem:** `web` needs to know who's signed in (for route guards and role-based UI) without duplicating Better Auth's session shape or inferring login from a bare 200/401; separately, every parametrized client call risked drifting from `shared`'s route patterns via hand-templated strings.

**Decision:** `GET /v1/auth/session` returns the same fields `request.user` already carries, 401-ing with `redirectUrl` when there's no session — exactly what `_authenticated`'s guard branches on. `buildUrlWithParams(pattern, params)` in `shared` derives its `params` type from the pattern itself via a template-literal type, so a renamed `:param` breaks every call site at compile time instead of silently 404ing at runtime. Probing a protected endpoint to infer login status was rejected — it can't answer "what's my role," which the root guard needs on every navigation.

## 51. Frontend architecture: session-gated route tree, loaders for every fetch, one API client

**Problem:** `web` needed real decisions before any page was written: how a route knows who's signed in and which role's UI to show, how server data reaches a component (`CLAUDE.md`: loaders, never `useEffect`), how one API failure becomes one consistent message, and how the ntfy dispute-status events reach the browser live.

**Decision:** A `beforeLoad` root guard seeds session context once per navigation (#50), and two layout routes split by role via redirect, not conditional render — an admin session never even receives the customer bundle's data. Every read is a route loader + `ensureQueryData`, keyed on `loaderDeps` so filters/pagination re-fetch on navigation. One axios instance normalizes every failure (server envelope, network drop, anything else) into one `ApiError` shape, switching `baseURL` on `typeof window === "undefined"` since `localhost` from inside the web container can't reach the api container. `useToastMutation` wraps every mutation in one `sonner` `toast.promise`; `useDisputeNotifications` opens an `EventSource` on ntfy's per-user SSE topic. Fetching the session in a `useEffect` was rejected — exactly the pattern `CLAUDE.md` rules out, and it would flash unauthenticated before resolving.

## 52. Post-mutation staleness: `invalidateQueries` doesn't refetch what a loader reads, so `refreshQuery()` removes the cache entry instead

**Problem:** A first manual pass found every mutation's UI silently stale — the toast said success and the backend really had transitioned the row, but nothing on screen changed until a full reload. Two stacked bugs: `invalidateQueries`'s default `refetchType: "active"` only refetches queries with a live `useQuery` observer, and every read here is `ensureQueryData` inside a loader by design (#51) — nothing observes it that way. Forcing `refetchType: "all"` surfaced a worse bug: an SSR-hydrated query has no `queryFn` attached client-side, so forcing a refetch threw `Missing queryFn` silently, and the rerun loader's `ensureQueryData` only checks `data === undefined`, not invalidation state — so it just handed back the stale data.

**Decision:** `refreshQuery(queryClient, router, queryKeys)` calls `removeQueries` (not `invalidateQueries`) then `router.invalidate()` — deleting the `Query` object outright means the rerun loader's next `ensureQueryData` call sees an empty cache and does a genuine `fetchQuery` with the `queryFn` that same call supplies, sidestepping both problems at once. Every mutation site now goes through this one helper. Re-supplying a `queryFn` via `setQueryDefaults` before invalidating was rejected — it would need every call site to re-declare the loader's own fetch logic, the exact duplication loaders exist to avoid.

**How it solves the problem:** Verified live — withdraw, review, and resolve all update immediately with no manual reload.

## 53. Every dispute carries its own transaction's merchant, amount, and date

**Problem:** Nothing in the UI showed what was actually being disputed beyond a raw `transaction_id` — the gap traced back to the database query never joining `transaction` at all.

**Decision:** `disputeSchema` gains a nested `transaction: { merchant_name, amount_cents, transacted_at }`; every read-side repository function does an `innerJoin` (safe, since `transaction_id` is `NOT NULL`) and Drizzle reconstructs the nested shape directly. Write-path handlers already read the dispute/transaction once before the write (for ownership/status checks), so that same read is merged onto the mutation's response — zero extra queries anywhere. A second client-side fetch, or re-querying inside the write-path repository functions, were both rejected as needless duplicate round-trips for data already in hand.

## 54. Admin review queue: a compact table + modal instead of one always-expanded card per dispute

**Problem:** The review queue rendered one full-height card per dispute regardless of whether the reviewer was looking at it — wasted space, and heavier than the customer list right next to it.

**Decision:** A `Table` matching the customer list's row shape, with description/customer-id/resolve-controls moved into a `Dialog` opened per row — so the resolve form's state only mounts for the one dispute a reviewer clicks into. A collapsible accordion in place was rejected — it still leaves one DOM block per row at the queue's natural height, just visually folded.

## 55. Tests target their own database, never the dev stack's

**Problem:** `vitest.config.ts`'s `DATABASE_URL` fallback pointed at the same host/port/name the dev stack seeds — running tests outside `docker compose` silently truncated and re-seeded the realistic demo data.

**Decision:** Tests default to a distinct database name (`transaction-dispute-test`) on the same local Postgres, created and migrated by a new Vitest `globalSetup` (the migration runner was split into an exported, programmatically-callable function for this). Pointing the fallback at the dev stack's Docker-network hostname was rejected — that hostname only resolves inside the compose network, the exact case this bug lived in.

## 56. A targeted regression pass (customer + admin, not just the automated suite) found a stale-form gap, a missing history view, and a genuine framework-boundary bug

**Problem:** Clicking through the app as both roles (not just re-running tests) surfaced three gaps: the transaction page always rendered the dispute form even when one was already open (failing only with a `409` toast at the end); there was no way to see a transaction's *past* disputes at all; and navigating to another customer's dispute/transaction URL correctly `404`'d at the API but rendered the web app's generic crash screen instead of a real `404`.

**Decision:** The transaction page's loader also fetches the transaction's disputes and shows an "open dispute" card instead of the form when one exists, with a "dispute history" list of closed ones underneath — zero new queries, reusing the existing disputes-list query key so `refreshQuery` already covers it. For the crash screen: `rejectNotFound(error)` throws the router's own `notFound()` from inside each single-entity server function's catch block, while the error is still the real `ApiError`, *before* crossing the `createServerFn` RPC boundary — which round-trips only `notFound()`/`redirect()` intact and flattens every other thrown error to a bare `.message`. A first attempt at making `isApiError` recognize a plain-object-shaped error failed for exactly that reason: the boundary never sends `status`/`code` across at all, so no client-side shape-detection could recover them.

**How it solves the problem:** Verified live as both roles — the form never shows once a dispute is open, prior disputes are listed, and a cross-user URL now returns a real `404` instead of a crash screen; full suite still green (44/44).

## 57. One shared list query: every list endpoint extends `paginationQuerySchema`, whitelists its own `sort`, and refines the date range last

**Problem:** Four list surfaces had each grown their own query schema by hand, with duplicated pagination fields and no filtering on two of them; the frontend had a paginator but no search/date/sort UI.

**Decision:** `shared`'s `paginationQuerySchema` (`page`, `limit`, `search?`, `from?`, `to?`, `order?`, all coerced/validated) is the base every list query extends with its own whitelisted `sort` enum (a per-endpoint SCREAMING_SNAKE constant, so an unlisted `?sort=` is a `422`, never an interpolated column name) and its own filters. The string→column binding lives per-repository, not in `shared` (which has no `PgColumn` and no knowledge of joined-table columns); three small reusable helpers (`containsText`, `withinDays`, `sortDirection`) cover the actual repeated logic. On the web side, `ListControls` (apply-on-submit, not per-keystroke) and `SortableHeader` (a 3-state click cycle) drive the URL. A single generic `buildListQuery()` DSL was rejected as the exact over-abstraction #35/#36 already trimmed — the four queries differ in joins and scoping too much for one function to own.

**How it solves the problem:** All four endpoints share one validated base and differ only in their `sort` whitelist and filters; adding search/date/sort to the frontend was two shared components, not four page rewrites. 22 tests cover it.

## 58. Review queue: unresolved disputes float to the top by default, and the stat cards come from their own endpoint

**Problem:** The review queue ordered strictly by `created_at DESC` like the customer list — on ~260 mostly-resolved seeded disputes, this buried every open `SUBMITTED` dispute pages deep, with no at-a-glance sense of the queue's shape.

**Decision:** With no explicit `?sort`, the queue orders `status ASC, created_at ASC, id DESC` — the status enum is declared in lifecycle order, so open statuses sort first and the oldest unattended dispute leads; any explicit `?sort` overrides this. A separate `GET .../summary` endpoint returns a zero-filled per-status count, its query key a *prefix* of the list's so the existing post-mutation cache-removal already refreshes it too. Putting the counts on the list response itself was rejected — the list is filtered/paginated and the cards shouldn't be.

## 59. A second cleanup pass — web-inclusive this time — plus the generic `<DataList>` the four list pages finally earned

**Problem:** #49 was backend-only; the frontend had since grown a lot of surface fast, and a sweep turned up dead exports, duplicated list-response envelopes, and four list pages that had converged on an identical structure.

**Decision:** Delete confirmed-dead code; consolidate the four hand-rolled response envelopes into one `paginatedResponse()`; extract `<DataList>` — a generic component owning `ListControls` + sortable `Table` + `Pagination` — now that a fourth concrete caller (admin invites) proved the pattern wasn't speculative. Rename `useToastMutation` → `runToastMutation` (it calls no hooks, so the `use*` name was a rules-of-hooks trip hazard). Extracting `DataList` at the second caller was rejected in hindsight-confirmed fashion — the third and fourth pages revealed real divergence a two-caller abstraction would have guessed wrong.

**How it solves the problem:** The four list routes dropped ~370 lines for one ~150-line generic component; `turbo typecheck lint` green, 63 api + 7 web tests.

## 60. `formatDate`/`formatDateTime` and `withinDays` pin to a fixed business timezone, not the ambient one

**Problem:** `formatDate`/`formatDateTime` used `date-fns`'s ambient-timezone `format` — SSR runs in the container (UTC), the client re-renders in the browser (SAST) — causing a hydration mismatch on dates near a day boundary, flagged as a HIGH regression finding and left unfixed through #56–#59. The same root cause quietly affected the backend too: `withinDays`'s date-range filter drew its day boundary from the container's ambient clock, not the business's actual timezone.

**Decision:** Pin both to one explicit constant, `BUSINESS_TIMEZONE = "Africa/Johannesburg"` — `formatDate`/`formatDateTime` switch to `date-fns-tz`'s `formatInTimeZone` so the offset becomes a fixed fact of the string rather than a fact about whichever machine renders it; `withinDays` converts `from`/`to` as wall-clock dates *in* that zone to the correct UTC instants. This deliberately does not cater to international viewers — every rendered date and filter shows the bank's own operating-timezone calendar day, matching how real banking apps (this one's Capitec/FNB namesakes included) behave, since "the charge posted on date X" being one unambiguous fact matters more here than viewer-local convenience. A viewer-local-timezone approach was documented as a future option rather than built — the server has no way to know the browser's zone during SSR without a flash or a first-visit guess.

**How it solves the problem:** Both the display and filter paths now compute from one named constant; new tests force `process.env.TZ` to two different values in the same run and assert identical output — the previous suite never exercised this, which is how the bug survived three regression passes.

## 61. A real nginx reverse proxy in the dev stack — `web`/`api`/`ntfy` behind one front door

**Problem:** `docs/production-runbook.md` documents why a client-facing URL should be a stable domain behind a reverse proxy rather than a raw infra address — but the dev stack itself still pointed `VITE_API_URL`/`VITE_NTFY_URL` straight at each container's published port, exhibiting the exact anti-pattern being warned about.

**Decision:** An nginx container in front of `web`/`api`/`ntfy`, path-routed on one `:80` listener (`/v1/*` and health checks → api; `/ntfy/*` → ntfy, with `proxy_buffering off` and a long read timeout for SSE; everything else → web). `web`/`api` stop publishing their own ports — the proxy is genuinely the only front door. The app gets its own `/etc/hosts` name (`dispute-portal`) rather than bare `localhost`, closer to a real `api.<domain>` pattern. Two real bugs surfaced while wiring this up: Vite's dev-server Host-header allowlist rejected the proxied `Host: dispute-portal` header with a bare `403` (fixed via `server.allowedHosts`), and a stale named-volume `node_modules` state silently kept a new dependency unlinked even after a forced reinstall (fixed by removing the volume outright). An additive proxy on a new port alongside the existing ones was rejected — it would prove the routing works without proving the actual claim, that the client has no working path to the raw infra address.

**How it solves the problem:** `curl --resolve dispute-portal:...` proves every route works through one address; all six services report healthy with only the proxy publishing a port.

_Correction (#62):_ two of this entry's "solved" claims didn't actually hold up under a real browser session — see #62.

## 62. `dispute-portal` becomes the *actual* configured origin, not just the documented one — plus two bugs that only a real browser session surfaced

**Problem:** Testing #61 live, `localhost` still worked end-to-end with zero setup — backwards from the claim that only `dispute-portal` should. Root cause: `web/.env`'s `VITE_API_URL`/`VITE_NTFY_URL` and `api/.env`'s `CORS_ORIGIN`/`FRONTEND_URL` were never actually changed off `localhost` — #61's decision text described the intended end state, not what got committed. A second gap: `vite.config.ts` was missing the `allowedHosts` line #61 said it added.

**Decision:** Fix both for real — all four env values become `http://dispute-portal`, and `allowedHosts` is actually added. This isn't cosmetic: a CORS preflight from `Origin: http://localhost` now genuinely gets no `access-control-allow-origin` header and the browser blocks it. Fixing this for real then surfaced two more, independent bugs: `docker compose restart` doesn't reload `.env` values (only `up -d`/`--force-recreate` does), and nginx's `proxy_pass` targets were bare hostnames resolved once at startup and cached, so recreating `api`/`web` left nginx proxying to dead IPs until nginx itself restarted (`502`s) — fixed with `resolver 127.0.0.11 valid=10s` plus assigning the upstream to a variable to force re-resolution, which then broke `/ntfy/`'s automatic prefix-stripping (a bare `proxy_pass` strips it by convention, a variable one doesn't) — fixed with an explicit `rewrite` before that `proxy_pass`. Leaving `localhost` working alongside `dispute-portal` was rejected — that permissive state is exactly what made the original gap invisible.

**How it solves the problem:** A CORS preflight test now distinguishes the two origins correctly; force-recreating `api` self-heals within nginx's 10s DNS TTL with no manual proxy restart.

## 63. Dispute-status toast notifications were silently dead — `<Toaster/>` mounted client-only, not during SSR

**Problem:** The same browser session that found #62 also found this: a real ntfy publish reached the browser correctly — SSE connected, the message parsed, `toast.info(...)` ran and queued into sonner's internal store — but the mounted `<Toaster/>` never painted anything. Two false leads (a stale Vite dependency cache, duplicate `sonner` module instances) were ruled out with direct evidence before landing on the real cause: `<Toaster/>` was rendered inside `__root.tsx`'s server-rendered `RootDocument`, so its subscription effect ran as part of SSR hydration rather than a clean client mount, and its subscription to sonner's singleton store never received updates afterward.

**Decision:** `Toaster` now gates its own render on a `useState`/`useEffect` "mounted" flag, returning `null` until after the first client-side effect — the underlying `SonnerToaster` is never part of the SSR-rendered tree at all. `suppressHydrationWarning` was checked and rejected — that warning is scoped to attribute-only mismatches and doesn't explain a dead subscription several levels deeper. Moving `<Toaster/>` into a route-level component instead of the root layout was also rejected — `toast` is used from unauthenticated and top-level routes too, so it has to stay at the document root.

**How it solves the problem:** Verified live, isolating the fix from an unrelated confound (an `EventSource` cross-origin failure that briefly looked like the fix hadn't worked) — the previously-dead `<Toaster/>` now paints correctly and consistently, including on a fresh hard reload.

_Follow-up (2026-09-13):_ the pipeline was reconfirmed end-to-end through the real hook, and a separately-flagged "`EventSource` reconnects repeatedly" concern was investigated and closed as a false alarm — traced to the debugging session's own repeated reload cycles, not spontaneous churn. No code change.
