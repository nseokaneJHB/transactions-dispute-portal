---
marp: true
paginate: true
title: Transactions Dispute Portal — Engineering Exchange
---

# Transactions Dispute Portal

### Capitec Payments Engineering Exchange

TanStack · Drizzle · HTTP/2 · Zod contracts · npm supply chain
plus: the SE II panel's pagination concern, and Next.js vs this stack

Every demo runs from this repo: `docker compose up -d`, then `pnpm db:seed`.

---

## Agenda

1. The panel's concern: lists at millions of rows — and the evidence
2. TanStack: what actually goes over the wire
3. Drizzle: a query builder, and how to see its SQL
4. HTTP/2 vs HTTP/1.1
5. Input validation and the API contract (Zod)
6. npm vulnerabilities and the supply chain
7. Bonus: Next.js vs this stack
8. Questions to be ready for

---

## The stack in one picture

```
Browser ──► web  (TanStack Start: SSR + loaders + server functions)   :3000
   │           │  axios, session cookie forwarded
   │           ▼
   └──────► api  (Fastify + Zod + Drizzle)                              :8080
               │
               ▼
            Postgres 18          Mailpit (OTP email)   ntfy (status push)
```

`shared` holds the Zod schemas, types and constants both sides import.

---

<!-- _class: lead -->

# 1. The panel's concern

"The paginated list queries will be slow at millions of rows."

---

## They were right — measured

Same dataset: **2.2M transactions, 1.05M disputes**, one customer with 200k transactions. Postgres 18, median of 5.

| Request | Before | After index refactor | Now |
|---|---|---|---|
| Admin queue, first page (page + count) | 448 ms | 7.4 ms | **1.9 ms** |
| Admin queue, row 500,000 | 1,780 ms | 3,278 ms | **2.6 ms** |
| Admin queue sorted by amount | 893 ms | 977 ms | **1.6 ms** |
| Admin search, first page (page + count) | 1,297 ms | 764 ms | **5.9 ms** |
| Heavy customer's disputes, row 40,000 | 178 ms | 191 ms | **0.6 ms** |

Full tables, method and rerunnable scripts: `docs/list-query-performance.md`.

---

## What changed, in three steps

