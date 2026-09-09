# Decisions

A running log of non-obvious engineering decisions: the problem each one solves, what we did, the alternative(s) actually considered, and why the chosen approach solves the problem better _for this project_ — not just "which is better in general." Alternatives aren't strawmen; some are genuinely better in a different context, and that context is called out.

This is the doc to open before an interview question that starts with "why did you..." — and the doc to add to the moment a real design decision gets made during implementation, not retrofitted afterward. Numbered in the order decided, oldest first.

---

## 1. Auth: originally username+password, not Google OAuth or passwordless email-OTP

**Problem:** Customers need to authenticate, and however that's done becomes the single thing every other feature depends on for the one review event that matters (no live back-and-forth with the panel).

**Decision:** Plain Better Auth username+password.

**Alternatives considered:**

- _Google OAuth_ — relocates the sensitive-data problem rather than removing it: `GOOGLE_CLIENT_SECRET` custody, correct OAuth CSRF/PKCE handling, ID-token verification. It also adds a hard external dependency on Google's uptime and consent-screen rules for the one login flow the entire submission depends on — an unverified OAuth app shows warning screens to non-whitelisted accounts, a real risk when the reviewer's Google account was never added as a test user. Would be the right call for a project where social login is an actual requirement — not the case here.
- _Passwordless email-OTP_ — needs a real delivery channel (email/SMS) for the one-time code, which either means real Gmail SMTP (a Google dependency again) or an insecure stand-in. See decision 3.

**How it solves the problem:** Self-contained — no external identity provider, no delivery channel to build or depend on, works entirely inside `docker-compose up`.

_Superseded by decision 21:_ reversed by explicit instruction — login is email-OTP, which is precisely the "insecure stand-in" / "real delivery channel" tradeoff this decision weighed and rejected. See #21 for the reversal, and the full "why not username+password" reasoning.

## 2. Dispute resolution: an internal-only route, not a customer-facing endpoint

**Problem:** The brief has no reviewer/admin portal, but the dispute-status-change event (and its notification, decision 3) needs _something_ to trigger it.

**Decision:** `POST /internal/disputes/:id/resolve`, gated by a separate shared-secret header (`x-internal-token`), deliberately outside the customer Better Auth session model. See `docs/api.md`.

**Alternative considered:** Let the customer's own session call a "resolve" endpoint on their own dispute. Simpler — one auth model, no second credential — but a customer resolving their own dispute is backwards for the domain (a panel reading dispute-resolution workflows would catch it immediately), and it's a real hole in the authz story we're otherwise careful about.

**How it solves the problem:** Keeps two auth paths honestly separate instead of pretending a demo shortcut is customer behavior, and doubles as a second, deliberately-scoped auth mechanism to talk about — curl-able live in an interview, no shelling into the codebase needed.

_Superseded by decision 16:_ a real (small) admin portal is now in scope; this route and `INTERNAL_API_TOKEN` are removed outright, not just demoted — see #16.

## 3. Notifications: self-hosted ntfy, not real email/SMS or a bare console.log

**Problem:** The brief only requires a _simulated_ notification on dispute status change — but "simulated" as a `console.log` is the least convincing possible demo of the event-driven architecture line in the JD.

**Decision:** Publish to a self-hosted [ntfy](https://github.com/binwiederhier/ntfy) topic (per-user, not shared) on status change. See `docs/notifications.md` for the full writeup and its explicit scope boundary.

**Alternatives considered:**

- _Real email/SMS_ — the most "real" option, and not actually blocked by decision 1 (outbound SMTP is used elsewhere, see decision 14) — rejected instead because it's a worse demo: an email risks landing in spam or arriving late, where a push notification via ntfy is instant and visible on screen. Would be the right call if the brief actually required real delivery for a business event like this — it doesn't, this is explicitly a simulated notification.
- _Plain `console.log`_ — zero risk, zero dependency, but the least demoable and the least honest attempt at the event-driven JD line.
- _Using ntfy for auth-credential delivery too (OTP codes)_ — considered and explicitly rejected, see `docs/notifications.md`'s scope boundary: pub/sub topics are broadcast by design, wrong shape for a credential.

**How it solves the problem:** A real HTTP pub/sub delivery you can watch happen live (dispute resolves → a push notification arrives), self-hosted so the submission doesn't depend on a third party being reachable during review, without overclaiming "microservices" (see decision on wording in `docs/brief.md`).

## 4. Idempotency: reject duplicate disputes server-side, not just client-side

**Problem:** Dispute creation is a financial action — a retry or double-click submitting two disputes on the same transaction is a realistic failure mode, not a hypothetical.

**Decision:** `POST /api/disputes` rejects a second dispute while one is already `submitted`/`under_review` on the same transaction (DB-level uniqueness, not just a UI guard). See `docs/api.md`.

**Alternative considered:** Rely on the frontend disabling the submit button after one click. Cheaper to build, but doesn't survive a network retry, a second tab, or a client bug — server-side is the only place this guarantee actually holds.

**How it solves the problem:** A concrete, testable answer to "what happens on a client retry" (`docs/scaling-and-resilience.md`) instead of a hand-wave, and it's a real constraint, not decorative validation.

## 5. TypeScript: staying on 6.0.3, not adopting 7.0 yet

**Problem:** TypeScript 7.0 (the Go-native rewrite, ~10x faster) reached GA July 2026 — worth knowing about, but is it worth using here.

**Decision:** Keep `typescript@6.0.3` as the package every tool (build, typecheck, lint) depends on.

**Alternative considered:** Adopt 7.0 for the speed win. Rejected for a concrete, verifiable reason, not caution for its own sake: TS 7.0 shipped without a stable programmatic Compiler API (landing in 7.1), and `typescript-eslint` — which our `pnpm lint` depends on — filed-and-closed a "not planned until 7.1" issue on GA day. Switching would break CI outright. Worth revisiting the moment `typescript-eslint` ships 7.x support.

**How it solves the problem:** Doesn't solve a problem so much as avoid inventing one — the whole toolchain (build/typecheck/lint) is verified working end-to-end on 6.0.3; 7.0 would trade that for a broken lint step in exchange for compiler speed we don't need at this project's size.

## 6. Node & pnpm: latest Active LTS, not latest overall

**Problem:** "Update to the latest version" is ambiguous — Node 26 was already out and newer than Node 24.

**Decision:** Node 24.19.0 (Active LTS, "Krypton") and pnpm 11.22.0 (latest stable; pnpm 12 is RC-only).

**Alternative considered:** Node 26. Newer, but it's "Current," not LTS, until 2026-10-28 — the wrong tradeoff for something meant to demonstrate production judgment, where "stable" means the maintained-for-years line, not the newest release.

**How it solves the problem:** "Latest LTS, not latest period" is itself a small, correct engineering judgment call worth being able to explain, not just a version bump.

## 7. `shared` compiles to `dist/`, not `.ts` source directly

**Problem:** The `api` package ships a compiled `dist/app.js` run by plain `node` in production (decision 9) — but `shared`'s `package.json` originally pointed `exports` straight at `.ts` source.

**Decision:** `shared` gets a real `tsc` build step; `exports` points at `dist/index.js`/`dist/index.d.ts`. `turbo.json`'s `typecheck` task depends on `^build` (not `^typecheck`) so `shared`'s `dist` exists before dependents typecheck.

**Alternative considered:** Keep `shared` pointing at `.ts` source directly. Would work if every consumer ran via `tsx`/`vite`, both of which resolve `.ts` imports directly — but this repo's `api` production image runs plain `node dist/app.js`, which can't resolve a `.ts` import target. The pattern would build in dev and break in the exact image meant to prove "production-grade."

**How it solves the problem:** Found by actually building and running the production Docker image, not by inspection — `pnpm build` failed with a real `tsc` error (`rootDir` ambiguity) the first time, which is the point of verifying rather than assuming a pattern transfers.

## 8. API production runtime: compiled JS + `node`, not `tsx`

**Problem:** How the production container actually runs the compiled app — `tsx` (used in `Dockerfile.dev` for its watch-mode convenience) was the closest available shortcut.

**Decision:** Build stage runs `tsc` to `dist/`; runtime stage runs `node dist/app.js`. `tsx` stays dev-only.

**Alternative considered:** Run `tsx src/app.ts` in production too — one fewer build step. Rejected: `tsx` is a devDependency (violates the "no devDependencies in the final image" requirement), re-transpiles on every cold start (works against the HPA/autoscaling story in `docs/scaling-and-resilience.md`), and doesn't type-check — so it buys neither the safety nor the minimalism a "production-grade" image is supposed to demonstrate.

**How it solves the problem:** Standard, defensible split — dev tools for dev iteration speed, a real compiled artifact for the thing that has to answer "is this actually production-grade."

## 9. Web production runtime: `srvx`-wrapped Node server, not TanStack Start's build output directly

**Problem:** `vite build` for the `web` package produces `dist/server/server.js` — running `node dist/server/server.js` exits cleanly with zero output and never listens on a port.

**Decision:** `web/server.mjs` wraps the built handler with `srvx` (`serve({ fetch: handler.fetch, port, hostname: "0.0.0.0" })`), promoted from a transitive to a direct dependency.

**Alternative considered:** Assume the build output was already a runnable server (it looked like one). Disproven by actually running it in the Docker container, not by reading docs — TanStack Start's build target is a bare Web-standard `fetch` handler meant for a hosting adapter (Vercel/Cloudflare/Node-via-`srvx`/etc.), not a self-starting server.

**How it solves the problem:** The only way this was caught was building the production image and running it — confirms the value of verifying the actual artifact over trusting that a framework's "it builds" implies "it runs."

## 10. Kubernetes: manifests with substance, not live deployment

**Problem:** The Kubernetes/containerization JD line needs to be earned without the month-long budget (or the infra) to actually run a cluster.

**Decision:** `k8s/` manifests (once written) will include `replicas: 3`, resource requests/limits, an HPA keyed on CPU, and a PodDisruptionBudget — real enough to point to on screen — with a README paragraph on the intended AWS target (ECS/Fargate + RDS), never actually deployed.

**Alternative considered:** Skip Kubernetes entirely and only write the README paragraph. Cheaper, but "we thought about it" is a much weaker answer than a manifest with an HPA and PDB an interviewer can actually read.

**How it solves the problem:** See `docs/scaling-and-resilience.md`'s "build vs. document" split — this is the concrete half of that split, not the documented-only half.

## 11. CI: lint/typecheck/build/test + a Docker build matrix, not a deploy pipeline

**Problem:** "CI green on default branch" is a hard item in `docs/definition-of-done.md`, and the two production Dockerfiles already had real bugs (decisions 7–9) that only a full `docker build` catches.

**Decision:** `.github/workflows/ci.yml` — one job for lint/typecheck/build/test, a second matrix job building both production Dockerfiles. No deploy step.

**Alternative considered:** Skip the Docker-build job and rely on lint/typecheck/build alone. Cheaper CI minutes, but would have let the `rootDir`/`srvx`/`node_modules` bugs (decisions 7–9) merge silently — the whole reason this job exists is that those bugs were real, not hypothetical.

**How it solves the problem:** Catches "the app typechecks but the production image doesn't actually run" before submission, which is exactly the failure mode already hit twice while scaffolding.

## 12. Login credential integrity: rate limiting, not CAPTCHA

**Problem:** Proving someone knew the right credential (decision 1) doesn't prove that credential wasn't guessed or brute-forced. See `docs/auth.md` for the full writeup.

**Decision:** Per-account rate limiting with progressive backoff on login.

**Alternative considered:** A hosted CAPTCHA (hCaptcha/Turnstile/reCAPTCHA) in front of the login form. Same reasoning that ruled out Google OAuth (decision 1): an external dependency sitting in front of the one flow the reviewer has to use, for the one review event with no do-over. Would be the right call for a public-internet production deployment actually facing bot traffic at scale — not for a reviewed take-home.

_Superseded by decision 21:_ the credential model this targeted no longer exists. Per-account rate limiting survives, retargeted from login-guessing to OTP-code-guessing — see `docs/auth.md` §1.

**How it solves the problem:** Covers the realistic brute-force attack surface with a check that degrades gracefully instead of introducing a new hard dependency on the login path.

## 13. Signup email verification: documented, not built

**Problem:** Classic email verification needs a real outbound email channel, and building it would gate a flow the demo doesn't actually exercise.

**Decision:** State the production answer (a real transactional email provider) in `docs/auth.md`; don't build it for this submission.

**Alternative considered:** Build it anyway, e.g. via a self-hosted dev-only mail catcher (MailHog/Mailpit). Rejected because it wouldn't actually deliver to the reviewer's real inbox — only captures mail locally — and the demo path doesn't exercise self-registration anyway: the reviewer signs into seeded accounts with real transaction history, since a freshly self-registered account has nothing to dispute (`docs/domain-model.md`'s seed data plan).

**How it solves the problem:** Skips building a flow (self-registration) the reviewed demo path doesn't use, without pretending it wouldn't be needed in production.

_Correction on this entry's original reasoning:_ the first version of this decision justified skipping email verification by equating it with the Gmail dependency decision 1 dropped — that was an overgeneralization. Decision 1 rejected Google **OAuth as the login mechanism**, where an outage blocks every login. Outbound SMTP is a notification channel, not a login gate — a slow or down mail provider delays a notification, it never blocks sign-in. Decision 14 uses outbound SMTP for exactly that reason; the two aren't in tension, and "avoid Google" was never actually the right reason to skip this one.

_Superseded by decision 17:_ revisited again — this is now actually built, not documented-only. See #17.

## 14. Account-recovery & compromise alerts: build via outbound SMTP

**Problem:** The login protections in decision 12 don't help _after_ a credential has already leaked — an account owner needs a way to notice a compromise happened and recover from it.

**Decision:** Provider-agnostic outbound SMTP (works with a Gmail App Password or any transactional provider), fire-and-forget and never on the login critical path, for: new-device/new-location login alerts and email-changed confirmations (sent to the _old_ address). See `docs/auth.md` §3.

**Alternative considered:** Skip it, same as signup verification (decision 13) — initially the plan, on the mistaken assumption that "avoid outbound email" was a blanket rule from decision 1. It wasn't: decision 1's objection was specifically to an external identity provider gating the login path itself. A notification channel that degrades to "the email arrives late" instead of "nobody can log in" doesn't carry that risk, and without it a compromised account has no recovery path short of manual support — a real gap, not a nice-to-have.

**How it solves the problem:** Doesn't prevent credential theft (decision 12 covers prevention) — gives the real owner a way to _notice_ a compromise and _recover_ from one, which prevention alone can't do once a credential is already in someone else's hands.

_Narrowed by decision 21:_ one of the two original alerts is dropped, since it no longer applies — see `docs/auth.md` §3 for what's actually built now. New-device/new-location login alert and email-changed confirmation survive unchanged; email-changed confirmation is now arguably more load-bearing, since the account email isn't just a contact address, it's the entire credential.

