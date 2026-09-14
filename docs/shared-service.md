# Shared package

`shared` is the third workspace package (`api`/`web`/`shared`): the types and zod schemas both apps consume, so a request/response shape is defined once. See `docs/codebase-index.md`'s `## shared` section for the per-file map (`constant.ts`, `util.ts`, `schema/*.ts`, `type/*.ts`).

## What lives here

- **Constants** — the response-envelope machinery (`HTTP_CODE`, pagination defaults), the domain/auth enums (`USER_ROLE`, `DISPUTE_STATUS`, `DISPUTE_REASON`, `AUTH_EVENT`, …), the per-endpoint `sort` whitelists, and the route wiring (`API_URLS`, `API_PATHS`) — one source for both `api`'s route mounting and `web`'s API client.
- **Zod schemas** — every request body, query, and response envelope (`disputeCreateBodySchema`, `paginationQuerySchema`, `globalResponseSchema`, etc.). `api` uses these as Fastify validators/serializers; `web` uses the same schemas for `react-hook-form` validation and to type its API client's responses.
- **Types** — `z.infer` re-exports of the above, plus small framework-free helpers (`isOpenDisputeStatus`, `buildUrlWithParams`) shared by both sides.

## Why a separate package, not duplicated types

Hand-maintained matching types in `api` and `web` drift the moment one side changes a field and the other doesn't notice — until a runtime mismatch. A shared package turns that into a compile-time error: change a schema in `shared`, both dependents fail `typecheck` until updated. It also keeps the validation logic itself identical, not just the shape — the same zod refinement that rejects a bad `from`/`to` range on the server is what the client form uses too.

This isn't a generic internal-package pattern applied preemptively — it exists because there are concretely two callers (`api` and `web`) needing the same wire contract, the bar this repo's "no speculative abstraction" convention sets (`CLAUDE.md`).

## The one real operational consequence

`shared` ships compiled output (`dist/index.js`/`dist/index.d.ts`), not source — `api`'s production image runs compiled `dist/app.js` under plain `node`, which can't resolve a `.ts` import target, so `shared` has to be built and consumed as a real package dependency, not a source-level path alias.

That's a runtime-image consequence, not just a build-step one: `shared/dist` evaluates `zod` at module-load time, and both `api` and `web` import `shared`, so a production image must ship `shared/node_modules` alongside its own — copying only `api/node_modules` (or `web/node_modules`) into the runtime stage isn't enough. See `docs/production-runbook.md` §1 for the multi-stage build shape this implies.