1. **Index only what a query uses** (#68): 48 → 29 indexes. Dropped `updated_at` indexes on every table and three duplicate unique constraints; added one index per list that matches its sort order exactly.
2. **Cursor (keyset) paging, no count** (#69): `WHERE (sort key, id) > (cursor) ORDER BY … LIMIT 11` — an index seek instead of reading and discarding `OFFSET` rows. No "page 437 of N"; First / Prev / Next / Last.
3. **Sort indexes chosen by `EXPLAIN`** (#70): 9 candidates on the 2.2M-row copy, 5 kept — the ones the planner actually used.

---

## The cursor, concretely

```
GET /v1/admin/disputes?limit=10&sort=amount_cents&order=desc
→ { data: [...], next_cursor: "next~amount_cents~desc~201092~01a1eb4d-…", prev_cursor: null }

GET /v1/admin/disputes?limit=10&sort=amount_cents&order=desc&cursor=next~amount_cents~desc~201092~01a1eb4d-…
```

- Works on **every** sort; `id` breaks ties so every row has one position.
- `cursor=last` reads from the far end: the true last page in ~2 ms.
- A cursor from another sort, list, or edited by hand → `422`, never a DB error.
- It lives in the URL: Back, Forward and reload return to the same page.

---

## Lessons worth sharing

- **`EXPLAIN ANALYZE` lies about time** in a container: an exact count read 5.4 s under it vs 0.5 s real. Time with `\timing`; read plans for shape.
- **Time the SQL the app emits, not your own version of it.** One intermediate seek added two range bounds on the same index column; Postgres started at the looser one → 435 ms. Correct results, so tests passed. Only timing the logged SQL caught it.
- **Not every index pays.** Two per-customer composites (123–142 MB each) weren't needed; the planner used two small global ones.
- **Honest leftover:** admin sort-by-customer is 120–140 ms when one customer owns 50k disputes.

---

<!-- _class: lead -->

# 2. TanStack

"What is sent to the backend? If we stopped using it, what gap is left?"

---

## Three libraries, three jobs

| | What it does here | Where |
|---|---|---|
| **TanStack Router** | Type-safe routes; search params validated by the *same* Zod schema the API uses (`validateSearch: transactionsQuerySchema`) | `web/src/routes/**` |
| **TanStack Query** | The cache: `ensureQueryData` per loader, keys like `["disputes", search]`, refresh after mutations (#52) | `web/src/api/constant.ts` |
| **TanStack Start** | SSR + **server functions** (`createServerFn`) that run on the web server | `web/src/api/*.ts` |

---

## What goes over the wire: a read

```ts
export const disputesRequest = createServerFn({ method: "GET" })
  .inputValidator((input: Partial<DisputesQuery>) => input)
  .handler(async ({ data: params }) => {
    const { data } = await api.get(`${customerUrl}/disputes`, forwardCookie({ params }));
    return data;
  });
```

1. URL changes → the route **loader** runs with the search params as `loaderDeps`.
2. On first load it runs during SSR; after that the browser calls the **web server's server-function endpoint** with an **HTTP GET**, the input serialized into the request.
3. The server function calls the API: `GET :8080/v1/disputes?limit=10&cursor=…`, forwarding the session cookie (`forwardCookie`).
4. The API returns the shared envelope; Query caches it under `["disputes", {…search}]`.

**Demo:** DevTools → Network, click Next on the disputes list.

---

## What goes over the wire: a write

```ts
export const submitDispute = async (payload: DisputeCreateBody) =>
  (await api.post(`${customerUrl}/disputes`, payload)).data;
```

- A plain **HTTP POST** from the browser straight to the API (`:8080/v1/disputes`), JSON body `{ transactionId, reason, description }`, cookie sent via `withCredentials`.
- The receiving endpoint: a Fastify route with `schema: { body: disputeCreateBodySchema, response: { 201: disputeResponseSchema, … } }`.
- After success, `refreshQuery()` drops the cached list so the next render refetches (#52).

---

## If we stopped using TanStack, what's the gap?

- **Not filtering or sorting** — those are server-side SQL, unchanged.
- **Caching:** no dedupe, no back-navigation from cache, hand-rolled invalidation after every mutation.
- **URL as state:** search params would be untyped strings parsed by hand; today a bad `?sort=` is caught by the same Zod schema before any request.
- **The access pattern:** "every read is a loader" (#51). Without it, fetching drifts into `useEffect`s — waterfalls, loading flicker, no SSR.

**Answer:** the gap is caching and an architectural pattern, not features.

---

<!-- _class: lead -->

# 3. Drizzle

"ORM or query builder? Can you always see the SQL?"

---

## A query builder with types — the terms are SQL's

```ts
const probed = await executor
  .select({ ...CUSTOMER_COLUMNS, seek: page.seek })
  .from(TransactionModel)
  .where(and(eq(TransactionModel.user_id, userId), page.where))
  .orderBy(...page.orderBy)
  .limit(page.limit);
```

- `select / from / innerJoin / where / orderBy / limit` — 1:1 with SQL. No lazy loading, no identity map, no hidden queries.
- Types come from the schema: a wrong column is a compile error; the result type is inferred.
- When the builder can't say it, drop to `sql\`…\`` — still parameterised: the cursor's row comparison and `to_char(… 'US')` are `sql` fragments.

---

## Yes — you can always see the SQL

1. **Logged in development:** `drizzle(client, { logger: !isProduction && !isTesting })` in `api/src/database/config.ts`. Every query and its parameters print in `docker compose logs -f api`.
2. **Without running it:** `.toSQL()` on any query returns `{ sql, params }`.
3. **Captured for benchmarking:** `docs/list-query-performance/scripts/capture-current.ts` swaps in a custom logger, calls the real repository functions, and times the exact SQL. That's how the 435 ms regression was found.

**Demo:** `docker compose logs -f api`, then click Next in the admin queue.

---

<!-- _class: lead -->

# 4. HTTP/2 vs HTTP/1.1

---

## What HTTP/2 buys a web app

- **Multiplexing:** many requests in flight on one connection. HTTP/1.1 browsers open ~6 connections per origin and queue the rest.
- **Header compression (HPACK):** cookies and headers sent once, then referenced. Session cookies ride every request here.
- **One TLS connection** reused for everything: fewer handshakes.
- (Server push: deprecated by browsers — not a reason any more.)

Biggest win: pages that fire several requests at once — the review queue loads the list and the status summary in parallel.

---

## Where this repo stands — honestly

- **Today: HTTP/1.1 everywhere.** Fastify's default listener, Vite's dev server, keep-alive between web and API.
- Browsers only speak HTTP/2 over **TLS**, and the dev stack is plain `http://localhost`.
- **In production,** terminate HTTP/2 (or HTTP/3) at the load balancer / Ingress (`docs/production-runbook.md` §3). The hop from LB to app and web → API can stay HTTP/1.1 keep-alive inside the VPC — that's where most deployments leave it.
- **If needed in-process,** Fastify supports it directly: `fastify({ http2: true, https: { key, cert } })`.

---

<!-- _class: lead -->

# 5. Input validation & the API contract

"How does the backend reject bad input? Is there a contract? Can the code return JSON that differs from it?"

---

## One contract, two sides

- `shared/src/schema/*.ts` defines every body, query and response in **Zod**.
- **API:** each Fastify route declares `schema: { body | querystring, response: { 200, 401, 422, … } }` with the Zod type provider (`validatorCompiler` + `serializerCompiler`).
- **Web:** the same schemas validate search params (`validateSearch`) and type every response.
- Change a field in `shared` → both packages stop compiling until they agree.

---

## Bad input is rejected before your code runs

```http
GET /v1/transactions?sort=user_id
→ 422 { "code": "VALIDATION_ERROR",
        "errors": [{ "field": "sort", "message": "…" }] }
```

- Fastify validates the request against the Zod schema **before** the handler; the central error handler turns it into the shared envelope (`api/src/middleware/error.ts`).
- Not just types: refinements too — `from ≤ to`, `min ≤ max`, a cursor that fits its sort.
- Covered by tests: `api/test/list-query.test.ts` (`422s a sort column that is not on the whitelist`, …).

**Demo:** signed in, in the browser console:
`fetch("http://localhost:8080/v1/transactions?sort=user_id", { credentials: "include" }).then(r => r.json())`

---

## Can the code return JSON that breaks the contract?

- **Compile time:** each service maps rows through a typed `toWire(row): Dispute`, and each route's `Reply` is the response type. A renamed or missing field is a **typecheck error** in CI.
- **Run time:** the `serializerCompiler` parses every response against its Zod schema. Unknown keys are **stripped** (an internal column can't leak); a wrong type or missing field fails the request with a `500` instead of sending bad JSON.
- **Gap to name:** the route's `Reply` type is a union with the generic envelope, so the compiler won't catch *every* shape mistake — the serializer is the backstop.

**Demo:** rename a field in a `toWire` function → `pnpm typecheck` fails.

---

<!-- _class: lead -->

# 6. npm vulnerabilities & the supply chain

---

## We ran it while preparing this: `pnpm audit`

**110 advisories** — 5 critical, 42 high, 54 moderate, 9 low (104 on production dependency paths).

| Critical | Exposure here |
|---|---|
| `better-auth`: OAuth state usable as a magic link | We use email OTP only, no OAuth — but upgrade |
| `@tanstack/react-start`: reflected XSS in the Start server | `web` runs Start — **upgrade first** |
| `tinypool` ×2: prototype pollution → RCE | Test runner, pulled in transitively |

Highs: `fast-uri`, `axios`, `nodemailer`, `fastify`, `seroval`, `vite`.
**CI does not run an audit today.** That's the gap.

---

## What's already in place

- `--frozen-lockfile` in CI: the lockfile is the install, no silent upgrades.
- `save-exact=true`: versions are pinned, not `^ranges`.
- pnpm `allowBuilds: { esbuild: true }`: **only esbuild may run install scripts.** `postinstall` is the classic supply-chain payload; everything else is blocked.
- `docker compose` CI job proves a clean clone works.

---

## What to add

1. **Audit in CI, failing on high/critical:** `pnpm audit --prod --audit-level high`, or **IBM's `audit-ci`** (`npx audit-ci --high`) with an allowlist file for advisories reviewed and accepted.
2. **Upgrade the criticals:** `@tanstack/react-start`, `better-auth`, then `axios`, `fastify`, `nodemailer`, `vite`.
3. **Delay brand-new releases:** pnpm's `minimumReleaseAge` — a hijacked release is often spotted and pulled before a delay of a few days runs out.
4. **Dependabot / Renovate** for steady, reviewable upgrade PRs.
5. Prefer fewer, well-maintained dependencies — each one is someone else's release pipeline you trust.

---

<!-- _class: lead -->

# 7. Bonus: Next.js vs this stack

---

## Same job, different shapes

| | Next.js (App Router) | This stack |
|---|---|---|
| UI framework | React Server Components by default | React client components + SSR (TanStack Start) |
| Routing | File-based; `searchParams` are strings | File-based; search params **typed and Zod-validated** |
| Reads | `async` server components, `fetch` cache | Route loaders + TanStack Query cache |
| Writes | Server Actions | Typed client calls to a versioned REST API |
| Caching | Several framework layers (fetch, data, full route, router) | One explicit cache: Query keys + `refreshQuery` |
| Backend | Route handlers inside the Next app | **Separate Fastify API**, `/v1`, own scaling |
| Build | Next's own (Turbopack/Webpack) | Vite |
| Host | Anywhere Node runs; most features tuned for Vercel | Anywhere Node runs; no platform features assumed |

---

## Where Next.js is the better choice

- **Content-heavy, mostly-read sites:** RSC streaming and static generation shine.
- **Ecosystem and hiring:** far more docs, examples, libraries and engineers who know it.
- **Built-ins:** image optimisation, middleware, ISR, fonts.
- **One deployable:** UI and endpoints together is simpler when there's only one client.

---

## Why this stack fits a dispute portal

- **The API is the product boundary.** A mobile app, a back-office tool or another bank system can call `/v1` directly; with Next, the API tends to grow inside the web app.
- **One contract both sides compile against** (`shared` Zod). Server Actions are typed inside one app, not as a public contract.
- **Explicit, predictable caching.** Banking data must not be stale by surprise; one Query cache with named keys is easy to reason about.
- **Independent scaling and deploys:** the API is stateless and scales on its own (`docs/infrastructure.md`).
- **Cost:** two deployables, more wiring, and a younger framework with a smaller ecosystem than Next.js.

---

## Bottom line

> Next.js optimises for **one app** that renders and serves data.
> This stack optimises for **a stable API contract** that one or many clients render.

For a bank's dispute flow — an API other channels will need, strict contracts, explicit caching — the separation is worth its extra wiring. For a marketing site or a single-client internal tool, Next.js would be the faster path.

---

## Questions to be ready for

- *Why no total count?* Counting a million rows on every page cost 450 ms; nobody needs "page 43,712 of 105,000". The status cards give the totals that matter.
- *What if a row is inserted while paging?* A cursor names a row, not a position: no repeats or skips, unlike `OFFSET`.
- *Isn't 34 indexes a lot?* Each one is used by a measured query; 19 unused ones were removed first.
- *Why not raw SQL?* Postgres runs the same statement either way; Drizzle adds types for free. Measured: microseconds.
- *Why TanStack over Next.js?* The API contract outlives any one frontend.
- *What would you do next?* Audit in CI + upgrades; `pg_trgm` for search; HTTP/2 at the load balancer.

---

# Thank you

Repo: `docs/list-query-performance.md` · `docs/progress-and-decisions.md` #68–#70 · this deck: `docs/presentation/engineering-exchange.md`
