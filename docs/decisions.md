# Decisions

A running log of non-obvious engineering decisions: the problem each one solves, what we did, the alternative(s) actually considered, and why the chosen approach solves the problem better _for this project_ — not just "which is better in general." Alternatives aren't strawmen; some are genuinely better in a different context, and that context is called out.

This is the doc to open before an interview question that starts with "why did you..." — and the doc to add to the moment a real design decision gets made during implementation, not retrofitted afterward. Numbered in the order decided, oldest first.

---

## 1. Auth: email+password, not Google OAuth or passwordless email-OTP

**Problem:** Customers need to authenticate, and however that's done becomes the single thing every other feature depends on for the one review event that matters (no live back-and-forth with the panel).

**Decision:** Plain Better Auth email+password. Passwords are hashed (scrypt, salted) by the library — never stored or logged in plaintext.

**Alternatives considered:**

- _Google OAuth_ — genuinely simpler in one narrow sense (no password hashes to store), but it relocates the sensitive-data problem rather than removing it: `GOOGLE_CLIENT_SECRET` custody, correct OAuth CSRF/PKCE handling, ID-token verification. It also adds a hard external dependency on Google's uptime and consent-screen rules for the one login flow the entire submission depends on — an unverified OAuth app shows warning screens to non-whitelisted accounts, a real risk when the reviewer's Google account was never added as a test user. Would be the right call for a project where social login is an actual requirement or where avoiding _any_ credential storage is a hard constraint (e.g. a strict compliance boundary) — neither applies here.
- _Passwordless email-OTP_ (the `ubuntu-stories` pattern) — removes password storage too, but needs a real delivery channel (email/SMS) for the OTP code, which either means real Gmail SMTP (a Google dependency again) or an insecure stand-in. See decision 3.

**How it solves the problem:** Self-contained — no external identity provider, no delivery channel to build or depend on, works entirely inside `docker-compose up`. The security story is concrete and yours to defend: adaptive hashing, rate-limited auth endpoints (`@fastify/rate-limit`, decision 4), secure `httpOnly`/`SameSite` session cookies stored in Postgres (also what makes the API stateless, decision 8).

## 2. Dispute resolution: an internal-only route, not a customer-facing endpoint

**Problem:** The brief has no reviewer/admin portal, but the dispute-status-change event (and its notification, decision 3) needs _something_ to trigger it.

**Decision:** `POST /internal/disputes/:id/resolve`, gated by a separate shared-secret header (`x-internal-token`), deliberately outside the customer Better Auth session model. See `docs/api.md`.

**Alternative considered:** Let the customer's own session call a "resolve" endpoint on their own dispute. Simpler — one auth model, no second credential — but a customer resolving their own dispute is backwards for the domain (a panel reading dispute-resolution workflows would catch it immediately), and it's a real hole in the authz story we're otherwise careful about.

**How it solves the problem:** Keeps two auth paths honestly separate instead of pretending a demo shortcut is customer behavior, and doubles as a second, deliberately-scoped auth mechanism to talk about — curl-able live in an interview, no shelling into the codebase needed.

## 3. Notifications: self-hosted ntfy, not real email/SMS or a bare console.log

**Problem:** The brief only requires a _simulated_ notification on dispute status change — but "simulated" as a `console.log` is the least convincing possible demo of the event-driven architecture line in the JD.

**Decision:** Publish to a self-hosted [ntfy](https://github.com/binwiederhier/ntfy) topic (per-user, not shared) on status change. See `docs/notifications.md` for the full writeup and its explicit scope boundary.

**Alternatives considered:**

- _Real email/SMS (e.g. Gmail SMTP)_ — the most "real" option, but reintroduces the Google dependency decision 1 deliberately avoided, needs real credentials, and risks landing in spam or failing during review. Would be the right call if the brief actually required real delivery — it doesn't.
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

## 7. `shared` compiles to `dist/`, unlike `ubuntu-stories`' pattern

**Problem:** The `api` package ships a compiled `dist/app.js` run by plain `node` in production (decision 9) — but `shared`'s `package.json` originally pointed `exports` straight at `.ts` source, copying `ubuntu-stories`' pattern.

**Decision:** `shared` gets a real `tsc` build step; `exports` points at `dist/index.js`/`dist/index.d.ts`. `turbo.json`'s `typecheck` task depends on `^build` (not `^typecheck`) so `shared`'s `dist` exists before dependents typecheck.

**Alternative considered:** Keep `shared` pointing at `.ts` source, like `ubuntu-stories`. Works fine there because `ubuntu-stories` has no production Dockerfile — everything runs via `tsx`/`vite`, both of which resolve `.ts` imports directly. This repo's `api` production image runs plain `node dist/app.js`, which can't resolve a `.ts` import target — the pattern would build in dev and break in the exact image meant to prove "production-grade."

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

## 12. Login credential integrity: rate limiting + breach-check, not CAPTCHA

**Problem:** Password hashing (decision 1) proves someone knew the secret paired with an account — it doesn't prove that secret wasn't guessed, brute-forced, or reused from a breach elsewhere. See `docs/auth.md` for the full writeup.

**Decision:** Per-account rate limiting with progressive backoff on login, minimum password strength, and a HaveIBeenPwned Pwned-Passwords check (k-anonymity mode — the password itself is never sent) at signup/password-change, failing open on API unavailability.

**Alternative considered:** A hosted CAPTCHA (hCaptcha/Turnstile/reCAPTCHA) in front of the login form. Same reasoning that ruled out Google OAuth (decision 1): an external dependency sitting in front of the one flow the reviewer has to use, for the one review event with no do-over. Would be the right call for a public-internet production deployment actually facing bot traffic at scale — not for a reviewed take-home.

**How it solves the problem:** Covers the realistic attack surface (credential stuffing via reused/leaked passwords, brute force) with checks that degrade gracefully instead of introducing a new hard dependency on the login path.

## 13. Signup email verification: documented, not built

**Problem:** Classic email verification needs a real outbound email channel — which is the Gmail SMTP dependency decision 1 dropped specifically to avoid a Google dependency.

**Decision:** State the production answer (transactional email provider, e.g. Postmark/Resend/SES — not Gmail SMTP) in `docs/auth.md`; don't build it for this submission.

**Alternative considered:** Build it anyway, e.g. via a self-hosted dev-only mail catcher (MailHog/Mailpit). Rejected because it wouldn't actually deliver to the reviewer's real inbox — only captures mail locally — and the demo path doesn't exercise self-registration anyway: the reviewer signs into seeded accounts with real transaction history, since a freshly self-registered account has nothing to dispute (`docs/domain-model.md`'s seed data plan).

**How it solves the problem:** Avoids reopening the exact external-dependency tradeoff decision 1 already resolved, for a flow (self-registration) the reviewed demo path doesn't use.

<!-- Open / unresolved — add an entry above once decided:
- DB engine: Postgres vs MySQL (see CLAUDE.md maintainer note — no functional difference for this brief, pick one and move on)
-->
