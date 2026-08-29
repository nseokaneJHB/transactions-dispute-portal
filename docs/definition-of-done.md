# Definition of done & suggested pace

## Definition of done

- [ ] View / dispute / historic-view all work end-to-end
- [ ] Dispute lifecycle enforced server-side, not just in the UI
- [ ] Auth scoping has a test proving you can't read another user's data
- [ ] `POST /v1/admin/disputes/:id/resolve` is unreachable via a customer session, and reachable only with the `admin` role (test proves both — `docs/decisions.md` #16)
- [ ] Duplicate-dispute submission (retry/double-click) is rejected, not double-inserted
- [ ] Seed data is realistic and voluminous enough to justify the pagination/indexing story
- [ ] `/healthz` and `/readyz` exist and are wired into the k8s manifest's probes
- [ ] One load-test number (p95 latency/RPS) is in the README
- [ ] `docker build` + `docker run` work from a clean checkout
- [ ] `docker compose up` on a clean checkout gives a working local stack incl. DB, zero setup — `.env` files are committed with working local values (`docs/decisions.md` #34)
- [ ] README build/run/test steps verified on a clean machine
- [ ] CI green on default branch
- [ ] Repo is public

## Suggested pace

- Week 1 — data model, auth, API skeleton, seed data
- Week 2 — dispute business logic + tests
- Week 3 — front end (responsive, build tooling, browser-compat pass) + integration
- Week 4 — Docker, CI, README, `k8s/` manifests, dry run of the submission checklist
