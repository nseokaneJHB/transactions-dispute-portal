# Definition of done & suggested pace

## Definition of done

- [ ] View / dispute / historic-view all work end-to-end (API done; needs the `web` UI)
- [x] Dispute lifecycle enforced server-side, not just in the UI (`docs/decisions.md` #41 — verified E2E, not yet Vitest-covered)
- [ ] Auth scoping has a test proving you can't read another user's data (behaviour built + verified E2E; the Vitest case is still owed)
- [ ] `POST /v1/admin/disputes/:id/resolve` is unreachable via a customer session, and reachable only with the `admin` role (behaviour built + verified E2E; the Vitest case is still owed — `docs/decisions.md` #16)
- [x] Duplicate-dispute submission (retry/double-click) is rejected, not double-inserted (`docs/decisions.md` #40 — verified with 5 parallel submits; Vitest case still owed)
- [x] Seed data is realistic and voluminous enough to justify the pagination/indexing story (~31 users, ~4.6k transactions, ~260 disputes)
- [x] `/healthz` and `/readyz` exist — k8s manifests + probe wiring are documented in `docs/production-runbook.md` §7, not built (`docs/decisions.md` #42)
- [ ] One load-test number (p95 latency/RPS) is in the README
- [x] `docker compose up -d` on a clean checkout gives a working local stack incl. DB, migrations applied, zero setup — `.env` files committed with working local values (`docs/decisions.md` #34/#42). No standalone `docker build`/`run` — production containerisation is `docs/production-runbook.md` §1, not built.
- [ ] README build/run/test steps verified on a clean machine
- [ ] CI green on default branch
- [ ] Repo is public

## Suggested pace

- Week 1 — data model, auth, API skeleton, seed data
- Week 2 — dispute business logic + tests
- Week 3 — front end (responsive, build tooling, browser-compat pass) + integration
- Week 4 — Docker, CI, README, `k8s/` manifests, dry run of the submission checklist
