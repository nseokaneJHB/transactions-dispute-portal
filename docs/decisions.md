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

## 15. Local dev env files: committed with fresh secrets, not real ones

**Problem:** `docker-compose up` should work out of the box on a clean checkout (`docs/definition-of-done.md`), which means the local dev env files need to exist and be committed. But committing real, working credentials — a Gmail App Password and a Google OAuth client secret tied to Nolan's real accounts — was on the table as a shortcut.

**Decision:** Commit `api/.env`, `web/.env`, `env/development/.env.database` — but with freshly generated values (`BETTER_AUTH_SECRET`/`COOKIE_SECRET`/`INTERNAL_API_TOKEN`/Postgres password), never real ones, and SMTP pointed at a new local-only Mailpit service (`compose.yml`) instead of real Gmail. `.gitignore` gets an explicit allowlist exception for exactly these three paths, with a comment stating why they're safe (see the file itself).

**Alternative considered:** Commit real, working `.env.api`/`.env.web`/`.env.database` values, as literally requested. Rejected outright — a real Gmail App Password and Google OAuth client secret committed here would publish live access to Nolan's actual Gmail account and Google Cloud project on a public GitHub repo, permanently (git history retains it even after a later deletion). Also moot: decision 1 already rejected Google OAuth for this project, so those specific values wouldn't even be used.

**How it solves the problem:** Gets the real goal — clone-and-`docker-compose up` with zero manual setup — without the part of the request that would have leaked live credentials. Mailpit is a strict upgrade over reusing real Gmail for this purpose too: the account-recovery emails from decision 14 become viewable by anyone who clones the repo (`localhost:8025`), with no real email account, Nolan's or otherwise, required at all.

_Superseded by decision 20:_ the "commit real, working values for zero setup" premise is reversed — every secret-shaped value in these three files is now blank, real values live in a gitignored `.env.local` per file, and `docker-compose up` needs a documented manual step first. The never-commit-real-secrets and Mailpit-over-real-Gmail parts of this decision still stand. See #20.

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

_Superseded by decision 20:_ the `.env.local` override mechanism this decision introduced (for SMTP specifically) is generalized to every secret-shaped value, and decision 15's "commit working values for zero setup" premise is reversed. See #20.

## 20. Committed env files hold blanked secrets, not working values — `.env.local` (no template) required per package

**Problem:** Decision 15 committed `api/.env`/`web/.env`/`env/development/.env.database` with real, working values — freshly generated, never real ones — specifically so a clean clone runs zero-setup. Revisited: even a freshly-generated, external-account-free secret (`BETTER_AUTH_SECRET`, `POSTGRES_PASSWORD`) is still a real committed secret sitting in git history, and the preference now is that literally no secret — however low-stakes — is ever a real, working value in a committed file, full stop, not just the ones tied to an external account (which decision 19 already handled for SMTP alone).

**Decision:** Every secret-shaped value in a committed env file is blank: `api/.env` blanks `DATABASE_URL`, `BETTER_AUTH_SECRET`, `COOKIE_SECRET`; `env/development/.env.database` blanks `POSTGRES_PASSWORD`. Non-secret operational config (`PORT`, `NODE_ENV`, `CORS_ORIGIN`, rate-limit numbers, `SMTP_HOST`/`PORT` pointed at the no-auth Mailpit catcher) stays real, since blanking those buys no security and only breaks the app for no reason. Real values live in a gitignored `.env.local` per package (`api/.env.local`, `env/development/.env.local.database`) — `compose.yml` loads each as a second, `required: false` `env_file` entry that overrides the committed file's (blank) value when present. Deliberately no committed `.example`/template file for these — the committed `.env` file already shows the exact key names; README.md's "Local setup" section is the instructions, not a second file to keep in sync.

**Alternative considered:** Keep decision 15's model (real generated values committed, zero setup) and only carve out `.env.local` for genuinely external credentials (SMTP), as decision 19 originally scoped it. This is what was actually asked for and answered "keep zero-setup" one exchange earlier in this same session — revisited immediately after by explicit instruction, so recorded here as a real reversal, not a refinement: "no live secrets in git, however low-stakes" was judged worth losing the zero-`docker-compose up` convenience for.

**How it solves the problem:** No secret of any kind, real-account-tied or not, is ever committed — at the direct cost of the `docker-compose up gives a working local stack` Definition-of-Done item now requiring a documented manual step first (README.md). `docs/definition-of-done.md` updated to reflect this.

_Note while implementing:_ the pre-existing committed `DATABASE_URL` (`postgresql://postgres:secret@localhost:5432/...`) was already wrong on two counts, caught while rewriting this file — its password (`secret`) never matched `env/development/.env.database`'s actual generated `POSTGRES_PASSWORD`, and `localhost` isn't reachable as the DB host from inside the `api` container on the compose bridge network (the service name, `transaction-dispute-portal-database`, is). Moot now that the value is blank, but the correct shape is documented in `api/.env`'s comment so `.env.local` gets it right.

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

## 25. Deploy: staging (auto) / production (gated) via GitHub Environments; drop `docker/metadata-action`