_Built by decision 46:_ both surviving pieces — the new-device login alert and the email-change approval — are implemented, not just documented. See #46.

## 15. Local dev env files: committed with fresh secrets, not real ones

**Problem:** `docker-compose up` should work out of the box on a clean checkout (`docs/definition-of-done.md`), which means the local dev env files need to exist and be committed. But committing real, working credentials — a Gmail App Password and a Google OAuth client secret tied to Nolan's real accounts — was on the table as a shortcut.

**Decision:** Commit `api/.env`, `web/.env`, `env/development/.env.database` — but with freshly generated values (`BETTER_AUTH_SECRET`/`COOKIE_SECRET`/`INTERNAL_API_TOKEN`/Postgres password), never real ones, and SMTP pointed at a new local-only Mailpit service (`compose.yml`) instead of real Gmail. `.gitignore` gets an explicit allowlist exception for exactly these three paths, with a comment stating why they're safe (see the file itself).

**Alternative considered:** Commit real, working `.env.api`/`.env.web`/`.env.database` values, as literally requested. Rejected outright — a real Gmail App Password and Google OAuth client secret committed here would publish live access to Nolan's actual Gmail account and Google Cloud project on a public GitHub repo, permanently (git history retains it even after a later deletion). Also moot: decision 1 already rejected Google OAuth for this project, so those specific values wouldn't even be used.

**How it solves the problem:** Gets the real goal — clone-and-`docker-compose up` with zero manual setup — without the part of the request that would have leaked live credentials. Mailpit is a strict upgrade over reusing real Gmail for this purpose too: the account-recovery emails from decision 14 become viewable by anyone who clones the repo (`localhost:8025`), with no real email account, Nolan's or otherwise, required at all.

_Superseded by decision 20, then largely restored by decision 34:_ #20 reversed the "commit working values" premise (blank secrets + a gitignored `.env.local` per file); #34 reverses that reversal — the committed `.env` files hold working local values again, since they're fake local-only secrets with nothing to leak. The never-commit-*real-account* credentials and Mailpit-over-real-Gmail parts still stand. See #34.

## 16. Admin portal: a real (small) one, superseding the internal-token workaround

**Problem:** Decision 2 built `/internal/disputes/:id/resolve` specifically because there was no admin/reviewer portal — a shared-secret header standing in for a UI that didn't exist. Revisited: a demo with an actual reviewer flow and real role-based access is a stronger answer than a header check, and worth showing.

**Decision:** A minimal admin portal — a disputes-needing-review list and a resolve action, one or two pages — gated by a Better Auth session carrying an `admin` role, not a shared-secret header. Admin accounts are invite-only: a seeded admin (Nolan's own account) sends an invite email (real delivery via decision 19's local override; Mailpit for anyone else's clone) to a new admin; the invite link is what creates the account. No self-service admin signup.

**Alternative considered:** Keep the internal-token route as the only resolve path, or keep it alive alongside the portal as a "this is what pure machine-to-machine access would look like" talking point. Both rejected: a shared-secret header alone doesn't show a role-based authz story, and two live auth mechanisms for the same action is two things to explain instead of one. Resolved: `/internal/disputes/:id/resolve` and `INTERNAL_API_TOKEN` are removed outright — `POST /v1/admin/disputes/:id/resolve` is the only resolve path now.

**How it solves the problem:** A real role-based authz story (customer session vs. admin session, not two disconnected auth mechanisms) and a visual surface to demo resolution live, which a header-only route couldn't provide.

## 17. Signup email verification: built, not documented-only (supersedes 13)

**Problem:** Decision 13 skipped building this because the reviewed demo path signs into seeded accounts, not self-registered ones. Revisited: this models *real transactions* — a customer proving they own the email before they can dispute one is a real requirement, not just a nicety for a self-registration flow the demo doesn't exercise.

**Decision:** Build it for real. Account status starts `unverified` at signup; a verification link goes out via outbound SMTP (decision 19's real local delivery, or Mailpit for anyone else's clone). The account is blocked from every action — not just soft-nudged — until the link is clicked. Seeded demo accounts ship pre-verified, so the reviewed path (signing into seeded accounts with real history) is never gated by an email round-trip.

**Alternative considered:** Email OTP/magic-link replacing the login mechanism itself — rejected again, explicitly, here: that would put outbound email delivery on the login-critical path decision 1 protected. A signup-time verification gate only blocks the already-rare self-registration path, not every login, so it doesn't carry the same risk.

**How it solves the problem:** Real proof of email ownership before a customer can act on transaction data, without reopening decision 1's login-path protection.

_Superseded by decision 21:_ decision 1's login-path protection this decision was careful not to reopen gets reopened anyway, by explicit instruction — email-OTP login means every login already re-proves email ownership, which makes a separate one-time signup-verification gate redundant. Folded into the OTP decision rather than kept as a second, now-pointless step. See #21.

## 18. API versioning: `/v1/` prefix

**Problem:** No versioning scheme had been decided; unversioned routes (`/api/...`) don't communicate a compatibility contract, and it's a fair "how would you evolve this" question to have a real answer for.

**Decision:** Public and admin routes move under `/v1/` — `/v1/disputes`, `/v1/transactions`, `/v1/admin/...`. Health checks (`/healthz`, `/readyz`) stay unversioned — they're infra probes, not API consumers.

**Alternative considered:** Leave routes unversioned, add a prefix later if it ever matters. Cheaper today, but costs nothing to get right from the start versus retrofitting every route later.

**How it solves the problem:** A small, standard, easy-to-defend convention instead of a retrofit under time pressure later.

## 19. Real outbound email for local testing: gitignored `.env.local`, never committed

**Problem:** Decision 15 rightly keeps `api/.env` pointed at Mailpit so a clean clone works with zero setup and no real credentials in git history — but that also means nobody, including Nolan, can see a real verification/invite email land in an actual inbox without a second, uncommitted path to real SMTP.

**Decision:** `api/.env.local` — gitignored, matches the `.env.*` pattern in `.gitignore` — can hold a real Gmail App Password for local testing only. `compose.yml`'s api service lists it as a second, `required: false` `env_file` entry after `./api/.env`, so it layers on top (overrides matching keys) when present and is silently skipped otherwise — no manual setup needed for a fresh clone. `.dockerignore` excludes `.env.local`/`*/.env.local` so it never enters a build context even though the bind-mounted dev container would expose it locally anyway.

**Alternative considered:** Commit the real credentials directly, as first asked. Rejected for the same reason decision 15 rejected it: a public repo's git history is permanent, and "this Gmail account is just for the demo" doesn't change that a committed App Password is live, working access until rotated.

**How it solves the problem:** Real inbox delivery on demand for Nolan, zero risk to a fresh clone, zero change to decision 15's committed-file guarantee.

_Superseded by decision 20, then decision 34:_ #20 generalized this `.env.local` override to every secret-shaped value; #34 removes the override files entirely (`api/.env.local` deleted) — real Gmail creds for local testing now go straight into `api/.env`, or a personal untracked `api/.env.local` if preferred. See #34.

## 20. Committed env files hold blanked secrets, not working values — `.env.local` (no template) required per package

**Problem:** Decision 15 committed `api/.env`/`web/.env`/`env/development/.env.database` with real, working values — freshly generated, never real ones — specifically so a clean clone runs zero-setup. Revisited: even a freshly-generated, external-account-free secret (`BETTER_AUTH_SECRET`, `POSTGRES_PASSWORD`) is still a real committed secret sitting in git history, and the preference now is that literally no secret — however low-stakes — is ever a real, working value in a committed file, full stop, not just the ones tied to an external account (which decision 19 already handled for SMTP alone).

**Decision:** Every secret-shaped value in a committed env file is blank: `api/.env` blanks `DATABASE_URL`, `BETTER_AUTH_SECRET`, `COOKIE_SECRET`; `env/development/.env.database` blanks `POSTGRES_PASSWORD`. Non-secret operational config (`PORT`, `NODE_ENV`, `CORS_ORIGIN`, rate-limit numbers, `SMTP_HOST`/`PORT` pointed at the no-auth Mailpit catcher) stays real, since blanking those buys no security and only breaks the app for no reason. Real values live in a gitignored `.env.local` per package (`api/.env.local`, `env/development/.env.local.database`) — `compose.yml` loads each as a second, `required: false` `env_file` entry that overrides the committed file's (blank) value when present. Deliberately no committed `.example`/template file for these — the committed `.env` file already shows the exact key names; README.md's "Local setup" section is the instructions, not a second file to keep in sync.

**Alternative considered:** Keep decision 15's model (real generated values committed, zero setup) and only carve out `.env.local` for genuinely external credentials (SMTP), as decision 19 originally scoped it. This is what was actually asked for and answered "keep zero-setup" one exchange earlier in this same session — revisited immediately after by explicit instruction, so recorded here as a real reversal, not a refinement: "no live secrets in git, however low-stakes" was judged worth losing the zero-`docker-compose up` convenience for.

**How it solves the problem:** No secret of any kind, real-account-tied or not, is ever committed — at the direct cost of the `docker-compose up gives a working local stack` Definition-of-Done item now requiring a documented manual step first (README.md). `docs/definition-of-done.md` updated to reflect this.

_Note while implementing:_ the pre-existing committed `DATABASE_URL` (`postgresql://postgres:secret@localhost:5432/...`) was already wrong on two counts, caught while rewriting this file — its password (`secret`) never matched `env/development/.env.database`'s actual generated `POSTGRES_PASSWORD`, and `localhost` isn't reachable as the DB host from inside the `api` container on the compose bridge network (the service name, `transaction-dispute-portal-database`, is). Moot now that the value is blank, but the correct shape is documented in `api/.env`'s comment so `.env.local` gets it right.

_Superseded by decision 34:_ the blank-secret model is reversed. `api/.env` and `env/.env.database` are committed with working local values (fake Postgres password, freshly-generated auth secrets); the `.env.local` override files are deleted. The reasoning that flipped #15 → #20 (a generated secret in git history is still a secret in git history) was judged, on reflection, to cost more than it's worth for a repo whose secrets are local-only fakes with no live deployment behind them. See #34.

## 21. Auth: email-OTP login, no password — reverses decision 1

**Problem:** Restated from decision 1: customers need to authenticate, and however that's done becomes the single thing every other feature depends on for the one review event that matters. Decision 1 originally answered this with username+password. Revisited by explicit instruction: username+password is out, replaced with Better Auth's email-OTP plugin — every login sends a one-time code to the account's email instead.

**Why not username+password:** a stored credential is something to get right forever — hashing, strength rules, breach-checking, reset flows, all of it a standing surface to defend. OTP collapses that entire category: there's no long-lived secret to store, guess, reuse from another breach, or reset, because the "credential" is a fresh one-time code proven by owning the inbox, every single login. It also removes a two-step gap decision 1 originally had (a one-time signup verification step, separate from every later login) — OTP re-proves email ownership on every login, so that separate step becomes redundant.

**Decision:** Email-OTP is the only login mechanism. `docs/auth.md` covers the built controls (rate limiting/lockout on OTP verification attempts, short code expiry, audit log) and, separately, the dependency this creates. Consequences to other decisions, tracked at their source rather than restated here: decision 1 itself, decision 12, decision 17, decision 14.

**Alternative considered:** Keep decision 1's original model. This was, in fact, the explicit answer given two exchanges earlier in this same session, before being reversed by explicit instruction — recorded here as what it is, a direct reversal of a decision made minutes earlier in the same conversation, not a refinement of it.

**How it solves the problem:** Removes an entire category of standing credential-management risk, at the cost of reopening the exact dependency decision 1 was written to avoid: outbound email delivery is now on the path *every* login depends on, not zero logins as before.

**Resolved:** Mailpit is accepted as sufficient for this project's dev and demo purposes — the committed config, no manual setup required. Real SMTP is documented as a production requirement (`docs/auth.md` §2), not built for this submission, the same "documented, not built" pattern decision 13 originally used. This sidesteps the question of exactly how the panel reviews the repo rather than needing to resolve it: Mailpit works locally either way (self-contained per `docker-compose up`, or watchable live if Nolan drives it), and the property that would otherwise be missing — real per-recipient isolation, since Mailpit has no per-user mailbox access control at all (confirmed against its docs; its only auth option is one shared credential for the whole UI, not per-mailbox) — is explicitly a production concern, resolved by not using Mailpit in production, not by fixing Mailpit.

## 22. API response envelope: a generic `globalResponseSchema`/`paginatedGlobalResponseSchema`

**Problem:** `docs/api.md` only had a placeholder error shape sketch (`{ error: { code, message } }`) — no real answer for success responses, field-level validation errors, or pagination metadata, and no schema anyone would actually import and use.

**Decision:** Add a generic response envelope (`shared/src/schema/global.ts`) to this project's `shared` package as the default for every API response: `globalResponseSchema` (`code`, `message`, optional `redirectUrl`, optional `errors: [{ field, message }]`) and `paginatedGlobalResponseSchema` (adds `count`/`total`/`page`/`limit`). Endpoints extend either with `.extend({ data: ... })` per response — not built speculatively per-endpoint here, since there are no endpoints yet, just the base envelope and the pattern documented (`docs/api.md`). Only the minimal dependencies these two schemas actually need came with it — `shared/src/constant.ts` (`HTTP_CODE`/`HTTP_RESPONSE_CODE`, `ORDER_DIRECTION`, `DEFAULT_PAGE_LIMIT`/`NUMBER`) and `shared/src/schema/field.ts` (`stringSchema`, `numberSchema`, `httpCodeSchema`, `orderDirectionSchema`) — kept intentionally minimal, only what these two schemas actually need, nothing domain-specific bolted on speculatively (`CLAUDE.md`'s no-speculative-abstraction convention).

**Alternative considered:** Keep the ad-hoc `{ error: { code, message } }` sketch and design a bespoke envelope from scratch. Rejected — a generic envelope with typed field-level errors and pagination metadata is a proven, standard shape, and building one now beats ad hoc per-endpoint shapes emerging later once real endpoints exist.

**How it solves the problem:** A real, typed, reusable response contract instead of a one-line sketch. Caught one real bug while building it: `tsconfig.base.json`'s `moduleResolution: "Bundler"` doesn't rewrite relative-import extensions, but `shared`'s compiled output runs under plain Node ESM (decision 7) in `api`'s production image, which requires explicit `.js` extensions on relative imports. Fixed by adding `.js` extensions on every relative import in these files; verified by building `shared`, then actually running the compiled output through plain `node` (not just `tsc`), matching decisions 7-9's pattern of catching this class of bug by running the artifact, not inspecting the source.

## 23. DB engine: Postgres, not MySQL

**Problem:** Left open in CLAUDE.md's maintainer note as a real choice — no functional difference for this brief, pick one and move on.

**Decision:** Postgres. Already the default throughout (`compose.yml`, `env/development/.env.database`) — this closes out the open question rather than changing anything.

**How it solves the problem:** Removes the one remaining "still deciding" item before implementation starts; MySQL/RDS experience remains a fine talking point without needing the code to reflect it.

