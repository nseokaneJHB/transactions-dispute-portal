# Definition of done & suggested pace

## Definition of done

- [ ] View / dispute / historic-view all work end-to-end (API + `web` UI both built; not yet manually verified end-to-end in a browser)
- [x] Dispute lifecycle enforced server-side, not just in the UI (`docs/decisions.md` #41/#45 — `dispute-lifecycle.test.ts`)
- [x] Auth scoping has a test proving you can't read another user's data (`transaction-scoping.test.ts` / `dispute-scoping.test.ts`, `docs/decisions.md` #47)
- [x] `POST /v1/admin/disputes/:id/resolve` is unreachable via a customer session, and reachable only with the `admin` role (`admin-authz.test.ts`, `docs/decisions.md` #16/#47)
- [x] Duplicate-dispute submission (retry/double-click) is rejected, not double-inserted (`docs/decisions.md` #40 — `duplicate-dispute.test.ts`)
- [x] Seed data is realistic and voluminous enough to justify the pagination/indexing story (~31 users, ~4.6k transactions, ~260 disputes)
- [x] `/healthz` and `/readyz` exist — k8s manifests + probe wiring are documented in `docs/production-runbook.md` §7, not built (`docs/decisions.md` #42)
- [x] One load-test number (p95 latency/RPS) is in the README — `autocannon` against `GET /v1/transactions`, dev stack, ~230 req/s / p97.5 171 ms; auth session-lookup identified as the ceiling
- [x] `docker compose up -d` on a clean checkout gives a working local stack incl. DB, migrations applied, zero setup — `.env` files committed with working local values (`docs/decisions.md` #34/#42). No standalone `docker build`/`run` — production containerisation is `docs/production-runbook.md` §1, not built.
- [ ] README build/run/test steps verified on a clean machine
- [ ] CI green on default branch
- [ ] Repo is public

## Suggested pace

- Week 1 — data model, auth, API skeleton, seed data
- Week 2 — dispute business logic + tests
- Week 3 — front end (responsive, build tooling, browser-compat pass) + integration
- Week 4 — Docker, CI, README, `k8s/` manifests, dry run of the submission checklist