**Problem:** Two issues, one found by actually running the pipeline rather than by reading it. First, the bug: decision 24's single `publish` job failed on its first real run — the `Docker metadata` step errored. Root cause: `docker/metadata-action`'s `context: git` option introspects the local git checkout for branch/tag info, but the job checks out a single commit by raw SHA (`actions/checkout@v4`'s default shallow, single-ref clone), which leaves the repo in a detached-HEAD state with no branch and no history for `context: git` to read — a known failure mode for that combination, not something visible from the YAML alone. Second, a real requirement: every environment should auto-deploy except production, which needs a human to explicitly approve before an image goes out under `latest`/a release tag.

**Decision:** `deploy.yml`'s single `publish` job becomes two: `staging` (`environment: staging`, no protection rules — deploys automatically whenever `build.yml` succeeds on `main`, tags `staging`/`sha-<commit>`) and `production` (`environment: production`, `v*` tag push — same automatic *trigger* as staging, but GitHub pauses the job at the environment boundary until an authorized reviewer approves it in the Actions UI, tags `latest`/the tag name). The required-reviewer rule is configured once, by hand, in repo Settings → Environments → `production` → Required reviewers — GitHub Environment protection rules aren't expressible inside the workflow YAML itself, so this is a real one-time manual setup step, documented in `README.md`'s "CI/CD" section rather than silently assumed. Separately, `docker/metadata-action` is dropped entirely — tags are now built explicitly from known event context (`github.event.workflow_run.head_sha`, `github.ref_name`) instead of inferred via git/workflow-context auto-detection, removing the whole class of failure the bug came from, not just this instance of it.

**Alternative considered:** Keep `context: git` and fix it narrowly — e.g. add `fetch-depth: 0` and check out a real branch ref instead of a bare SHA, so `docker/metadata-action` has enough git history/context to introspect. Rejected: still leaves tag construction depending on `docker/metadata-action` correctly inferring intent (`is_default_branch`, `type=semver` matching) from ambiguous `workflow_run` context, which is exactly the kind of implicit behavior that failed silently until an actual run caught it. Explicit tags built from context we already know for certain (which job, which event) is less "clever" but has no equivalent failure mode to catch later.

**How it solves the problem:** Matches the actual requirement — automatic where nothing should block deployment, a real human approval gate exactly where one was asked for — using GitHub's built-in Environment protection mechanism rather than a bespoke `workflow_dispatch`-and-hope approval step. The `docker/metadata-action` removal converts a bug found in production (well, in the one CI run that counts) into a permanently smaller failure surface, verified by that fix landing before the next push.

## 26. `deploy.yml` calls `build.yml` via `workflow_call`, not `workflow_run`

**Problem:** With `workflow_run` (decisions 24/25), `build.yml` and `deploy.yml` were two independently-triggered workflow runs, only loosely linked by GitHub inferring the relationship from the trigger — they showed up as two separate entries in the Actions tab with no connected job graph between them. That's a worse "map" of the pipeline than the JD's CICD line calls for: you can't see build → staging → production as one flow at a glance, you have to click into `build.yml`'s run, note it succeeded, then separately find the `deploy.yml` run it triggered.

**Decision:** `deploy.yml` now triggers directly on `push: branches: [main]` / `tags: [v*]` (same conditions as before) and its first job, `build`, invokes `build.yml` via `uses: ./.github/workflows/build.yml` (`workflow_call`) instead of relying on a separate `workflow_run`-triggered run. `build.yml` gained a bare `workflow_call:` trigger alongside its existing `pull_request:`/`push:` triggers, and its `push:` trigger changed from `branches: [main]` to `branches-ignore: [main]` so it no longer double-runs on `main` (once standalone via `push`, once via the reusable call) — `main` pushes now reach `build.yml` exclusively through `deploy.yml`'s `uses:`. `staging`/`production` both gained `needs: build`, so GitHub renders one connected run graph — build's jobs, then staging, then production — instead of two separate Actions-tab entries. `staging`'s `if:` condition changed from checking `github.event_name == 'workflow_run'` to `github.ref == 'refs/heads/main'` (the event is just `push` now, not `workflow_run`, so the old check no longer applies), and both jobs' checkout/tagging steps switched from `github.event.workflow_run.head_sha` to the ordinary `github.sha`, since there's no longer a separate triggering event to read the commit from.

**Alternative considered:** Keep `workflow_run` and just accept two Actions-tab entries — rejected, it's the exact thing the JD-facing "map of the pipeline" ask needed fixed, and GitHub's own reusable-workflow feature exists specifically to solve this. Also considered restructuring into fully separate per-app (`api`/`web`) build→test→staging→production job chains for maximal visual granularity — deferred: `needs:` in a caller workflow can only depend on the reusable call as a whole (confirmed against GitHub's reusable-workflows docs), not on an individual job inside it, so true independent per-app lanes converging only at the production gate would need everything collapsed into one workflow file rather than the `build.yml`/`deploy.yml` split. Left as a possible future iteration rather than done speculatively.

**How it solves the problem:** `build` and `deploy` now render as one connected job graph in a single Actions run — build's jobs feed directly into `staging` then `production` — without changing any of the actual build/test/publish logic decisions 24/25 already established.

<!-- Open / unresolved — add an entry above once decided: -->