## 24. CI/CD split into `build.yml`/`deploy.yml`; migrations run standalone, decoupled from API boot

**Problem:** Two related gaps. First, the single `ci.yml` conflated verification (lint/typecheck/build/test, Docker build validation) with publishing — no separate place for the "deploy" half of CICD the JD grades on (`docs/brief.md`), and no live infra exists to deploy to (out of scope, `CLAUDE.md`). Second, no way to run Drizzle migrations independent of the API process — needed so a migration can be generated/applied from a developer's machine or a CI/CD step without the API running, and so schema changes aren't silently applied as a side effect of app boot.

**Decision:** `ci.yml` renamed to `build.yml` (unchanged behavior — PR/push checks). New `deploy.yml` triggers on `build.yml` succeeding on `main` (`workflow_run`) or a `v*` tag push, builds both production images, and pushes them to GHCR (`ghcr.io/<owner>/transaction-dispute-portal-{api,web}`, tagged by commit SHA / `latest` / semver). This is the honest boundary given no live infra: publish a versioned, deployable artifact and stop — not fake a `kubectl apply`/deploy step against nothing.

For migrations, layout follows Nolan's prior project (Ubuntu Stories) rather than an invented one, with two changes. First, naming: Ubuntu Stories calls the directory `drizzle/`, renamed `database/` here since that reads clearer than the tool name once the dev-tooling context (`drizzle-kit`) isn't the point. Second, consolidation: Ubuntu Stories splits its schema/migrations (`src/drizzle/`) from its connection code (`src/lib/database.ts`); here everything database-related — schema (`api/src/database/schema/`, barrel `index.ts`, per-entity files land here as `docs/domain-model.md` entities are implemented), generated migrations (`api/src/database/migrations/`, committed), the pooled connection (`api/src/database/config.ts`), and the standalone migration runner (`api/src/database/migrate.ts`, below) — lives together under one `api/src/database/` directory, all nested under `src`, not at the package root. `config.ts` is a `globalThis`-cached singleton, same reasoning as Ubuntu Stories: `tsx watch` (the dev script) hot-reloads the module on every save, and a naive `postgres()` call would open a fresh connection each reload until the pool is exhausted.

One deliberate deviation from the Ubuntu Stories precedent, unrelated to the naming/layout choices above: Ubuntu Stories applies migrations via `npx drizzle-kit migrate` directly. That requires `drizzle-kit` — a devDependency — present wherever it runs, fine for a full-deps dev machine but not this project's pruned production image (no devDependencies by design, decision 8). So `api/src/database/migrate.ts` is a small standalone script instead, using `drizzle-orm`'s runtime migrator (not `drizzle-kit`) against the already-generated SQL in `src/database/migrations`, its own single (`max: 1`) connection separate from `config.ts`'s pool, and never imported by `app.ts`. `drizzle-kit` itself (`api/drizzle.config.ts`, `strict`/`verbose` on, matching the same precedent) stays generate-only. Driver: `postgres` (postgres.js) + `drizzle-orm/postgres-js`, also matching. The production `Dockerfile` copies `src/database/migrations` (static SQL) alongside the compiled `dist/`, so `node dist/database/migrate.js` works in the prod image with no `drizzle-kit` present — verified by actually running it inside the built container (fails cleanly on missing `DATABASE_URL`, as expected without a real DB attached). Locally, since `compose.yml` already publishes Postgres on `5432:5432`, `pnpm --filter @transaction-dispute-portal/api migrate` run from the host reaches the DB with no API process involved at all.

**Alternatives considered:** Running migrations automatically on API startup (a common shortcut) — rejected, couples schema changes to every app boot/restart/scale-out event and gives no way to apply or dry-run a migration without also starting the API. Also considered matching Ubuntu Stories' `npx drizzle-kit migrate` exactly for consistency — rejected for the devDependency-in-prod reason above; the two projects intentionally fork here, not by oversight.

**How it solves the problem:** `build.yml`/`deploy.yml` gives CICD a real, separately-visible build vs. publish story without overclaiming a live deploy target. The migration layout reuses a proven, already-battle-tested structure instead of inventing a new one, while the one place it deviates (the migrate mechanism) is deviated on purpose, for a documented, verified reason.

_Revised by decision 25:_ the single `deploy.yml` `publish` job this decision described is split into gated `staging`/`production` jobs, and a real bug in its `docker/metadata-action` usage (caught by the first actual run on GitHub, not by inspection) is fixed. See #25.

_Finalised by decision 42:_ the `build.yml`/`deploy.yml` split is gone — one `build.yml` (checks + a `docker compose` smoke test), no deploy workflow. Migrations decoupled-from-boot still holds *for production* (runbook §3); the dev stack runs `migrate` on api start. See #42.

## 25. Deploy: staging (auto) / production (gated) via GitHub Environments; drop `docker/metadata-action`

