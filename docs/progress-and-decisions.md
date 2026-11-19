# Progress & Decisions

## Progress

Feature-complete. The Fastify API covers auth (email-OTP sign-in, session endpoint, two-step email change), transactions, disputes (submit/list/detail/withdraw), the admin review → resolve flow, and invite-only admin accounts. It's backed by a 92-test Vitest integration suite that runs in CI against real Postgres + Mailpit. `web` is a TanStack Start app with a session-gated route tree, loader-driven data fetching, one typed API client, and live dispute-status toasts over ntfy (12 unit tests). Every flow has been walked by hand in a browser as both roles. After the SE II panel asked how the lists would cope with millions of rows, the list queries were reworked and measured at 2.2M transactions / 1.05M disputes: every list page, at any depth and on any sort, is now an index seek of about 0.3–3 ms (#68–#70, `docs/list-query-performance.md`).

### Definition of done

- [x] View / dispute / historic-view work end to end in a browser, as customer and admin
- [x] Dispute lifecycle enforced server-side (#41/#45, `dispute-lifecycle.test.ts`)
- [x] A customer can't read another user's data (`transaction-scoping.test.ts`, `dispute-scoping.test.ts`)
- [x] Admin routes are unreachable with a customer session (`admin-authz.test.ts`)
- [x] Duplicate dispute submission is rejected, not double-inserted (#40, `duplicate-dispute.test.ts`)
- [x] Seed data is big enough to justify pagination/indexing (~31 users, ~4.3k transactions, ~265 disputes)
- [x] `/healthz` and `/readyz` exist; k8s probe wiring documented in `docs/production-runbook.md`
- [x] One load-test number in the README (#48)
- [x] `docker compose up -d` on a clean clone is a working stack, zero setup (#34/#42)
- [x] CI green on `main` (`.github/workflows/build.yml`)
- [x] Repo is public

### Known gaps (not blocking)

- New-device fingerprinting is per user-agent string, so a browser point-release triggers a false alert; the very first login also triggers one.
- Best-effort email/ntfy send failures go to `console.error`, not structured logging.
- No integration test pins Better Auth's two-step email-change token handling; the confirm step writes no audit row.
- Change-email request and confirm share one rate limit.
- Open product question: should confirming an email change from a link also sign the user in?

---

## Decisions

A log of the non-obvious engineering decisions: the problem, what was decided, the alternatives actually considered, and why this choice fits *this* project. It's the doc to open before a "why did you..." question. Numbers are stable IDs that the code and other docs cite. Superseded decisions and write-ups of bugs that have since been fixed were removed; git history keeps them.

## 3. Notifications: self-hosted ntfy, not real email/SMS or a bare console.log

**Problem:** The brief only needs a *simulated* notification on dispute status change, and a bare `console.log` is the least convincing demo of an event-driven design.

**Decision:** Publish to a per-user topic on a self-hosted [ntfy](https://github.com/binwiederhier/ntfy) (`docs/dev-tools.md`). Email/SMS was rejected as a worse demo (spam/delay risk vs. an instant on-screen push). ntfy is never used for OTP delivery: pub/sub topics are broadcast by design, which is the wrong shape for a credential.

## 4. Idempotency: reject duplicate disputes server-side, not just client-side

**Problem:** Creating a dispute is a financial action. A retry or double-click that files two disputes on one transaction is a realistic failure.

**Decision:** A second open dispute on the same transaction is rejected at the DB level (#40), not just by a disabled button. A button doesn't survive a retry, a second tab, or a client bug.

## 5. TypeScript: staying on 6.0.3, not 7.0

TS 7.0 (the Go rewrite) shipped without a stable programmatic compiler API, and `typescript-eslint` won't support it until 7.1. Switching would break `pnpm lint`. Revisit once `typescript-eslint` supports 7.x.

## 6. Node & pnpm: Active LTS, not latest

Node 24 (Active LTS) and pnpm 11. Node 26 is "Current", not LTS. For a project meant to show production judgment, "stable" means the line that's maintained for years.

## 7. `shared` compiles to `dist/`, not `.ts` source

`api` must run as plain `node` in production, which can't import `.ts`. So `shared` has a real `tsc` build, `exports` points at `dist/`, and turbo's `typecheck`/`test` depend on `^build`. That's also why compose runs `shared build` before starting `api`/`web`.

## 16. Admin portal: a real (small) one, invite-only

**Problem:** Disputes need a reviewer, and letting a customer resolve their own dispute would be an authz hole.

**Decision:** A minimal admin portal (a review queue plus a resolve action) gated by a Better Auth session carrying the `ADMIN` role. Admin accounts are invite-only: an existing admin emails an invite, and accepting it is the only way an admin account gets created. An earlier shared-secret `/internal/...resolve` route was removed outright rather than kept alongside, because two auth mechanisms for one action is two things to explain.

## 18. API versioning: `/v1/` prefix

Public and admin routes live under `/v1/`. Health checks (`/healthz`, `/readyz`) stay unversioned because they're infra probes, not API consumers.

## 21. Auth: email-OTP login, no password

**Problem:** Every feature depends on auth.

**Decision:** Better Auth's email-OTP plugin is the only login mechanism: 6-digit hashed code, 10-minute expiry, a lockout after 5 bad attempts, rate limits, and an audit log. Passwords were rejected because a stored credential is something to get right forever (hashing, breach reuse, resets); OTP has no long-lived secret at all. Google OAuth was rejected because it means an external identity provider gating every login.

**Tradeoff accepted:** outbound email is now on every login's path. Mailpit catches it in dev/demo. Real SMTP is a documented production requirement, not built.

## 22. API response envelope: `globalResponseSchema` / `paginatedGlobalResponseSchema`

Every response is `{ code, message, redirectUrl?, errors? }`, and lists add `limit`/`total`/`next_cursor`/`prev_cursor` (#69). Endpoints `.extend({ data })`. It lives in `shared`, so client and server can't drift.

## 23. DB: Postgres, not MySQL

There's no functional difference for this brief, and Postgres 18 gives native `uuidv7()` (#29).

## 28. Drizzle schema & Better Auth wiring: mirror the Ubuntu Stories house style

One table per file (`XxxModel`, snake_case, uuid PKs), relations in one `relations.ts`, a `pgEnum` per enum generated from `shared`'s constants, and `bigint` cents for money (no float/decimal questions). A partial unique index enforces one open dispute per transaction (#40). `auth_audit_log` is keyed by email, since a failed login may name no real user. Better Auth goes through `drizzleAdapter` with explicit tables. Reusing a schema style that already ships in production beat inventing a new one.

## 29. Primary keys: UUID v7 via Postgres 18's `uuidv7()`

A v7 UUID is non-guessable, so there's no separate public-id column. v4 was rejected because full randomness scatters inserts across the B-tree, while v7's time-ordered prefix keeps them roughly append-ordered.

## 30. Enum wire values: SCREAMING_SNAKE

`SUBMITTED`, `FRAUDULENT_CHARGE`, `ADMIN`. This matches Ubuntu Stories, so `pgEnum(...)` takes the constant objects directly with no case transform.

## 31. OTP email delivery: nodemailer + Mailpit, wired for real

One `lib/mailer.ts` that logs and swallows transport errors. Better Auth advises against awaiting OTP delivery (a timing side channel), so a mail failure must never surface as a login failure. A stub was rejected because the point of Mailpit is that the demo login really sends.

## 34. One committed `.env` per package, with working local values

`api/.env` and `web/.env` are committed with real local values (a fake Postgres password and freshly generated auth secrets with nothing behind them), so a clone runs with zero setup. Blank-secret files plus per-developer `.env.local` overrides were tried and rejected: if the values are fake and local-only, blanking them protects nothing and adds a copy-and-fill step to every clone. Real account credentials (e.g. a Gmail App Password) are never committed.

## 35. API skeleton: the Ubuntu Stories request stack, with its over-builds trimmed

A `build()` factory split from `app.ts`, one `middleware/index.ts` (helmet, CORS, rate limit, cookie, zod compilers, error/not-found handlers, `authenticate`/`authorize` decorators), and a `modules/<name>/{route,service,type}` triad. Deliberately *not* copied: a generic query DSL (#36), event middleware, a second correlation id, custom Pino levels, a three-state readiness model, and Better Auth's own rate limiter. Each one was machinery with no real consumer.

## 36. Data access: per-table Drizzle functions taking an `Executor`

`database/repository/<table>.ts`: plain arrow functions with hand-written Drizzle queries, each taking an `Executor` (the pool or an open transaction) first, so the caller controls transaction scope. No repository classes or DI. There's no second caller that needs them.

## 37. Auth routes wrap Better Auth's server API, not its catch-all handler

Mounting Better Auth's handler would bypass the shared envelope, the `auth_audit_log` trail, and our chosen rate limits. Instead, our own routes call `auth.api.*`, shape the response, forward `Set-Cookie`, and write an audit row. `POST /v1/auth/otp` answers identically whether or not the account exists, so it can't be used to probe for users.

## 38. Dates: `date-fns`

It works on native `Date` (no wrapper type at the DB boundary, unlike luxon) and is function-based and tree-shakeable.

## 39. Customer data scoping: the owner filter is in the query, and a miss is a 404

`user_id = :caller` is part of every customer query. There's never a fetch-then-check. Another user's row returns `404`, identical to a missing row, because a `403` would confirm the id is real. A malformed id is a `422`. A new endpoint gets the guarantee just by using the scoped repository function.

## 40. One open dispute per transaction: the DB is the guard, not a pre-check

There's no pre-check `SELECT` and no `Idempotency-Key`. The partial unique index is the whole mechanism: a duplicate hits `23505`, and the global error handler maps that to `409`. A pre-check is a TOCTOU race that needs the index anyway. Verified: 5 parallel submits → one `201`, four `409`s.

## 41. Dispute lifecycle: forward-only, each transition guarded inside the `UPDATE … WHERE`

`SUBMITTED → UNDER_REVIEW → RESOLVED | REJECTED`. Resolve **requires** `UNDER_REVIEW`. Each transition is `UPDATE … WHERE status = <expected>`, so an empty `RETURNING` means the dispute was in the wrong state (`409`), and concurrent admins collapse to one write. `review` is idempotent. There's no assignee: `UNDER_REVIEW` is a flag any admin can act on (#16).

## 42. One dev-only environment; production is a runbook, not a pipeline

This repo never deploys. So it has one `compose.yml`, one dev `Dockerfile` per package, and the api command chains `shared build && migrate && dev`, which makes a fresh clone work with no manual step. CI is checks plus a compose smoke test. Multi-stage images, a gated deploy pipeline, k8s manifests, and migrations as a gated pre-deploy step are all written up in `docs/production-runbook.md`. A staging/production pipeline was built earlier and deleted: it published images nobody deployed.

## 43. Repository reads exclude columns with `getTableColumns` rest-spread

`const { user_id, resolved_by, ...CUSTOMER_COLUMNS } = getTableColumns(DisputeModel)`, then `.select(CUSTOMER_COLUMNS)`. It's a real SQL projection, and new columns are included automatically. Admin reads that need every column use a bare `.select()`.

## 44. Admin invites: a dedicated `admin_invite` table, not Better Auth's `verification`

The table holds `email`, a unique `token`, `expires_at`, nullable `accepted_at`, and `invited_by`. The token travels only in the emailed link, never in a response body. Accept is unauthenticated, and the still-valid check lives in the accept `UPDATE`'s `WHERE`, so a concurrent second accept cleanly 409s. `verification` was rejected: it has no `invited_by` trail, Better Auth deletes rows on use, and nothing in Better Auth creates an admin account from it anyway.

## 45. Lifecycle edge cases: `WITHDRAWN` is the only new state; "reopen" means a new dispute

The customer can withdraw from either open status (ownership and open status are both checked in the `UPDATE … WHERE`, with a `SELECT … FOR UPDATE` first so the audit row's `from_status` can't lie under a race with an admin review). "Reopening" a rejected dispute is just opening a new one, since the unique index only blocks a second *open* dispute. An admin declining a review and supervisor override are out of scope: there's no assignee to hand back from, and a second admin tier isn't in the minimal portal (#16).

## 46. Account-security emails: new-device alert + two-step email change

The email address *is* the credential (#21), so redirecting it is the whole attack. A Better Auth `session.create.after` hook emails the account when a session comes from a first-seen user agent (fire-and-forget). Changing the email is two-step: an approval link goes to the **current** address first, and only then does a verification link go to the new one. A single-step change was rejected because it's exactly that redirect vector.

## 47. Tests: integration tests that drive the real OTP flow, not forged sessions

`app.inject()` against the real `build()`, real Postgres, and real Mailpit. Sessions come from reading the OTP out of Mailpit's API. Mocking auth or the repository was rejected: the behaviour under test *is* the integration (the owner filter is SQL, #39; the lifecycle guard is an `UPDATE … WHERE`, #41). The suite uses its own `transaction-dispute-test` database, created and migrated by a Vitest `globalSetup`, so it never touches the dev stack's seed data.

## 48. Load-test number: measure once, document the fix

`autocannon` against `GET /v1/transactions` gave ~230 req/s, p97.5 171 ms. `GET /readyz` (DB round trip, no session) gave ~3,700 req/s. So the ceiling on authenticated routes is Better Auth's per-request session lookup, not Postgres or Fastify. The fix (cookie-cache/JWT sessions, or a short-TTL session cache) is documented in `docs/infrastructure.md` rather than tuned blind against a dev-mode measurement.

## 50. `GET /v1/auth/session` and `buildUrlWithParams`

`GET /v1/auth/session` returns the same fields as `request.user` and 401s with a `redirectUrl` when there's no session. That's what the web's root guard branches on, and it answers "what's my role?", which probing a protected endpoint can't. `buildUrlWithParams(pattern, params)` in `shared` types `params` from the pattern itself, so renaming a `:param` breaks every call site at compile time.

## 51. Frontend architecture: session-gated route tree, loaders for every fetch, one API client

A `beforeLoad` root guard seeds the session once per navigation, and two layout routes split by role via redirect, not conditional render. Every read is a route loader + `fetchQuery`, keyed on `loaderDeps` (#71). One axios instance normalizes every failure into one `ApiError`. Its `baseURL` is `SERVER_API_URL` during SSR (container-to-container) and `VITE_API_URL` in the browser. `useDisputeNotifications` opens an `EventSource` on the user's ntfy topic. Fetching the session in a `useEffect` was rejected: `CLAUDE.md` rules it out, and it would flash an unauthenticated state.

## 52. After a mutation, `refreshQuery()` removes the cache entry rather than invalidating it

No live `useQuery` observes the loaders' queries (pages read `Route.useLoaderData()`), so `invalidateQueries`, whose default `refetchType` is `"active"`, refetches nothing, and a forced refetch fails for an SSR-hydrated entry, which has no `queryFn` on the client. `refreshQuery(queryClient, router, keys)` calls `removeQueries` and then `router.invalidate()`, so the rerun loader finds nothing cached and fetches with its own `queryFn`. Removing also drops every cached variant of a list (other filters, sorts and cursors) and covers the root session read, which still uses `ensureQueryData`. Every mutation goes through this one helper.

## 53. Every dispute carries its transaction's merchant, amount and date

`disputeSchema` nests `transaction: { merchant_name, amount_cents, transacted_at }`, which comes from an `innerJoin` on every read. Write paths reuse the read they already do for the ownership check, so there are no extra queries.

## 57. One shared list query across every list endpoint

`shared`'s `paginationQuerySchema` (`limit ≤ 100`, `cursor`, `search`, `from`/`to`, `order`) is extended per endpoint with its own filters (transactions and both dispute lists add an inclusive `min_amount_cents`/`max_amount_cents` range, `min ≤ max` or `422`) and a **whitelisted** `sort` enum, so an unlisted value is a `422`, never an interpolated column. Column binding lives in each repository. Small helpers (`containsText`, `withinDays`, `withinAmount`, and `keyset` / `sortedBy` for paging, #69) cover the repeated logic. On the web, `<DataList>` (controls + sortable table + pagination) is shared by all four list pages. A generic `buildListQuery()` DSL was rejected because the four queries differ too much in joins and scoping.

## 58. Review queue: unresolved disputes first by default, stat cards from their own endpoint

With no explicit `sort`, the queue orders `status ASC, created_at ASC`. The enum is declared in lifecycle order, so the oldest open dispute leads. `GET /v1/admin/disputes/summary` returns zero-filled per-status counts, and its query key is a prefix of the list's, so the same post-mutation refresh covers both. The counts aren't on the list response because the list is filtered and paginated and the cards shouldn't be.

## 60. Dates render and filter in one fixed business timezone

`BUSINESS_TIMEZONE = "Africa/Johannesburg"`. `formatDate`/`formatDateTime` use `formatInTimeZone`, and `withinDays` converts `from`/`to` as wall-clock dates in that zone. SSR (UTC container) and the browser therefore render identical strings, and "the charge posted on date X" is one unambiguous fact, which is how banking apps behave. Tests force two different `process.env.TZ` values and assert identical output.

## 65. No reverse proxy in the dev stack

**Problem:** An nginx proxy fronted `web`/`api`/`ntfy`/Mailpit under a custom `/etc/hosts` name, to mirror the "one stable client-facing domain" production pattern. It cost a `sudo` hosts-file edit on every machine, its own DNS-caching and path-rewrite config, and a sixth container. None of that is product behaviour.

**Decision:** Removed. Each service publishes its own `localhost` port (web `:3000`, api `:8080`, Mailpit `:8025`, ntfy `:8090`), and cookies work because `localhost` is same-site across ports. The production pattern (an Ingress/load balancer in front of a stable domain) is still documented in `docs/production-runbook.md` §3, where it's actually needed.

## 66. Status notifications carry the dispute id, not its details

**Problem:** The ntfy message body was just the new status, so the toast said "one of your disputes is now Under review" and the customer had to filter the list to find which one.

**Decision:** The api publishes `{ dispute_id, status }` (`shared`'s `disputeNotificationSchema`). The browser refreshes that dispute's queries, fetches it through the session-scoped API to name the merchant and amount, and the toast's **View** action opens it. Putting the merchant and amount on the message itself was rejected: ntfy topics are unauthenticated, so anyone who learns a topic name could read them. A random id reveals nothing, and the details stay behind the session cookie. The cost is one extra `GET` per notification.

## 68. Index only what a query uses; give each list its sort order

**Problem:** The SE II panel's first question was how the paginated lists would cope with millions of rows. Reading every repository query against the schema found two things. The schema carried 36 secondary indexes plus three duplicate unique constraints (column-level `.unique()` *and* a `uniqueIndex` on `user.email` and both `token` columns), most on columns no query filters or sorts by (`updated_at` on every table, `dispute.reason`, `auth_audit_log.event`), each one a cost on every write. And no index matched the dispute lists' own order, so the admin queue sorted the whole table for every page.

**Decision:** An index stays only if a repository query uses it or it backs a foreign key that is deleted through. Migration `0001` drops 18 indexes and the three duplicate constraints, and adds `dispute (user_id, created_at, id)` for the customer list and `dispute (status, created_at, id DESC)`, which is exactly the review queue's default order (#58). 48 indexes → 29. The match count was capped at 10,001 rows at the same time.

**Measured** (`docs/list-query-performance.md`): the admin queue's first page 43 ms → 1.4 ms, its count 448 ms → 7.4 ms. Deep pages barely moved, which is what #69 is for.

## 69. Cursor paging on every list; no page numbers, no total

**Problem:** After #68, a deep page still cost what `OFFSET` costs: Postgres reads and throws away every row before the page (102 ms at row 10,000 of the admin queue, 3.3 s at row 500,000). The count ran beside every page just to print "1–10 of N", and was the slowest part of most requests (450 ms; 1.3 s with a search).

**Decision:** Every list pages by cursor (keyset), on every sort. A cursor names the row a page starts after (or ends before): `direction~sort~order~value(s)~id`, each part URL-encoded. The page is `WHERE (sort key, id) > (cursor values) ORDER BY sort key, id LIMIT 11`: an index seek, the 11th row only saying whether a next page exists. `cursor=last` reads from the far end. `page`, the count, `count_capped` and the 10,000-row window are gone; the pager is First / Prev / Next / Last plus a rows-per-page picker (10 / 25 / 50 / 100). A cursor carries the `sort` / `order` it was issued for, and `shared` validates its values per sort, so a cursor from another sort, another list, or edited by hand is a `422`, not a database error. Timestamps travel as Postgres-printed text with microseconds, because a JS `Date` would round them and skip or repeat rows that share a millisecond.

**Alternatives considered:** keeping offset for page-number jumps (rejected: it was the only slow path left and the page box looked broken past the window, "1001 / 1000"); "load more" (rejected: the position isn't in the URL, so reload, Back and a shared link lose it, the DOM grows, and a status change mid-session repeats or skips appended rows); cursors on the default order only (rejected: a sorted list is just as seekable — it only needs `id` as the tie-break); base64 JSON cursors (rejected: `shared` targets plain ES2022 with no DOM/Node types, so no `btoa`; per-part `encodeURIComponent` is enough and keeps cursors readable).

**Tradeoff accepted:** no "page 437" and no total. Reviewers find rows by filter and search, which is how the queue is used; the status cards (#58) still give the totals that matter. Measured: every page 0.3–3 ms at any depth (`docs/list-query-performance.md`).

## 70. Sort indexes chosen by `EXPLAIN`, and the seek bounded once

**Problem:** With #69, sorted lists were correct but not index-backed: the admin queue sorted by amount, merchant or customer took 0.9–1.6 s, because those columns live on joined tables and no index on `dispute` can serve them.

**Decision:** Nine candidate indexes were built on a 2.2M-transaction copy and kept only where the planner used them for a deep cursor page. Migration `0002` adds five: `transaction (amount_cents)`, `transaction (merchant_name)`, `user (name)` (the planner drives a nested loop from the joined table), `dispute (user_id, status, id)` and `dispute (status, id)`. Rejected candidates: per-customer `transaction (user_id, amount_cents | merchant_name, id)` (123–142 MB each; the small global indexes already served the heavy customer, and a normal customer's ~40 rows sort in a fraction of a millisecond), and widening two existing indexes with `id` (no measurable gain). The seek adds exactly **one** kind of range bound: a plain row comparison when the sort column is on the list's own table, an inclusive first-group bound for the review queue's mixed-direction order, a bound on the first key alone when it's on a joined table (a row value spanning two tables can't be an index condition). Two bounds on the same index's first column made Postgres start the scan at the looser one; that version took 435 ms on a deep queue page and was only found by timing the exact SQL the app emits, not hand-written equivalents (`docs/list-query-performance/scripts/capture-current.ts`).

**Tradeoff accepted:** 144 MB of index at this scale and about +25% on bulk `transaction` inserts, which only the seed performs. The admin sort by customer is still 120–140 ms when one customer owns tens of thousands of disputes (`docs/list-query-performance.md`).

**Migration naming:** drizzle-kit treats the snapshot whose file name sorts last as current. The hand-renamed `000_snapshot.json` sorted after `0001_`, so it was renamed `meta/0000_snapshot.json`; the journal and SQL are untouched.

## 71. Loaders read with `fetchQuery`, so `staleTime` applies

**Problem:** Loaders used `ensureQueryData`, which returns cached data whenever any exists and ignores `staleTime` and the invalidated flag (`@tanstack/query-core` `queryClient.js`). Back to a list showed the cached copy until the garbage collector removed it, 5 minutes by default, so another admin's change could stay hidden that long.

**Decision:** Every data loader calls `queryClient.fetchQuery` with the same options. It returns the cached copy while it is younger than the client's 30-second `staleTime`, and fetches (awaited) once it is older or invalidated. Measured in the running app: Back within 30 s made no request; Forward after 40 s made one. The root session read in `beforeLoad` keeps `ensureQueryData`: the API checks the session on every request regardless, so the cached copy only drives redirects.

**Alternatives considered:** `ensureQueryData({ revalidateIfStale: true })` starts a background refetch, but nothing observes the cache, so the page would never show its result. Reading with `useSuspenseQuery` in each component (an observer, so `invalidateQueries` and background refetch both work) is the larger change; it remains an option if a page needs live-updating data.

## 72. The development query log redacts parameters of the auth tables

**Problem:** Drizzle's default logger prints every bound parameter, so `docker compose logs api` showed raw session tokens from the session lookup that runs on every authenticated request, plus OTP and invite values.

**Decision:** `api/src/database/query-logger.ts`'s `redactingLogger` keeps Drizzle's `Query: <sql> -- params: [...]` line but prints `[n redacted]` for any query on `session`, `verification`, `account` or `admin_invite` (table names from the schema via `getTableName`). The SQL text never holds a value, so it is always printed in full; every other query keeps its parameters for debugging. Production and tests still log no queries. Covered by `api/test/query-logger.test.ts`.

**Alternatives considered:** Redacting every parameter loses the logger's main debugging value. Matching values that look like secrets is guesswork; the table is a reliable signal.