**Problem:** Two issues, one found by actually running the pipeline rather than by reading it. First, the bug: decision 24's single `publish` job failed on its first real run — the `Docker metadata` step errored. Root cause: `docker/metadata-action`'s `context: git` option introspects the local git checkout for branch/tag info, but the job checks out a single commit by raw SHA (`actions/checkout@v4`'s default shallow, single-ref clone), which leaves the repo in a detached-HEAD state with no branch and no history for `context: git` to read — a known failure mode for that combination, not something visible from the YAML alone. Second, a real requirement: every environment should auto-deploy except production, which needs a human to explicitly approve before an image goes out under `latest`/a release tag.

**Decision:** `deploy.yml`'s single `publish` job becomes two: `staging` (`environment: staging`, no protection rules — deploys automatically whenever `build.yml` succeeds on `main`, tags `staging`/`sha-<commit>`) and `production` (`environment: production`, `v*` tag push — same automatic *trigger* as staging, but GitHub pauses the job at the environment boundary until an authorized reviewer approves it in the Actions UI, tags `latest`/the tag name). The required-reviewer rule is configured once, by hand, in repo Settings → Environments → `production` → Required reviewers — GitHub Environment protection rules aren't expressible inside the workflow YAML itself, so this is a real one-time manual setup step, documented in `README.md`'s "CI/CD" section rather than silently assumed. Separately, `docker/metadata-action` is dropped entirely — tags are now built explicitly from known event context (`github.event.workflow_run.head_sha`, `github.ref_name`) instead of inferred via git/workflow-context auto-detection, removing the whole class of failure the bug came from, not just this instance of it.

**Alternative considered:** Keep `context: git` and fix it narrowly — e.g. add `fetch-depth: 0` and check out a real branch ref instead of a bare SHA, so `docker/metadata-action` has enough git history/context to introspect. Rejected: still leaves tag construction depending on `docker/metadata-action` correctly inferring intent (`is_default_branch`, `type=semver` matching) from ambiguous `workflow_run` context, which is exactly the kind of implicit behavior that failed silently until an actual run caught it. Explicit tags built from context we already know for certain (which job, which event) is less "clever" but has no equivalent failure mode to catch later.

**How it solves the problem:** Matches the actual requirement — automatic where nothing should block deployment, a real human approval gate exactly where one was asked for — using GitHub's built-in Environment protection mechanism rather than a bespoke `workflow_dispatch`-and-hope approval step. The `docker/metadata-action` removal converts a bug found in production (well, in the one CI run that counts) into a permanently smaller failure surface, verified by that fix landing before the next push.

_Superseded by decision 34:_ the `production` job and the `production` GitHub Environment are removed. With no live infra (and none ever planned), a second gated tier was modelling a promotion that never happens — `staging` is the only deploy target, and it takes the `latest` tag. The `docker/metadata-action` removal and the explicit-tags-from-context approach still stand. See #34.

_Finalised by decision 42:_ `staging` goes too — no image is built or pushed by CI at all now. The GitHub Environments required-reviewer pattern and the explicit-tags approach are written up in `docs/production-runbook.md` §6 for whoever wires a real pipeline. See #42.

## 26. `deploy.yml` calls `build.yml` via `workflow_call`, not `workflow_run`

**Problem:** With `workflow_run` (decisions 24/25), `build.yml` and `deploy.yml` were two independently-triggered workflow runs, only loosely linked by GitHub inferring the relationship from the trigger — they showed up as two separate entries in the Actions tab with no connected job graph between them. That's a worse "map" of the pipeline than the JD's CICD line calls for: you can't see build → staging → production as one flow at a glance, you have to click into `build.yml`'s run, note it succeeded, then separately find the `deploy.yml` run it triggered.

**Decision:** `deploy.yml` now triggers directly on `push: branches: [main]` / `tags: [v*]` (same conditions as before) and its first job, `build`, invokes `build.yml` via `uses: ./.github/workflows/build.yml` (`workflow_call`) instead of relying on a separate `workflow_run`-triggered run. `build.yml` gained a bare `workflow_call:` trigger alongside its existing `pull_request:`/`push:` triggers, and its `push:` trigger changed from `branches: [main]` to `branches-ignore: [main]` so it no longer double-runs on `main` (once standalone via `push`, once via the reusable call) — `main` pushes now reach `build.yml` exclusively through `deploy.yml`'s `uses:`. `staging`/`production` both gained `needs: build`, so GitHub renders one connected run graph — build's jobs, then staging, then production — instead of two separate Actions-tab entries. `staging`'s `if:` condition changed from checking `github.event_name == 'workflow_run'` to `github.ref == 'refs/heads/main'` (the event is just `push` now, not `workflow_run`, so the old check no longer applies), and both jobs' checkout/tagging steps switched from `github.event.workflow_run.head_sha` to the ordinary `github.sha`, since there's no longer a separate triggering event to read the commit from.

**Alternative considered:** Keep `workflow_run` and just accept two Actions-tab entries — rejected, it's the exact thing the JD-facing "map of the pipeline" ask needed fixed, and GitHub's own reusable-workflow feature exists specifically to solve this. Also considered restructuring into fully separate per-app (`api`/`web`) build→test→staging→production job chains for maximal visual granularity — deferred: `needs:` in a caller workflow can only depend on the reusable call as a whole (confirmed against GitHub's reusable-workflows docs), not on an individual job inside it, so true independent per-app lanes converging only at the production gate would need everything collapsed into one workflow file rather than the `build.yml`/`deploy.yml` split. Left as a possible future iteration rather than done speculatively.

**How it solves the problem:** `build` and `deploy` now render as one connected job graph in a single Actions run — build's jobs feed directly into `staging` then `production` — without changing any of the actual build/test/publish logic decisions 24/25 already established.

_Revised by decision 27:_ the `tags: [v*]` push trigger this decision describes is removed — see #27 for why and what replaces it.

_Narrowed by decision 34:_ the connected-graph point stands, but the graph is now `build → staging` only (the `tag` and `production` jobs are gone). See #34.

_Superseded by decision 42:_ there is no `deploy.yml` any more, so nothing calls `build.yml` — it runs standalone on push/PR. The reusable-workflow reasoning is moot for this repo. See #42.

## 27. Production trigger: auto-created tag after staging succeeds, not a manual `v*` push

**Problem:** Decision 26 still required Nolan to manually create and push a `v*` tag to reach production — a second, disconnected action outside the pipeline decision 26 had just made visually connected. That's backwards from the actual want: staging passing should be the trigger, with production surfacing as nothing more than a "Review deployments" approval button already sitting in the same run — no separate manual tagging step for a human to remember.

**Decision:** `deploy.yml` drops the `tags: [v*]` push trigger entirely — it now runs only on `push: branches: [main]`. A new `tag` job runs `needs: staging` (so it waits for both `api` and `web` to reach staging), checks out full history (`fetch-depth: 0`), finds the highest existing `v*` tag, bumps the patch component, and `git tag`s + `git push`es the result using the job's own `contents: write`-scoped `GITHUB_TOKEN` — no PAT needed, since pushing a tag (unlike triggering a new run from one) works fine with the default token. `production` changes from `needs: build` / `if: startsWith(github.ref, 'refs/tags/v')` to plain `needs: tag`, and its image tag reads `${{ needs.tag.outputs.tag }}` instead of `${{ github.ref_name }}`. A `GITHUB_TOKEN`-authored push deliberately does not start a second workflow run (GitHub suppresses that specifically to prevent infinite loops) — that's relied on here, not worked around: production stays a job in the *same* run as staging, gated by `needs:`, rather than by a second run reacting to the tag.

**Alternatives considered:** A PAT/deploy-key so the tag push could itself trigger a fresh `tags:`-scoped run — rejected, reintroduces the exact two-separate-runs problem decision 26 just fixed, plus a credential to manage for no benefit. Semantic version bump (major/minor) chosen by commit message convention (e.g. Conventional Commits) — deferred as unneeded process weight for a solo submission; every deploy is a patch bump, which is honest about what's actually happening (there's no release-branching workflow here to justify minor/major distinctions).

**How it solves the problem:** Matches what was actually asked: push to `main`, staging deploys automatically, a version tag appears with no manual step, and the only thing a human sees or does is click approve on `production`.

_Superseded by decision 34:_ the `tag` job and the `production` job are both removed. Without a `production` promotion there's nothing for an auto-created version tag to mark, so `deploy.yml` is just `build → staging`. See #34.

_Superseded by decision 42:_ `deploy.yml` is deleted outright. See #42.

## 28. Drizzle schema & Better Auth wiring: mirror the Ubuntu Stories house style, don't invent one

**Problem:** The domain + auth tables (`docs/domain-model.md`) needed a concrete Drizzle schema, and Better Auth needed to be wired to it. Two ways to go: design a fresh convention for this repo, or reuse the one from Nolan's prior production project (Ubuntu Stories).

**Decision:** Follow the Ubuntu Stories house style verbatim, because "consistent with a codebase already in production" is a stronger signal than a bespoke convention invented for a one-month submission. Concretely:

- **One table per file** under `api/src/database/schema/`, each exporting `XxxModel` (a `pgTable`), plus per-model `XxxModelInsert` / `XxxModelSelect` (`$inferInsert`/`$inferSelect`) and a hand-written `XxxModelUniqueWhere` union of the columns a row can be uniquely fetched by. snake_case columns, `uuid` PKs, `created_at`/`updated_at` with `withTimezone` and `$onUpdate(() => sql\`now()\`)`.
- **Relations live in one central `relations.ts`**, not colocated with each table — matches Ubuntu Stories and keeps the table files free of cross-imports beyond FK targets.
- **`pgEnum` for every enum** (`userRole`, `disputeStatus`, `disputeReason`, `authEvent`), generated from the SCREAMING_SNAKE constant objects in `shared/src/constant.ts` so the DB, the wire contract, and the TS union all come from one source. DB-level enum enforcement over a bare `varchar` + app check.
- **`bigint("amount_cents", { mode: "number" })` for money** (ZAR minor units), not `numeric` — integer cents avoid float/decimal representation questions entirely, and `mode: "number"` keeps it a plain JS number since values stay well inside `Number.MAX_SAFE_INTEGER` for this domain.
- **Partial unique index for the one-open-dispute guard** (ties to #4): `uniqueIndex("dispute_open_per_transaction_uq_idx").on(transaction_id).where(sql\`status in ('SUBMITTED', 'UNDER_REVIEW')\`)` — the "reject a second dispute while one is open" rule from #4 enforced in the schema, not just the handler.
- **`auth_audit_log` is keyed by `email`, not a `user_id` FK** (with `user_id` a nullable `set null` reference on top) — a failed login attempt may name an email that resolves to no user, and that attempt is exactly what the log needs to capture.
- **Better Auth uses `drizzleAdapter` with explicit split tables + `fields` maps** — `user`/`account`/`session`/`verification` are our own `pgTable`s with our column names, and each Better Auth field is mapped to its snake_case column rather than letting the adapter auto-create tables. `emailAndPassword: { enabled: false }`, `emailOTP` plugin only (`disableSignUp: true`, 6-digit, hashed at rest, 10-min expiry, 5 attempts — see #21 / `docs/auth.md`). `advanced.database.generateId` routes Better Auth's own row IDs through `lib/util.ts`'s `generateUuid` so its tables get the same v7 IDs as everything else (#29).
- **`lib/env.ts` is a zod-validated `process.env` singleton** — parsed once, cached, `process.exit(1)` with a readable per-key report on failure. Every other module imports the typed `env` object, never `process.env` directly.

**Alternative considered:** A repository/service layer over Drizzle from the start. Rejected per `CLAUDE.md`'s no-speculative-abstraction rule — there's no second caller yet. The `XxxModelUniqueWhere` types are the one concession: they cost almost nothing now and define the "how do you look this row up" contract that query code will lean on.

**How it solves the problem:** The schema looks like code that already ships in production because it is that code's conventions, and every enum/ID/money decision has a one-line defensible reason rather than a "seemed fine" shrug.

## 29. Primary keys: UUID v7 via Postgres 18's native `uuidv7()`, no separate public-id column

**Problem:** Sequential integer PKs leak information (row counts, creation order) and are enumerable if they ever reach a URL. The usual fix is a separate opaque "public id" column alongside the real PK. Is that needed here?

**Decision:** Every PK is `uuid("id").primaryKey().default(sql\`uuidv7()\`)` — Postgres 18 ships `uuidv7()` as a built-in function, so the database generates a time-ordered UUID with no extension and no app involvement. No separate public-id column: a v7 UUID is already non-guessable, so the PK *is* the safe-to-expose identifier.

**Alternatives considered:**

- **A separate `public_id` / slug column** on top of an internal PK (integer or UUID). This is the right call when the PK must stay internal for a reason that outlives "it's enumerable" — e.g. an integer PK kept for join performance, or a PK shared with an external system. Neither applies here: there's no external system, and a UUID PK is already opaque, so the second column would be pure ceremony — an extra index, an extra thing to keep unique, an extra lookup path — with nothing to protect that the PK doesn't already protect itself.
- **UUID v4** (`.defaultRandom()`, which is what Ubuntu Stories uses). Fully random, so every insert scatters across the PK's B-tree — index bloat and worse cache locality at scale. v7 keeps the non-guessable property (the random tail) while making the high bits a millisecond timestamp, so inserts stay roughly append-ordered. This is a **deliberate divergence from Ubuntu Stories**, and it's only possible because this repo chose Postgres 18 (#23) where `uuidv7()` is native — Ubuntu Stories predates that.
- **`gen_random_uuid()` + app-side v7.** The `advanced.database.generateId` hook already routes Better Auth's IDs through `lib/util.ts`'s `uuid` package v7 generator, since Better Auth generates IDs in application code. For our own tables the DB default is simpler and keeps ID generation next to the data.

**How it solves the problem:** Non-enumerable identifiers with no extra column, no extra index, and better insert locality than v4 — bought entirely by the Postgres 18 choice already made.

## 30. Enum wire values: SCREAMING_SNAKE, not lowercase

**Problem:** The enum constants (`DISPUTE_STATUS`, `DISPUTE_REASON`, `USER_ROLE`, `AUTH_EVENT`) need a canonical string form — the value stored in the DB enum, sent on the wire, and matched in code. `docs/api.md` and `docs/domain-model.md` originally sketched them lowercase (`submitted`, `fraudulent_charge`).

**Decision:** SCREAMING_SNAKE (`SUBMITTED`, `FRAUDULENT_CHARGE`, `ADMIN`). Matches Ubuntu Stories' constant convention exactly, so the `pgEnum(...)` calls can take the constant objects directly with no case transform, and a value is visually unambiguous as an enum member wherever it appears (log line, DB row, JSON body). `docs/api.md` and `docs/domain-model.md` are updated to match — they were the stale side.

**Alternative considered:** Lowercase wire values (common in public JSON APIs for aesthetics). Rejected only because it would fork from the prior project's convention for no functional gain and add a mapping layer between the constant object and the `pgEnum`.

**How it solves the problem:** One string form from `shared/src/constant.ts` through the DB enum to the JSON response, no transform anywhere.

## 31. OTP email delivery: nodemailer + Mailpit, wired for real (not a stub)

**Problem:** #21 put email-OTP on the login-critical path and accepted Mailpit as the dev/demo transport. Better Auth's `sendVerificationOTP` callback still needed a real implementation — it was a `console.warn` placeholder.

**Decision:** `nodemailer` (exact-pinned, matching Ubuntu Stories) with a single `lib/mailer.ts` — a transport built from the validated `env` and a `sendEmail({ to, subject, html })` that **logs and swallows failures instead of throwing**, because Better Auth advises against awaiting OTP delivery (timing side-channel) so callers fire-and-forget and a transport error must not surface as a login failure. Email bodies are plain builder functions under `api/src/email/` returning `{ to, subject, html }`; there's one so far (`otp-email-sign-in-request.ts`).

Deviations from Ubuntu Stories, all deliberate: (a) their `middleware/transport.ts` + `lib/mailer.ts` split is collapsed to one file — the split exists there because the transport is also Fastify-decorated, which isn't true here yet; (b) `secure: SMTP_PORT === 465` and auth omitted when `SMTP_USER` is empty, where Ubuntu Stories hardcodes `secure: true` + auth — Mailpit listens plaintext on 1025 and wants no credentials; (c) no email type-registry / template map — YAGNI until the recovery/invite emails in `docs/auth.md` §3 actually land.

The compose Mailpit service is `transaction-dispute-portal-mailpit`, but `api/.env` says `SMTP_HOST=mailpit`, so the dev override gives that service a `mailpit` network alias (the database is reached by its full service name in `DATABASE_URL`; Mailpit gets the short alias instead).

**Alternative considered:** Keep it a stub and document real SMTP only. Rejected — #21 already documents the *production* SMTP requirement; the point of Mailpit is that the demo login flow works end-to-end locally, which needs the callback to actually send.

**How it solves the problem:** Every local login produces a real SMTP message viewable at `localhost:8025`, with the failure mode (transport down) degrading to "no email arrives" rather than "login 500s".

## 32. Compose split: `compose.yml` is the production base, `compose.override.yml` holds the dev deltas

**Problem:** `compose.yml` was a *development* compose — `Dockerfile.dev`, whole-repo bind mounts, `tsx`/`vite` watch, CHOKIDAR polling, Mailpit. Nothing ran the production Dockerfiles (`api/Dockerfile`, `web/Dockerfile`) as a stack. The ask: make `compose.yml` the production compose without breaking the "bare `docker compose up` works on a fresh clone" promise (DoD, README, #15/#20).

**Decision:** Base + auto-merged override.

- `compose.yml` → production shape: `api/Dockerfile` / `web/Dockerfile` via `build:`, `NODE_ENV=production`, `env/production/` + `*.production` env files, no bind mounts, no Mailpit, DB not published. Bundled Postgres stays as a **labeled local-dry-run stand-in** — a real deployment points `DATABASE_URL` at managed Postgres (`docs/scaling-and-resilience.md`).
- `compose.override.yml` → dev deltas only. Docker Compose auto-merges `compose.override.yml` on any bare `docker compose` command, so `docker compose up` still gives the dev stack with no flags. Production dry-run is the explicit `docker compose -f compose.yml up --build`.
- `env_file` in the override uses the `!override` YAML tag — Compose *appends* sequence values by default, which would also pull in the (absent) production env files.

New committed env files follow the #20 pattern (every secret-shaped key blank, real values in a gitignored `*.local` sibling): `env/production/.env.database`, `api/.env.production`, `web/.env.production`. `.gitignore` gets three allowlist lines; `.dockerignore` broadened to `.env*` / `*/.env*`.

**Alternative considered:**

- **GHCR `image:` instead of `build:`** for the prod services. Rejected for the dry-run — `build:` is self-contained (DoD line 13), needs no registry auth, and `deploy.yml` already owns the GHCR publish path unchanged. A real deployment runs the GHCR images via the k8s manifests, not this file.
- **A single compose file with profiles.** Workable, but profiles gate whole services, not per-service field overrides — the dev/prod difference here is mostly *the same services with different build targets and mounts*, which is exactly what the override-file merge is for.

**Gotcha, recorded because it cost time:** base and override MUST set **distinct explicit `image:` names** (`transaction-dispute-portal-api` vs `-api-dev`). Compose derives the image name from project + service, so without explicit names a bare `docker compose up` after a `-f compose.yml build` reuses the *production* image for the dev service and the container crashes on `Cannot find module dist/app.js`. Also: stale pre-existing `*-node_modules` volumes can make the dev container's pnpm self-heal install prod-only deps (`tsx: not found`) — `docker volume rm` the four `*-node_modules` volumes if that surfaces.

**How it solves the problem:** One command each — `docker compose up` for dev (unchanged), `docker compose -f compose.yml up --build` for the production dry-run — from one base file plus a diff.

_Revised by decision 34:_ the base/override split and the merge mechanics stand, but "production" becomes "staging" — there's no production tier anywhere now. Both files read the committed `./api/.env` / `./web/.env` / `./env/.env.database` directly (no `*.production` files, no `!override` on `env_file`, no `*.local` siblings). The distinct-`image:`-names gotcha still applies. See #34.

_Superseded by decision 42:_ the split itself is gone — `compose.override.yml` is deleted and its dev deltas are folded into a single dev-only `compose.yml`. There is no non-dev compose shape in the repo. See #42.

## 33. Database migrations: a manually-triggered GitHub Actions workflow

**Problem:** #24 built the standalone migration runner (`api/src/database/migrate.ts`) but nothing invoked it in CI/CD. A migration should be a deliberate, auditable action against a chosen environment — not automatic on deploy, and not only runnable from a laptop.

**Decision:** `.github/workflows/migrate.yml` — `workflow_dispatch` with a `staging` / `production` environment choice. `environment: ${{ inputs.environment }}` binds the job to that GitHub Environment, so `production` inherits the same required-reviewer gate as `deploy.yml` (#25) and each environment supplies its own `DATABASE_URL` secret. Steps: checkout → corepack → `setup-node` (`.nvmrc`) → `pnpm install --frozen-lockfile` → `drizzle-kit check` (catches migration/snapshot drift; needs no DB) → a guard that fails with a "add `DATABASE_URL` to this environment's Secrets" message if the secret is unset → `pnpm --filter @transaction-dispute-portal/api migrate`. `concurrency: migrate-<environment>` with `cancel-in-progress: false` queues runs so two never touch one database at once.

No live database exists (`CLAUDE.md`), so the workflow is **dormant** — a dispatch fails fast at the guard with setup instructions until a real `DATABASE_URL` secret is added.

Also tweaked `api/src/database/migrate.ts`: `onnotice: () => {}` on the `postgres()` client, to silence the `schema/relation already exists, skipping` NOTICEs Postgres emits for the migrator's own `CREATE ... IF NOT EXISTS` bootstrap on every re-run — harmless but they read like errors in a CI log.

**Alternative considered:** Run migrations from `deploy.yml` automatically before the app rolls out. Rejected for the same reason #24 decoupled migration from API boot — a schema change should be its own reviewed step with its own approval, not a side effect of shipping code. The runner uses a fresh `pnpm install` rather than the GHCR image, so the migration path and the deployed-artifact path are independent (chosen deliberately).

**How it solves the problem:** A migration is now one button in the Actions UI, gated and audited per environment, ready the moment a database exists.

_Revised by decision 34:_ staging-only — the `staging`/`production` environment choice input is removed (`environment: staging` hardcoded, `concurrency: migrate-staging`). Everything else (the `drizzle-kit check` pre-flight, the `DATABASE_URL` guard, dormancy) is unchanged. See #34.

_Superseded by decision 42:_ `migrate.yml` is deleted. The dev `compose.yml` runs `pnpm … migrate` before `… dev` on api start, so a fresh clone applies the schema with no manual step; running migrations as an approved pre-deploy step in a real pipeline is `docs/production-runbook.md` §3. See #42.

## 34. Collapse to one committed `.env` per package; drop the production tier

**Problem:** Decisions #15 → #19 → #20 spent three rounds on committed env files, landing on: every secret-shaped key blank in the committed `.env`, real values in a gitignored `.env.local` sibling, `compose.yml` layering the two. And #24 → #25 → #27 built a `build → staging → tag → production` pipeline with a required-reviewer gate on a `production` GitHub Environment. Revisited by explicit instruction: both are more machinery than this project needs. The "secrets" involved are a local Postgres password and two freshly-generated auth secrets — no external-account access, and (`CLAUDE.md`) no live deployment they could ever leak into. The `production` tier gates a promotion that will never happen.

**Decision:**

- **One committed `.env` per package, holding working local values.** `api/.env` carries a real `DATABASE_URL`, `BETTER_AUTH_SECRET`, `COOKIE_SECRET`; new `env/.env.database` carries a real `POSTGRES_PASSWORD`. `web/.env` unchanged (no secrets). Deleted: `api/.env.local`, `api/.env.production`, `web/.env.production`, `env/development/`, `env/production/`. No `.env.staging` / `.env.production` variants — one file, used by both the dev override and the staging base. `.gitignore` now ignores only `*.env.local` (a personal, untracked override anyone can still add); `.dockerignore` keeps its `.env*` globs (env is a runtime concern, never baked). No comments in any env file.
- **No production tier.** `deploy.yml` is `build → staging` — the `tag` (auto version-bump) and `production` (gated) jobs are deleted, and `staging` now also pushes `:latest` since nothing else claims it. `migrate.yml` is staging-only. The `production` GitHub Environment and its required-reviewer rule are no longer used.
- **`compose.yml` is the staging base** (was "production"); it and `compose.override.yml` both read `./api/.env` etc. directly, so the override no longer needs an `env_file` block at all.

**Alternative considered:** Keep #20's blank-secret model and only drop the `.env.production` split. Rejected — if the committed values are fake local-only secrets anyway (which #15 already established and #20 didn't dispute), blanking them protects nothing and just adds a mandatory copy-and-fill step to every fresh clone. The honest position is either "these are real secrets, keep them out" or "these are fakes, commit them" — #20 was trying to have it both ways.

**How it solves the problem:** `docker compose up` works on a clean clone again with zero setup (reversing #20's regression on the DoD item), and the pipeline describes exactly what exists — one build, one staging publish — instead of a promotion flow with no destination. Cost: the repo now contains working (fake) secrets in git history, accepted deliberately for a repo whose threat model is "a promotion panel reads it."

_Known wart:_ the staging-only `docker compose -f compose.yml up` inherits `SMTP_HOST=mailpit` from `api/.env` but has no Mailpit service (that's dev-override only), so OTP sends fail there — silently, since `sendEmail` swallows transport errors (#31). Fine for a staging image sanity-check; a real deployment sets real SMTP.

_Revised by decision 42:_ the "one committed `.env` per package with working local values" model this decision landed is kept and taken further — `env/.env.database` moves to `env/development/.env.database`, and the staging tier #34 still had (`deploy.yml` `build → staging`, `migrate.yml`, the `compose.yml`/`compose.override.yml` split) is all removed. The repo is now dev-only end to end; the wart above is moot (one compose file, Mailpit always present). See #42.

## 35. API skeleton: mirror the Ubuntu Stories request stack, with the over-builds named and trimmed

**Problem:** `docs/api.md` had a route sketch and `shared` had the response envelope (#22), but nothing on disk turned a request into a response — no app factory, no plugin registration, no module structure, no error/auth wiring. Same fork as #28: invent a fresh request stack for this repo, or reuse the one from a project already in production (Ubuntu Stories).

**Decision:** Reuse the Ubuntu Stories structure, for the same reason as #28 — "consistent with a codebase already shipping" beats a bespoke shape invented for a one-month submission. Concretely:

- **`build()` factory split from `app.ts`.** `src/build.ts` wires plugins + routes and returns the app short of `listen()` (so tests get an app with no open port); `src/app.ts` calls `build(logger)`, attaches `close-with-grace`, and listens. `app.ts` never imports the migration runner (#24).
- **`middleware/index.ts` registers every cross-cutting concern in one place** — helmet, CORS, `@fastify/rate-limit` (global), `@fastify/cookie`, the zod validator/serializer compilers, the error handler, the not-found handler, the request-timing / structured-logging hooks, and the `authenticate` / `authorize` / `connection` decorators.
- **`modules/<name>/{route,service,type}.ts` triad.** `route.ts` declares method + URL (from `shared`'s `API_PATHS`) + zod schema + `preHandler` chain; `service.ts` is the handler; `type.ts` is the `RouteGenericInterface`. `route/index.ts` mounts each module under its namespace prefix, resolved from `shared`'s `API_URLS(env.API_VERSION)` so the `/v1` prefix lives in exactly one place.
- **`type/fastify.ts`** declares the `FastifyInstance` / `FastifyRequest` augmentation (`authenticate`, `authorize`, `connection`, `request.user`, `request.session`).

Deliberate trims vs. Ubuntu Stories, each because the panel reads this repo against `CLAUDE.md`'s own no-speculative-abstraction rule, not against a codebase they can't see (full blow-by-blow in `docs/overkill-implementation.md`, enhancement follow-ups in `docs/enhance-suggestion.md`):

- **No generic query DSL / repository-over-the-ORM** — deleted outright; per-module hand-written Drizzle instead (#36).
- **No event middleware** — dropped `EVENT_NAMES`, the `X-Event-Name` header, `request.eventName`, `app.event(...)` in `preHandler`. Routes declare handler + schema only.
- **One correlation id, not two** — `genReqId` seeds Fastify's own request id from `x-correlation-id` / `x-request-id`, logged as `correlationId` and echoed on every response. No parallel second id.
- **No custom Pino levels** — Ubuntu Stories redefined the level set to identical values; removed, along with the now-empty `lib/constant.ts` and `type/global.ts`.
- **Flat `readyz`** — `ready` / `503` with a 2s timeout on the `select 1` probe, not a three-state per-subsystem health model (also closes `docs/enhance-suggestion.md` #7).
- **Better Auth's own rate limiter off** — the global `@fastify/rate-limit` plus per-route caps (#37) cover its endpoints; two limiters was two things to reason about.

**Alternatives considered:** Invent a fresh request stack — rejected, same reasoning as #28. Land the skeleton as-was, DSL and all, and trim later — rejected: the DSL is the exact "repository layer with no second caller" the conventions rule names, and shipping it then removing it wastes the reviewer's attention on machinery that never earned its place.

**How it solves the problem:** A request stack that looks like production code because it is that code's structure, minus the parts that only make sense at Ubuntu Stories' size — and every subtraction is written down where a "why is this different from your other project" question can find it.

## 36. Data access: per-table hand-written Drizzle functions taking an `Executor`, not a query builder

**Problem:** #35 deleted Ubuntu Stories' generic `core` query DSL (`server.core.story.many({ where, select, order, page, ... })`). Query code still needs *somewhere* to live — inline in each service, or a thin seam of its own.

**Decision:** `api/src/database/repository/<table>.ts` — one file per table, each exporting plain arrow functions that write the Drizzle query by hand (`recordAuthEvent(executor, record)`), re-exported from `repository/index.ts`. Every function takes an `Executor` as its first argument — `database/executor.ts` types it as `typeof connection | Transaction`, i.e. the pooled connection or an open transaction handle — so the *caller* decides transaction scope and the same function works inside or outside one. Modules import from `repository/`, never from each other.

**Alternatives considered:** Keep the generic DSL — rejected (#35): an ORM over the ORM with, at deletion time, zero real callers. Inline Drizzle directly in each `service.ts` — rejected: `CLAUDE.md` wants query/type logic centralized rather than scattered per-route, and a named repository function is the seam an integration test can point at a rolled-back transaction. A full repository *class* / DI container — rejected per the no-speculative-abstraction rule; these are just functions.

**How it solves the problem:** The query layer is a flat list of named functions a reader can scan in one pass, with transaction control pushed to the caller via the `Executor` parameter — the one piece of structure that pays for itself immediately (the auth module already opens no transaction; the dispute module will).

## 37. Auth module: wrap Better Auth's server API in our own routes, don't mount its HTTP handler

**Problem:** Better Auth ships a catch-all handler you can mount at `/v1/auth/*` and be done. But then login responses wouldn't match `shared`'s envelope (#22), there'd be no `auth_audit_log` trail (`docs/domain-model.md`), and Better Auth's built-in rate limiting would be the login-abuse story instead of one we chose.

**Decision:** `modules/authentication/` defines three explicit routes — `POST /v1/auth/otp`, `POST /v1/auth/otp/verify`, `POST /v1/auth/sign-out` — whose services call `auth.api.*` through `lib/authentication.ts` and then own the rest: shape the result into the `shared` envelope, forward Better Auth's `Set-Cookie` headers verbatim, write an `AUTH_EVENT` row via `repository/auth-audit-log.ts` (`OTP_REQUESTED` on request; `LOGIN_SUCCESS` with `user_id` / `LOGIN_FAILURE` / `OTP_LOCKED` on verify, distinguished by inspecting Better Auth's response), and carry a per-route rate limit derived from `shared`'s `OTP` constant (`MAX_ATTEMPTS`/min on request; `2 × MAX_ATTEMPTS`/min on verify, loose enough that Better Auth's own 5-attempts-per-code lockout is what a fat-fingering user hits, not a 429). `/v1/auth/otp` responds identically whether or not the account exists — no user-probing. `emailAndPassword` is off; Better Auth's own rate limiter is off (#35).

**Alternatives considered:** Mount Better Auth's handler as-is — rejected for the three gaps above (envelope, audit trail, rate-limit ownership). Put the audit-log write inside `lib/authentication.ts` rather than the service — rejected: the service already has `request.ip` / `user-agent` / the parsed Better Auth response in hand, and `lib/` shouldn't reach for the repository.

**How it solves the problem:** Login, verify, and sign-out return the same envelope as every other endpoint, every attempt lands in `auth_audit_log` keyed by email (#28), and the rate-limit story is one we can point at and explain — at the cost of ~140 lines of service code wrapping calls Better Auth would otherwise handle itself. Verified end to end against Postgres + Mailpit (see the commit message for the exact trace).

## 38. Dates: `date-fns`

**Problem:** Date math was about to start (seed spread over months; dispute-resolve timestamps; `from`/`to` range filters) with raw `Date` mutation (`d.setMonth(d.getMonth() - 14)`) as the default.

**Decision:** `date-fns` is the date library from here. It operates on native `Date` — exactly what Drizzle's `timestamp` columns and `faker.date.*` already return — so there's no wrapper type at the DB boundary (unlike luxon's `DateTime`); it's function-based and tree-shakeable, matching the repo's arrow-function style. `new Date()` for "now" stays fine. First use: `subMonths(now, 14)` in the seed.

**Alternatives considered:** luxon — richer, but its `DateTime` wrapper means converting at every DB read/write. Raw `Date` mutation — error-prone and the thing this decision exists to stop. dayjs — smaller, but mutable-by-default plugins and a less explicit API.

**How it solves the problem:** One immutable, native-`Date`-in/out helper set for every date operation, no boundary conversions.

## 39. Customer data scoping: the owner filter is in the query, and a miss is a 404 not a 403

**Problem:** `docs/domain-model.md`'s authz NFR — "a customer only ever reads/acts on their own transactions and disputes" — needs a concrete shape in the first module that reads customer data (`transactions`). Two sub-questions: where does the ownership check live, and what does a cross-owner request return?

**Decision:**

- **The `user_id = :caller` predicate is part of every customer query itself**, not a separate `if (row.user_id !== user.id)` check after a fetch. `findUserTransactionById(executor, { id, userId })` filters on both columns; `findTransactionsByUser` filters on `user_id` before paginating. There is no code path that loads a row and *then* decides whether the caller may see it — the database never returns another user's row in the first place.
- **A row that exists but isn't the caller's returns `404`, identical to a row that doesn't exist** — never `403`. A `403` on someone else's id confirms that id is real; a uniform `404` leaks nothing. (A malformed id is a `422` from the UUID params schema — a different class, a client error in the request itself.)
- **Route-level `authorize(CUSTOMER)`** on top: an `ADMIN` session on a `/v1/transactions*` route is a `403`. The admin surface is its own namespace (`docs/decisions.md` #16); the customer API is not a second way in for an admin.

**Alternatives considered:** Fetch-then-check ownership in the service — rejected: it works, but it puts a row the caller may not see into application memory and makes the guard a thing every handler must remember rather than a property of the query. `403` for a cross-owner request — rejected: it's the "correct" status in the abstract, but it's also an existence oracle for enumerable-looking ids; the DoD's own wording ("can't read another user's data") is about non-disclosure, and `404` discloses less.

**How it solves the problem:** The authz guarantee is enforced one layer down from the handler — in the `repository/` query — so a new customer endpoint gets it by using the scoped repository function, not by re-implementing a check. And the response shape gives an attacker with a stolen id no signal about whether it's valid.

## 40. Dispute submission: the DB is the one-open-dispute guard, not an application pre-check

**Problem:** `docs/api.md`'s `POST /v1/disputes` line asks for an idempotent submit — "reject with a clear error if the transaction already has an open dispute", and "treat a duplicate idempotency key as a no-op". Two ways to build the one-open-dispute-per-transaction rule: a `SELECT … WHERE status IN (open)` before every insert, or let the database reject it.

**Decision:** No pre-check query, no `Idempotency-Key` header, no new column. The partial unique index from #4/#28 (`dispute_open_per_transaction_uq_idx` on `transaction_id WHERE status IN ('SUBMITTED','UNDER_REVIEW')`) is the entire mechanism. `createDispute` just inserts; a second open dispute hits the index and Postgres raises `23505`. `middleware/error.ts` catches it — `DrizzleQueryError` (drizzle 0.45 wraps the driver error; the `postgres`-js `code`/`detail`/`constraint_name` live on `.cause`) with `code === "23505"` → `409` + a domain-neutral message. The service has no `try`/`catch`; the global handler owns it.

`GET /v1/disputes` and `GET /v1/disputes/:disputeId` follow #39 exactly — owner filter in the `repository/dispute.ts` query, a cross-owner or missing row is a `404`, a malformed id a `422`. The wire schema omits `user_id` (always the caller) and `resolved_by` (internal), excluded from the query itself per #43.

**Alternatives considered:** Pre-check with a `SELECT` — rejected: it's a TOCTOU race (two concurrent submits both pass the check, both insert), so you need the unique index anyway, at which point the `SELECT` is redundant work on every call. An `Idempotency-Key` header + table — rejected: real machinery for a problem the DB constraint already solves; the "duplicate key is a no-op" phrasing in api.md predates the partial index and is satisfied by "duplicate open dispute is a clean 409". Catching `23505` in the service — rejected: error-to-envelope mapping is the global handler's job (#35), and every module would repeat it.

**How it solves the problem:** One writer of the rule (the migration), one place it's enforced (Postgres), one place the error becomes a response (`middleware/error.ts`). Verified: 5 parallel `POST /v1/disputes` for one transaction → exactly one `201`, four `409`, one dispute row, one audit row, no "Unhandled error" log.

## 41. Dispute lifecycle: forward-only, each transition guarded inside the `UPDATE … WHERE`

**Problem:** `docs/domain-model.md` states the lifecycle as `SUBMITTED → UNDER_REVIEW → RESOLVED | REJECTED`, but `docs/api.md`'s admin section only sketched a review *list* and a *resolve* action — nothing moved a dispute into `UNDER_REVIEW`, so requiring resolve to run from that state would strand every dispute, and allowing resolve straight from `SUBMITTED` would make `UNDER_REVIEW` a state nothing uses. Also: where does the "is this transition legal" check live, given #40 just established that pre-checks race.

**Decision:**

- **Add `POST /v1/admin/disputes/:disputeId/review`** (`SUBMITTED → UNDER_REVIEW`) alongside `.../resolve` (`UNDER_REVIEW → RESOLVED | REJECTED`). `resolve` **requires `UNDER_REVIEW`** — resolving a still-`SUBMITTED` dispute is a `409` ("move it to review first"). So every closed dispute carries a full `SUBMITTED → UNDER_REVIEW → terminal` chain in `dispute_audit_log`, and "a reviewer looked before deciding" is a real control, not an honour system.
- **The legal-from-status check is the `UPDATE`'s `WHERE` clause**, not a prior `SELECT`: `markDisputeUnderReview` is `UPDATE … SET status = 'UNDER_REVIEW' WHERE id = $1 AND status = 'SUBMITTED' RETURNING *`; `resolveDispute` likewise with `WHERE … AND status = 'UNDER_REVIEW'`. An empty `RETURNING` means the row wasn't in the expected state — the caller returns `409`. A cheap pre-read still runs first, only to distinguish `404` (no such dispute) from `409` (wrong state) and to give a friendlier message for the common already-closed case. Concurrent calls collapse to one write + one audit row (verified: 8 parallel `review`s → exactly one audit row).
- **`review` is idempotent** — a second call on an already-`UNDER_REVIEW` dispute is a `200` no-op, not a `409`.
- **No `reviewer_id` on the dispute.** `UNDER_REVIEW` is a status flag; any admin can resolve any dispute in that state. Assignment/claiming is not modelled — the brief's admin portal is "minimal by design" (#16).
- Status-change notifications (`docs/notifications.md`) fire on `review` and `resolve` alike — the per-user ntfy topic gets `UNDER_REVIEW` / `RESOLVED` / `REJECTED` as the message body.
- Wire values `RESOLVED` / `REJECTED` for the resolve body come from a new `TERMINAL_DISPUTE_STATUS` shared constant via `disputeResolutionSchema`, mirroring `OPEN_DISPUTE_STATUS`.

Route-path plumbing folded in with the dispute modules: the `PUBLIC` API namespace is renamed `CUSTOMER` (every route under it is `authorize(CUSTOMER)`-gated, so "public" misled; it now lines up 1:1 with `USER_ROLE.CUSTOMER` and the sibling `ADMIN` namespace — URL mapping unchanged), and the inlined per-resource `{ transactionId: uuidSchema }` param schema becomes a shared `uuidParamsSchema(key)` factory + `UuidParams<Key>` type, reused for `:transactionId` and `:disputeId`.

**Alternatives considered:** Allow `resolve` from any open status, `review` optional — rejected: makes `review` skippable, so the audit chain isn't guaranteed and `UNDER_REVIEW` is decorative. Add a full `SUBMITTED → UNDER_REVIEW` *and* backward `UNDER_REVIEW → SUBMITTED` / reopen edges now — deferred: the forward-only machine keeps audit and "time in state" metrics clean and matches the minimal-portal scope; the real-world edge cases (customer with new evidence after a `REJECTED`, admin declining a review, customer withdrawal, supervisor override) are worth a deliberate pass rather than a guess — see the open item at the end of this file. A state-machine table / library — rejected per the no-speculative-abstraction rule for a 4-state, 2-endpoint lifecycle.

**How it solves the problem:** The lifecycle in `domain-model.md` is now real end to end, every transition is concurrency-safe by construction (the guard and the write are one statement), and the audit log tells the whole story of any dispute without inference.

## 42. One dev-only environment; productionising the repo is a runbook, not a pipeline

**Problem:** #24–#27 built a `build → staging` (once `→ tag → production`) GitHub Actions pipeline; #32 split `compose.yml` (a non-dev base) from `compose.override.yml` (dev deltas); #33 added a manual `migrate.yml`; #34 trimmed all of that to "staging only" but kept the shape. By explicit instruction: this repo is not going to production and never will (`CLAUDE.md`), a promotion panel is the entire audience, and every one of those pieces is machinery modelling a deploy that doesn't exist. A fresh clone should be `docker compose up` and nothing else.

**Decision:**

- **One `compose.yml`.** `compose.override.yml` is deleted and its dev deltas (bind mounts, `tsx`/`vite` watch, CHOKIDAR polling, published `5432`, 90s healthcheck `start_period`, Mailpit) fold into it. It also carries the `ntfy` service (`docs/notifications.md`). There is no non-dev compose shape in the repo.
- **One `Dockerfile` per package.** The multi-stage production `api/Dockerfile` / `web/Dockerfile` are deleted; `Dockerfile.dev` → `Dockerfile` (full workspace install, runs the dev server against bind-mounted source). Explanatory comments stripped to match the no-comments house rule.
- **`shared` builds, then migrations run, then the dev server starts.** `compose.yml`'s api `command:` is `pnpm … shared build && pnpm … api migrate && pnpm … api dev` (web: `shared build && web dev`). The `shared build` step is load-bearing: `api`/`web` import `@transaction-dispute-portal/shared` through its `exports` map, which points at `shared/dist/` — and `dist/` is gitignored, so a fresh checkout doesn't have it and nothing in the image builds it (the bind mount would shadow it anyway). Building it as the first command step, after the bind mount is in place, is what makes `git clone && docker compose up` actually work. `db:seed` stays a separate one-shot (`docker compose exec …`). Safe *because* it's a disposable dev database — production keeps migrations a gated, standalone step (runbook §3), the thing #24 was right about.

  _(Added after the first clean-CI run: the `stack` job failed — api unhealthy, `ERR_MODULE_NOT_FOUND` on `shared/dist` — because the setup had only ever run on machines with a stale `shared/dist` from a prior `pnpm build`. The `shared build` prefix fixes it; verified by deleting `shared/dist` and running `docker compose up --wait` from clean.)_
- **`env/.env.database` → `env/development/.env.database`.** The "one committed `.env` per package, working local values" model from #34 is unchanged otherwise.
- **CI (`build.yml`) is checks + a smoke test.** `lint`/`typecheck`/`build`/`test`, then a second job that does `docker compose up -d --build --wait`, hits `/healthz`, runs `db:seed`. `deploy.yml` and `migrate.yml` are deleted.
- **`docs/production-runbook.md`** is the new home for everything removed: multi-stage image reference, orchestrator-injected secrets, migrations as an approved pre-deploy step, a registry-push + gated-deploy pipeline (with the GitHub Environments required-reviewer pattern from #25), k8s manifests with probes wired to `/healthz` + `/readyz`, the load-test number. Added to `CLAUDE.md`'s "Read first".

**Alternatives considered:** Keep #34's staging tier as-is — rejected: it builds and pushes an image nobody deploys, and "staging" with no production is a name for "the only tier". Keep the `compose.yml`/`override.yml` split for a "production-shaped" local run — rejected: that run already had the known SMTP wart (#34), and its only value was rehearsing a deploy that isn't happening; a written runbook communicates the same understanding to the panel without the maintenance surface. Auto-seed on start too — rejected: the seed truncates first, so every `compose up` (including a plain restart) would wipe working data; migrate is idempotent, seed is not.

**How it solves the problem:** `git clone && docker compose up -d` is the whole setup, CI proves exactly that path works, and the production story is told once, completely, in a document — where a "how would you actually ship this?" interview question can find it — instead of being half-modelled across six workflow and compose files that each need a "this doesn't really deploy anywhere" caveat.

## 43. Repository reads: exclude columns with `getTableColumns` rest-spread

**Problem:** The customer-facing dispute and transaction queries must not expose `user_id` / `resolved_by`. The first cut hand-listed the ~9 wanted columns in a `COLUMNS` object per repo; a hand-list drifts from the schema when a column is added. A follow-up cut kept `SELECT *` and narrowed the return type with `Omit<…>` — but the database still returns every column over the wire, which isn't the point.

**Decision:** `const { user_id, resolved_by, ...CUSTOMER_COLUMNS } = getTableColumns(DisputeModel)` (drizzle's `getTableColumns` returns the full column map), then `.select(CUSTOMER_COLUMNS)`. The exclusion is expressed as "everything except these", derived from the table so a new column is included automatically, and it's a real projection — the emitted SQL lists only the kept columns (verified against Postgres statement logging). `eslint.config.js` gains `@typescript-eslint/no-unused-vars: { ignoreRestSiblings: true }` so the discarded destructure bindings don't trip the linter. Admin/internal reads that genuinely need every column keep a bare `.select()` returning `XModelSelect`. `CLAUDE.md`'s Drizzle convention line is updated to this.

Also in this cleanup: `executor.$count(table, where)` replaces the `select({ value: count() })` + `[tally]` destructure for pagination totals; `REVIEW_COLUMNS` / `DisputeReviewRow` are deleted (they enumerated every column, so the derived type was just `DisputeModelSelect`).

**Alternatives considered:** Hand-listed `COLUMNS` — rejected: silently wrong when the schema grows. `SELECT *` + `Omit` in the type only — rejected: the wire payload and query still carry the excluded columns; the type is a fig leaf. Drizzle's relational query API (`db.query.x.findMany({ columns: { user_id: false } })`) — rejected: this repo removed the relational/DSL layer (#35/#36) and uses core `.select()`.

**How it solves the problem:** The projection is a one-line "all but these", it follows the schema, and it's enforced in SQL — not just in TypeScript.

## 44. Admin invites: a dedicated `admin_invite` table, not Better Auth's `verification`

**Problem:** #16 settled that admin accounts are invite-only — a seeded admin emails a one-time link, and following it is what creates the account; no self-service admin signup. Building that needs somewhere to persist the pending invite (who it's for, who sent it, when it expires, whether it's been used). Better Auth already ships a `verification` table (`identifier` / `value` / `expiresAt`), and the OTP plugin already writes to it — reusing it for invites was the obvious first thought.

**Decision:** A hand-rolled `admin_invite` table (`email`, `token` unique, `expires_at`, `accepted_at` nullable, `invited_by` FK to `user`, timestamps) with its own `repository/admin-invite.ts`. Two routes under the admin prefix:

- `POST /v1/admin/invites` — `authenticate` + `authorize(ADMIN)`; body `{ email }`. `409` if an account already exists for that address. Otherwise a `randomBytes(32)` hex token, a row with `expires_at = now + ADMIN_INVITE_EXPIRY_HOURS` (72h, a shared constant), and a real invite email (Mailpit for dev/demo). The wire response omits the token — it only ever travels in the emailed link.
- `POST /v1/admin/invites/:token/accept` — **no** `authenticate` preHandler (the invitee has no session yet); body is just `{ name }`, the email comes from the invite row, not the request. Missing token → `404`; already-used or expired → `409`. Then, in one `connection.transaction()`: `acceptAdminInvite` (a guarded `UPDATE … SET accepted_at = now() WHERE token = $1 AND accepted_at IS NULL AND expires_at > now() RETURNING` — the "still valid" check is in the `WHERE`, per #4/#41, so a concurrent second accept matches nothing and the caller returns `409`), then `createUser({ role: ADMIN, email_verified: true })`. Login is email-OTP from there like every account (#21). Its own rate limit (`OTP.MAX_ATTEMPTS * 2`), since the caller is unauthenticated.

**Alternatives considered:** Reuse Better Auth's `verification` table — rejected: it has no `invited_by` (the invite audit trail — who onboarded whom — is a real part of the "how do admins get created" answer), Better Auth treats its rows as consume-once and deletes them on use (we want the row to persist so a second click is a clean `409` and the acceptance is on record), and coupling our admin-onboarding flow to an internal Better Auth table is a latent break on any BA upgrade that changes that schema. There's also no Better Auth endpoint that would create an *admin-role* account from a `verification` row, so we'd be hand-writing the accept logic regardless — the only thing reuse would save is one `pgTable` definition. A generic "token" table shared with any future email-link flow — rejected per the no-speculative-abstraction rule; there's one such flow today. Sending the new admin a password or a magic session on accept — rejected: every account authenticates the same way (#21), and accept issuing a session would be a second login path to reason about.

**How it solves the problem:** The invite is a first-class domain record with the fields the flow actually needs, its lifetime is ours to define, and the "is this invite still good" decision is one guarded statement — no read-then-write race, no dependency on Better Auth internals.

## 45. Dispute lifecycle edge cases: `WITHDRAWN` is the only new state; "reopen" is a new dispute

**Problem:** #41 built a forward-only lifecycle (`SUBMITTED → UNDER_REVIEW → RESOLVED | REJECTED`) and explicitly left the real-world edge cases as an open item: a customer with new evidence after a `REJECTED`, an admin who starts a review and can't finish it, a customer withdrawing a mistaken dispute, a supervisor overriding a wrong resolution, and whether any backward move notifies the customer. Calling the lifecycle "done" means deciding each of these on purpose rather than by omission.

**Decision:**

- **Add `WITHDRAWN` as a terminal state, reachable only by the customer** via `POST /v1/disputes/:disputeId/withdraw` from either open state (`SUBMITTED` or `UNDER_REVIEW`). `resolved_at` is set, a `dispute_audit_log` row is written (`actor_id` = the customer, from-status → `WITHDRAWN`, "Withdrawn by the customer."), all in one transaction. Ownership **and** open-status are both in the `UPDATE … WHERE` (per #4). The whole handler runs inside one `connection.transaction()`: it reads the dispute with `SELECT … FOR UPDATE` first (a missing/other-user row → `404`, an already-closed one → `409`), then does the guarded `UPDATE`. The row lock matters for one thing — the audit row's `from_status` comes from that read, and without the lock an admin `review` landing in the gap would make it record `SUBMITTED → WITHDRAWN` for what was really an `UNDER_REVIEW → WITHDRAWN` (found in the backend audit, item A2). `WITHDRAWN` is kept distinct from `REJECTED` because "the customer changed their mind" and "an admin looked and said no" are different facts, and the audit story is the point of the lifecycle.
- **"Reopen after a rejection" is opening a new dispute, not a backward transition.** The old dispute stays as an immutable record. This already works: the partial unique index only blocks a second *open* dispute per transaction, so once the first is `REJECTED` / `WITHDRAWN` the transaction is free for a fresh one. No `/reopen` endpoint, no `REJECTED → SUBMITTED` edge, no "reopened from" pointer.
- **An admin declining a review is out of scope.** `UNDER_REVIEW` is an unassigned status flag (#41 — no `reviewer_id`), so there's nothing to "hand back"; any admin can still resolve it. `review` is already idempotent, so a mistaken transition isn't a trap.
- **Supervisor override of a resolved dispute is out of scope.** The admin portal is minimal by design (#16); a second admin tier and a `RESOLVED → …` edge is a back-office feature the brief doesn't ask for.
- **`disputeResolutionSchema` narrows to `ADMIN_RESOLUTION_STATUS` (`RESOLVED | REJECTED`)** — a new shared constant — so the admin resolve body can't target `WITHDRAWN`. `TERMINAL_DISPUTE_STATUS` gains `WITHDRAWN` for the "is this dispute closed" checks. Seed data grows a `WITHDRAWN` slice (~7%) with its own `SUBMITTED → WITHDRAWN` audit row.

This resolves the open item left at the end of #41.

**Alternatives considered:** An explicit `POST /v1/disputes/:disputeId/reopen` that clones the dispute — rejected: it's a wrapper around "insert a new dispute", which the customer can already do directly, and it invites a "reopened from" chain that nothing consumes. A `REJECTED → SUBMITTED` backward edge — rejected: it makes "time in state" and the audit chain ambiguous (was this the first or third pass?) for no gain over a fresh row. Modelling review assignment / release / supervisor roles now — rejected: real machinery for a portal scoped to a review list and a resolve button. Folding withdrawal into `REJECTED` — rejected: collapses two distinct facts and makes the audit log lie about who closed the dispute.

**How it solves the problem:** Every edge case named in #41 now has an explicit answer — one is built (`WITHDRAWN`), the rest are ruled out with a reason tied to an existing scope decision — and the lifecycle stays forward-only, so the audit chain and the concurrency guarantees from #41 are unchanged.

## 46. Account-security emails: built on Better Auth's session hook and two-step change-email

**Problem:** #14 committed to new-device login alerts and email-change confirmation over outbound SMTP, and #21 made the account email the entire credential — so an attacker who can receive a victim's OTP codes *is* the victim, and quietly redirecting where those codes go is the whole attack. #14 was still documented-only. Building it means picking where the alert fires and how the change-email flow avoids becoming the redirect vector it's meant to defend against.

**Decision:**

- **New-device login alert** — a Better Auth `databaseHooks.session.create.after` hook (`lib/security-notifications.ts`). On session create it checks `repository/session.ts`'s `hasKnownDeviceSession` (same `user_id` + `user_agent`, a different session id); if this is the first session for that user-agent, it emails the account. The send is `void`-ed with a `.catch` — never awaited into the login response, per #14's "never on the login critical path". A missing `user_agent` is skipped (can't match against history; only non-browser clients omit it). Seed data gives the demo accounts one known-device session so "quiet on a known device, alert on a new one" is demonstrable.
- **Change-email is a two-token dance, approval to the _old_ address first.** `POST /v1/auth/change-email` (`{ newEmail }`, authenticated) wraps `auth.api.changeEmail`. Nothing changes immediately: Better Auth emails an approval link to the **current** address (`user.changeEmail.sendChangeEmailConfirmation`); following it triggers a verification link to the **new** address (`emailVerification.sendVerificationEmail`); `POST /v1/auth/change-email/confirm` (`{ token }`) applies whichever step the token is for. So a live-session attacker still can't silently move where OTP codes land — the real owner gets an approval request they must act on. The `change-email` response is identical whether or not `newEmail` is already taken (Better Auth's behaviour; no account probing), and the copy is written to match ("If that address is available, …"). Token lifetime is `EMAIL_CHANGE_TOKEN_EXPIRY_MINUTES` (30), a shared constant.
- **`POST /v1/auth/change-email` writes an `EMAIL_CHANGE_REQUESTED` `auth_audit_log` row** — email, `user_id`, IP, user-agent — mirroring how the OTP handlers audit their events, so an incident review can see that a change was initiated from a live session, when, and from where. The confirm step is *not* separately audited: it's an unauthenticated link click, and capturing it would mean either decoding Better Auth's JWT token or hooking an untyped BA callback — coupling not worth it when the account's current email-on-record already shows the outcome and both confirmation emails are sent. (Raised as audit item E4; the "also audit the confirm step" half is left in `docs/enhance-suggestion.md`.)

**Alternatives considered:** Fire the new-device alert from a Fastify hook on the verify route instead of the BA database hook — rejected: the session row (with its `user_agent` and id) is exactly what the check needs, and the BA hook runs at the one point where "a session was just created" is unambiguous. A single-step change-email (verify the new address only) — rejected: that's the redirect vector — an attacker with a session sets `newEmail` to their own and clicks their own link; the old address never hears about it. Auditing the confirm step too (`EMAIL_CHANGE_CONFIRMED`) — deferred: `POST /v1/auth/change-email/confirm` has no user context (it's a token from an email link), so recording it means coupling to Better Auth's JWT token shape or an untyped `afterEmailVerification` callback; the request-side event plus the account's current email cover the incident-review need. Left in `docs/enhance-suggestion.md`. Awaiting the alert send so a failure surfaces — rejected: #14 is explicit that this traffic degrades to "arrives late", never "blocks login".

**How it solves the problem:** A compromise now has a tripwire (the login from an unknown device emails the owner) and the one silent-takeover path #21 opened — redirecting OTP delivery — requires an approval the attacker can't intercept, because it goes to the address they're trying to replace.

## 47. Tests: a Vitest integration suite that drives the real OTP flow, not forged sessions

**Problem:** `docs/definition-of-done.md` asks for tests proving the security-critical behaviour: you can't read another user's data, a customer session can't reach an admin route, duplicate disputes are rejected, invalid lifecycle transitions fail, OTP attempts are rate-limited. `codebase-index.md` still said "`pnpm test` succeeds trivially — no package defines a `test` script". The question was whether to unit-test handlers with mocked auth/DB, or run the stack for real.

**Decision:** Integration tests only, `api/test/**/*.test.ts` — `build()` (the same factory `app.ts` uses) + `app.inject()` against a **real Postgres and real Mailpit**. Sessions are obtained by driving the actual flow: `POST /otp` → read the code out of Mailpit's HTTP API → `POST /otp/verify` → use the returned cookie. No forged `better-auth.session_token`, no mocked `auth.api`. A shared `resetDatabase()` fixture truncates and re-seeds a small deterministic dataset per file; `fileParallelism: false` and a per-file forked process keep the shared DB sane. `vitest.config.ts` pins the env (test DB URL, raised rate limits, `NTFY_URL` pointed at a reachable host so the fire-and-forget notifier logs quietly instead of failing DNS). 33 tests across 8 files: transaction scoping, dispute scoping, admin authz, duplicate dispute, dispute lifecycle (including the `from_status` accuracy check from #45 / audit A2), admin invite, OTP rate limit, email change (the `EMAIL_CHANGE_REQUESTED` audit row and the approval-to-old-address behaviour). CI's `check` job gains `postgres` + `mailpit` service containers and a migrate step before `test`.

**Alternatives considered:** Unit tests with a mocked Better Auth and an in-memory/mocked repository — rejected: the behaviour under test *is* the integration (the owner filter is in the SQL #39, the one-open-dispute guard is a Postgres index #40, the transition guard is an `UPDATE … WHERE` #41, rate limiting is a Fastify plugin) — mocking any of it tests the mock. Forging a session cookie to skip the OTP round-trip per test — rejected: it wouldn't exercise the verify path or the audit writes, and the OTP flow is fast enough over Mailpit's API. `testcontainers` to spin Postgres per run — rejected: the dev stack's Postgres (and CI's service container) is already there; a second provisioning path is maintenance for no isolation gain given `fileParallelism: false`. A separate `docker compose` test profile — rejected: `vitest.config.ts` env + the existing stack covers it.

**How it solves the problem:** Each DoD security claim has a test that would actually fail if the mechanism regressed, because nothing between the HTTP request and Postgres is stubbed — and CI runs it against the same Postgres/Mailpit pairing the smoke test already proved.

## 48. Load-test number: measure once, document the fix rather than build it

**Problem:** `docs/definition-of-done.md` and `docs/scaling-and-resilience.md` both ask for one real load-test number (p95 / RPS) in the README — "a number beats a claim, for near-zero effort".

**Decision:** One `autocannon` run against `GET /v1/transactions?limit=20` (authenticated, paginated, index-backed, on the seeded ~4.3k-transaction dataset), on the dev stack, recorded in a README "Performance" section: ~230 req/s, p50 79 ms, p97.5 171 ms, p99 223 ms; throughput plateaus near 250 req/s as concurrency rises. The run also measured `GET /readyz` (a real DB round-trip, no session) on the same stack at ~3,700 req/s / p99 15 ms — so the ceiling on authenticated routes is **Better Auth's per-request session lookup**, not Postgres or Fastify. The mitigation (a short-TTL cache on the session read, or BA's cookie-cache / JWT session mode) is written into `docs/scaling-and-resilience.md` as a "document, don't build" item — it's a real lever with an architectural tradeoff (staleness vs. per-request DB work) that belongs in the scaling narrative, not a change to make blind against a dev-mode measurement.

**Alternatives considered:** Skip the `readyz` comparison and report only the headline number — rejected: the number alone invites "is that Postgres?" and the comparison answers it for free in the same run. Build the session cache now — rejected: dev mode (`tsx`, no compiled output, bind-mounted source) is the wrong baseline to tune against, and #35's whole thrust is not adding machinery ahead of a demonstrated need on the real target. k6 instead of autocannon — indifferent; autocannon is already a Node dev-dependency-free `pnpm dlx` away and the docs name both.

**How it solves the problem:** The DoD item is a measured number, not a claim, and the one interesting thing the measurement surfaced (the auth-lookup ceiling) is captured where a scaling question would look for it.

## 49. Backend audit pass: fix the bugs and the cross-module inconsistencies, defer the hardening

**Problem:** After the four backend modules landed, a read-through of everything changed on `pass-2-trims-and-modules` turned up ~20 findings — two real bugs, several "same concept, different idiom across modules", constants re-declared or borrowed from an unrelated one, and a batch of edge-case / hardening gaps. Left unsorted, that list is noise; shipped as-is, the inconsistencies are exactly what a reviewer notices.

**Decision:** Split by kind and fix only the first two kinds now.

- **Bugs — fixed.**
  - The new-device login alert email rendered `FRONTEND_URLS.SIGN_IN` (`/sign-in`) as a bare path — a dead link. The builder now takes an absolute `signInUrl` (`${env.FRONTEND_URL}${…}`), like every other outbound-link email.
  - The withdraw handler's audit row could record a stale `from_status` under a race with an admin `review` — fixed with the `SELECT … FOR UPDATE` inside the transaction (see #45).
- **Cross-module consistency — fixed.**
  - `isOpenDisputeStatus` / `isTerminalDisputeStatus` added to `shared/util.ts`; the customer withdraw path uses them instead of a per-file `const TERMINAL: readonly string[] = …` widening alias (`CLAUDE.md`: type logic lives in a centralized helper). The admin module keeps its explicit `=== SUBMITTED` / `!== UNDER_REVIEW` checks — for a two-transition state machine those read as the state machine, not a partition test.
  - `POST /v1/auth/change-email` now writes `EMAIL_CHANGE_REQUESTED` to `auth_audit_log`, matching the OTP handlers (see #46).
  - `web/.env`'s `VITE_APP_NAME` (a hand-copy of `shared`'s `APP_NAME`) deleted — nothing consumed it; the web app imports `APP_NAME` from `shared` when it's built.
- **Hardening / edge cases — deferred to `docs/enhance-suggestion.md`**, not fixed here: exact-string `user_agent` matching for new-device detection, the first-ever-login alert, the `console.error`-instead-of-`logger` calls in `lib/{auth,notifier,mailer}.ts`, silent best-effort send failures with no metric, the shared-limit on `change-email/confirm`, `API_URL`/`CORS_ORIGIN` env duplication, the two hardcoded `2000 ms` timeouts, `VARCHAR_LIMIT` mirroring the schema. Each is real; none blocks the submission, and several (fuzzy device matching, a rate-limit split) would need their own decision entry if built.

**Alternatives considered:** Fix everything in one pass — rejected: the hardening items are a Week-3+ concern, several need design choices (not just edits), and bundling them with the bug fixes would make the diff unreviewable. Document all of it and fix nothing now — rejected: A1 is a broken link in a security email and A2 is a lie in the audit log; those aren't "later". Only fix the bugs, leave the idiom drift — rejected: the "why is this checked three different ways" question is the one the user actually raised.

**How it solves the problem:** The two things that were wrong are right, the inconsistencies the reader would trip on are gone, and the remaining polish is in the one doc that already tracks "known, deferred, here's the plan" — visible, not hidden.

## 50. `GET /v1/auth/session` and `buildUrlWithParams`: the two seams the frontend needs from the backend

**Problem:** Building `web` means the client needs to know who's signed in — for route guards and for choosing the customer vs. admin UI — without either duplicating Better Auth's session shape client-side or hitting an arbitrary protected endpoint and inferring "logged in" from a 200/401. Separately, every route the client calls back into (`disputes/:disputeId/withdraw`, `admin/disputes/:disputeId/review`, `admin/invites/:token/accept`, …) has a `:param` the client has to substitute — and `shared`'s `API_PATHS` only had the literal pattern, not a way to fill it in, so each call site was one Nolan-authored string template away from drifting off the server's actual path shape.

**Decision:**

- **`GET /v1/auth/session`** (`authenticate` preHandler only — no role check) returns `authSessionSchema` (`id`, `name`, `email`, `role`, `email_verified`, `created_at`, `updated_at`) — the same fields `request.user` already carries, on the wire as `AuthSessionResponse`. A missing/expired session 401s with `redirectUrl` (unchanged shared envelope), which is exactly what `_authenticated`'s route guard branches on. Verified in `api/test/auth-session.test.ts`: no cookie → 401 + `redirectUrl`, a customer cookie → `role: CUSTOMER`, an admin cookie → `role: ADMIN`.
- **`buildUrlWithParams(pattern, params)`** in `shared/src/util.ts` — a small string-replace helper, but its `params` type is derived from the pattern itself via a template-literal-type `ExtractParams<T>`, so `buildUrlWithParams(API_PATHS.DISPUTE_WITHDRAW, { disputeId })` type-errors if the key is missing or misspelled, and a renamed `:param` in `API_PATHS` breaks every call site at compile time instead of silently 404ing at runtime. Kept in `shared` (not duplicated per-package) so client and server read the identical route pattern.

**Alternatives considered:** Have the client probe a protected endpoint (e.g. `GET /v1/transactions?limit=1`) and treat 401 as "signed out" — rejected: it works for "am I logged in" but not "what's my role", which the root `beforeLoad` needs on every navigation to pick the customer/admin layout; a real session endpoint is the one source of truth Better Auth's own session table already provides. Hand-templating each param URL at the call site (`` `${url}/${id}/withdraw` ``) — rejected: it's what the audit already flagged as drift-prone (#49), and does nothing to catch a renamed param at compile time. A generic runtime path-builder library — rejected per the no-speculative-abstraction rule; the whole need is satisfied by one small typed function.

**How it solves the problem:** The client has exactly the session data it needs, from the one place that's already authoritative about it, and every parametrized route the client calls is guaranteed by the type checker to match `shared`'s own path constants — not just visually consistent with them.

## 51. Frontend architecture: session-gated route tree, loaders for every fetch, one API client

**Problem:** `web` was still the placeholder route from pass 1 (`docs/codebase-index.md` — "no UI kit/shadcn, forms, query client, or auth client yet, deliberately bare"). Building the real UI meant deciding, before writing any page: how a route knows whether the visitor is signed in and which role's UI to show, how server data reaches a component (`CLAUDE.md`: loaders, never `useEffect`), how one API failure becomes one consistent user-facing message across every mutation, and how the ntfy dispute-status events (`docs/notifications.md`) reach the browser live.

**Decision:**

- **Two layout routes, one root guard.** `routes/__root.tsx`'s `beforeLoad` calls `GET /v1/auth/session` (#50) through `queryClient.ensureQueryData`, seeding `AuthSession | null` into router context — once, shared between the SSR render and the client-side query cache, not a per-page fetch. `routes/_unauthenticated.tsx` holds `sign-in`; `routes/_authenticated.tsx`'s `beforeLoad` redirects to sign-in if `user` is `null`, then splits by `user.role`: a customer under `/admin` is bounced to `/transactions`, an admin outside `/admin` is bounced to `/admin`, except for the shared `/account` prefix both roles can reach. The split is a `beforeLoad` redirect, not a conditional render, so an admin never even receives the customer bundle's data.
- **Every data read is a route `loader` + `queryClient.ensureQueryData`, keyed on `loaderDeps` (search params) so pagination/filtering re-fetches on navigation, not a `useEffect`** — e.g. `_authenticated/disputes/index.tsx`'s status filter and page number are in the URL search, validated by a zod `searchSchema`, and drive the loader's query key directly. This is the one convention `CLAUDE.md` already mandated; the decision here is just that it's followed with no exceptions, including the root session read.
- **One axios instance (`web/src/api/index.ts`), one error type.** `ApiError` normalizes every failure — the shared response envelope, a network drop, or anything else — into the same shape (`status`, `code`, `message`, `errors?`, `redirectUrl?`), so a component (or `useToastMutation`) never branches on axios's error shape versus the server's. The instance's `baseURL` switches on `typeof window === "undefined"`: server-side (inside a `createServerFn`, during SSR) it's `SERVER_API_URL` — the api container's Docker-network name — because `localhost` from inside the web container doesn't reach the api container; client-side it's `VITE_API_URL`, the browser-reachable address. `api/server.ts`'s `forwardCookie()` copies the inbound request's `Cookie` header onto that server-side axios call (via `getRequest()` from `@tanstack/react-start/server`) so an SSR session read authenticates as the visiting browser; client-side calls rely on `withCredentials` instead, since the browser attaches its own cookie.
- **`useToastMutation`** wraps every mutation in a single `sonner` `toast.promise` — loading / success / error all read the server's own `message` string, so a new mutation gets consistent toast behaviour for free instead of bespoke `try/catch` + toast wiring per component.
- **`useDisputeNotifications`** opens a browser `EventSource` against ntfy's per-user SSE topic (the same topic `lib/notifier.ts` already publishes to on `review`/`resolve`, `docs/notifications.md`) from the `_authenticated` layout, only for customers (an admin has no personal dispute topic). On a message it toasts a summary and invalidates the disputes query + the router, so the list re-fetches without a poll. Best-effort to match the backend's posture (#41's `notifier.ts`): a stream error just closes the connection, never surfaces as a page error.
- **UI kit is hand-picked shadcn-style primitives** (`components/ui/*` — `radix-ui` primitives + `class-variance-authority` for variants + `tailwind-merge`'s `cn()`), added one component at a time as a page needed it, not scaffolded via the shadcn CLI (no `components.json`) — so `components/ui/` only ever contains what's actually used.
- **Forms use `react-hook-form` + `@hookform/resolvers`'s `zodResolver` over the same zod schemas `shared` already exports** for the request bodies (e.g. `disputeCreateBodySchema` drives `dispute-form.tsx`) — client-side validation is the server's own schema, not a hand-duplicated shadow of it.

**Alternatives considered:** Fetch the session in a `useEffect` on the root component — rejected: it's exactly the pattern `CLAUDE.md` rules out, and it would show an unauthenticated flash before the effect resolves; the loader approach resolves it before first paint on both SSR and client navigation. Two separate API clients (one for server-only reads, one for the browser) — rejected: the `isServer` branch inside one axios instance is a few lines against maintaining two client configurations that would inevitably drift. Poll the disputes list on an interval instead of ntfy SSE — rejected: the backend already publishes the event (#41); polling would just re-derive on a delay what push delivers immediately, and ntfy already speaks SSE natively. Scaffold the full shadcn CLI component set up front — rejected per the no-speculative-abstraction rule; most of a full shadcn install would sit unused. A shared form-schema-to-form-fields generator — rejected: three or four forms don't justify a generator, and `zodResolver` already removes the actual duplication (the validation rules).

**How it solves the problem:** Every route knows who's signed in and which UI to render before it renders anything, every data fetch follows the one convention the codebase already committed to, one error type and one toast hook mean a new page's happy/unhappy paths look like every other page's, and the dispute-status notifications the backend already emits (#41) reach the browser live instead of needing a second look-up mechanism.

## 52. Post-mutation staleness: `invalidateQueries` doesn't refetch what a loader reads, so `refreshQuery()` removes the cache entry instead

**Problem:** A first manual pass through the built UI (sign in, open a dispute, sign in as admin, move it to review, resolve it) found every mutation broken the same way: the toast said success, the backend really had transitioned the row (confirmed by a full page reload), but the on-screen card never updated — `withdrawDispute`, `startDisputeReview`, and `resolveDisputeForReview` all left their component looking exactly as it did before the click. Each mutation's `onSuccess` already called `queryClient.invalidateQueries({ queryKey })` followed by `router.invalidate()` — the pattern TanStack's own docs show for "refetch after a mutation." It didn't work, and the failure was two independent bugs stacked on top of each other:

1. `invalidateQueries`'s default `refetchType: "active"` only refetches queries with a live `useQuery` observer. #51 committed every read to `ensureQueryData` inside a route `loader` instead — by design, nothing observes these queries the way a mounted `useQuery` would, so the default `invalidateQueries` call marks the entry stale and does nothing else.
2. Passing `refetchType: "all"` to force it anyway surfaced a second, worse problem: a query populated during SSR and hydrated onto the client has no `queryFn` attached client-side — functions don't survive dehydration, and nothing re-supplies one until a component or loader calls `ensureQueryData`/`useQuery` with that exact key again. Forcing a refetch on the *existing* query object threw `Error: Missing queryFn`, `invalidateQueries`'s own promise still resolved (per-query fetch errors don't propagate outward), and the query was left sitting in `state.status === "error"` — silently, with nothing in the console pointing at it. Then `router.invalidate()` reran the loader's `ensureQueryData` call, which (confirmed by reading `@tanstack/query-core`'s source directly) only ever checks whether `query.state.data === undefined` — it does not look at `isInvalidated` or `status` at all — so with the pre-mutation data still sitting in `state.data`, it just handed that back unchanged.

**Decision:** `web/src/lib/query.ts`'s `refreshQuery(queryClient, router, queryKeys)` calls `queryClient.removeQueries({ queryKey })` for each key — not `invalidateQueries` — then `router.invalidate()`. Removing the entry deletes the `Query` object outright, so the next `ensureQueryData` call the rerun loader makes sees an empty cache (`cachedData === undefined`) and does a genuine `fetchQuery` using the `queryFn` *that same call supplies* — sidestepping both the "no observer" and "no client-side queryFn" problems at once, because the fetch is driven by the loader's own fresh call, not a refetch attempt on the stale query object. Every mutation site (`dispute-actions.tsx`'s review/resolve, `withdraw-button.tsx`, `dispute-form.tsx`, `use-dispute-notifications.ts`'s ntfy handler) now goes through this one helper instead of the hand-rolled `invalidateQueries` + `router.invalidate()` pair. `withdraw-button.tsx` also had its own second bug found in the same pass: it invalidated `QUERY_KEYS.DISPUTES` (the list) but was rendered on the *detail* page, which reads `QUERY_KEYS.DISPUTE` — a different key entirely; `refreshQuery` is now called with both keys there.

**Alternatives considered:** `invalidateQueries({ refetchType: "all" })` plus manually re-supplying a `queryFn` via `queryClient.setQueryDefaults` or `setQueryData` before invalidating — rejected: it works, but the caller would need to know and re-declare the loader's own fetch logic at every mutation site, which is exactly the duplication `ensureQueryData`-in-a-loader was meant to avoid; `removeQueries` gets the same result by deleting the problem instead of routing around it. Attach a `useQuery` observer to every list somewhere (even a hidden one) so `refetchType: "active"`'s default would apply — rejected: it's a workaround that fights the loader-driven-fetch convention #51 already committed to, for the sole purpose of satisfying a cache-invalidation default. Skip `router.invalidate()` and read a plain `useQuery` for post-mutation UI instead of `Route.useLoaderData()` — rejected: it would mean re-deriving every page's data-fetching approach around one mutation-refresh edge case, abandoning the loader convention everywhere it might ever need a post-mutation refresh (i.e. everywhere with a mutation).

**How it solves the problem:** Verified live — withdraw, move-to-review, and resolve all update their row/badge/button state immediately after the toast, with no manual reload, across the customer disputes list, the dispute detail page, and the admin review queue.

## 53. Every dispute carries its own transaction's merchant, amount, and date

**Problem:** A second finding from the same manual pass: nothing in the built UI showed what was actually being disputed beyond a raw `transaction_id` UUID — not the customer's dispute list, not their dispute detail page, not the admin review queue. A customer looking at "Fraudulent Charge, Submitted" had no way to tell which of their transactions that referred to without leaving the page; a reviewer had even less to go on. Tracing it back, the gap went all the way to the database query: `disputeSchema` only ever declared `transaction_id`, and none of the dispute repository functions joined `transaction` at all.

**Decision:** `disputeSchema` gains a nested `transaction: { merchant_name, amount_cents, transacted_at }` (`disputeTransactionSchema`), present on every dispute response since `adminDisputeSchema` extends `disputeSchema`. On the read side, `findDisputesByUser`, `findUserDisputeById`, `findDisputesForReview`, and `findDisputeById` (`api/src/database/repository/dispute.ts`) all `innerJoin` `TransactionModel` and select a nested `transaction: TRANSACTION_SUMMARY_COLUMNS` object directly in the query — Drizzle reconstructs the nested shape from the joined columns, so no manual reshaping. The join is `inner`, not `left`, because `dispute.transaction_id` is `NOT NULL` — no dispute row is ever dropped. On the write side (`createDispute`, `withdrawDispute`, `markDisputeUnderReview`, `resolveDispute`), an `UPDATE`/`INSERT ... RETURNING` can't join, so no query changed there; instead, every one of the four service-layer handlers that calls them (`submitDispute`, `withdrawDispute`, `startDisputeReview`, `resolveDisputeForReview`) already reads the dispute (or its transaction) once *before* the write — to check ownership, current status, or existence — so the transaction summary from that existing read is merged onto the mutation's returned row (`{ ...row, transaction: dispute.transaction }`) before it's sent to `toWire`. Zero extra queries anywhere. Rendered on the customer disputes list (a merchant + amount column), the customer dispute detail page (a "Transaction disputed" card linking to `/transactions/:id`), and the admin review queue.

**Alternatives considered:** A second round-trip from the client (fetch the transaction separately once the dispute list/detail loads) — rejected: it's an extra request per page for data the server already has in hand from one join, and it would mean every dispute-rendering surface re-implementing the same "also fetch the transaction" step. Re-querying the transaction inside the four write-path repository functions after the `UPDATE`/`INSERT` — rejected: every one of those four calls already has the transaction available from a pre-existing read one line up in the service layer; adding a second query to the repository layer would just be re-fetching the same row the caller can already pass in. Making `transaction` optional on the schema to avoid touching the write paths at all — rejected: an optional field the client can't actually rely on defeats the point, and the merge-from-the-prior-read approach costs nothing extra to make it unconditional.

**How it solves the problem:** A customer or reviewer sees the merchant, amount, and date of the disputed charge everywhere a dispute appears, sourced from the one join that already exists on the read path or the one read that already exists on every write path — no new query anywhere.

## 54. Admin review queue: a compact table + modal instead of one always-expanded card per dispute

**Problem:** The admin review queue rendered one full-height `Card` per dispute — reason, status, customer id, transaction line, full description, and (for open disputes) an always-visible resolve form — regardless of whether the reviewer was looking at it. On a queue of any real size this was mostly wasted vertical space for information a reviewer only needs when they're about to act on that specific dispute, and it read as heavier than the customer-facing list right next to it in the same app.

**Decision:** The review queue is now a `Table` — the same row shape as the customer disputes list (opened date, transaction, reason, status) plus a trailing action column — with the description, customer id, decision note, and the review/resolve controls moved into a `Dialog` (`components/ui/dialog.tsx`, a hand-picked radix `Dialog` wrapper matching the existing `components/ui/*` style, #51) opened by a "Review" (open disputes) or "View" (closed disputes) button per row. `DisputeActions` now renders the trigger button and, only while the dialog is open, the dialog's content — so the resolve form and its `react-hook-form` state don't mount for rows nobody has clicked into. A successful review or resolve inside the modal calls `refreshQuery` (#52) then closes the dialog itself, so the table row updates in the background right where the user can see it land.

**Alternatives considered:** Keep the cards but collapse the description/form behind a disclosure `<details>`/accordion in place — rejected: it still leaves one DOM block per dispute at the queue's natural height, just visually folded, where a table row is actually shorter; a modal also gives the review action a clear, singular focus instead of one open accordion competing with others on the page. A drawer/side-panel instead of a centered modal — indifferent as a pattern, not adopted here only because the existing `components/ui/*` had no drawer primitive to hand-pick and a centered `Dialog` was the smaller addition.

**How it solves the problem:** The queue reads as a scannable list, matching the customer-facing table's density, and the detail + action surface only exists on screen for the one dispute a reviewer is actually looking at.

## 55. Tests target their own database, never the dev stack's

**Problem:** `api/vitest.config.ts` had `DATABASE_URL` fall back to a local constant that pointed at `localhost:5432/transaction-dispute` — the same host/port/database name the `docker compose` dev stack publishes and seeds. Running the suite outside `docker compose` (`pnpm test`, `turbo run test`) targeted that same database: each test file's setup/teardown truncated and re-seeded it with a handful of minimal fixtures, silently wiping the realistic demo data (~31 users, ~4.6k transactions, ~265 disputes) the moment anyone ran tests locally rather than inside the container network (where the api service resolves `transaction-dispute-portal-database`, a different host, so the collision never showed up there).

**Decision:** `api/test/env.ts` now exports `testDatabaseUrl`, defaulting to a distinct database name (`transaction-dispute-test`) on the same local Postgres — collision-proof even when both are reached via `localhost`. Because that database doesn't exist until something creates it, `api/src/database/migrate.ts` was split into an exported `runMigrations(connectionString)` plus a CLI-only block guarded by an `isMain` check (`process.argv[1] === fileURLToPath(import.meta.url)`), so the same migration logic the `migrate` script uses can also be called programmatically. A new Vitest `globalSetup` (`api/test/global-setup.ts`) runs once before any test file: it connects to Postgres's own `postgres` maintenance database, creates the target database via `CREATE DATABASE` if `pg_database` doesn't already list it, then calls `runMigrations` against it — safe to run every time since Drizzle tracks what's already applied.

**Alternatives considered:** Point the local fallback at the dev stack's actual Docker-network hostname — rejected: that hostname only resolves inside the compose network; outside it (the exact case this bug lived in) it would just fail to connect instead of fixing anything. Require `DATABASE_URL` to always be set explicitly for local test runs (no fallback at all) — rejected: it would work, but re-introduces a manual setup step for the "just run the tests" path the fallback exists to avoid, and does nothing to stop the next person from pointing it at the dev database by habit. Document "don't run tests outside docker" — rejected: unenforceable, and the actual fix costs nothing once the database name itself can't collide.

**How it solves the problem:** Verified directly — a fresh `pnpm test` run auto-creates and migrates `transaction-dispute-test`, all 36 api tests pass against it, and the dev database's seed counts are identical before and after (31/4,306/265), on both the existing checkout and a completely fresh `git clone`.
