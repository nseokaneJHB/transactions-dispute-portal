---
marp: true
paginate: true
title: Transactions Dispute Portal — Engineering Exchange
---

# Transactions Dispute Portal

### Capitec Payments Engineering Exchange

The SE II panel's pagination concern · TanStack · authentication · Drizzle · HTTP/2 · Zod contracts · npm supply chain · Next.js vs this stack

Every capture in this deck was taken from this repo running locally (`docker compose up -d`, seeded with `pnpm db:seed`) on 17 November 2026.

---

## How each section is laid out

1. **The question**, as it was asked
2. **The answer** in one or two lines
3. **The evidence:** a real request, log line, error or measurement from this repo
4. **The demo:** what to run, and what you will see
5. **The caveat:** what isn't solved, said before someone asks

---

## The stack, and the two network paths

```
                 ┌──────────── reads: GET /_serverFn/<id>?payload=… ───────────┐
Browser ─────────┤                                                               ▼
  (cookie:       │                                    web :3000  TanStack Start (Vite, SSR)
   HttpOnly)     │                                         │ axios, Cookie header forwarded
                 │                                         ▼
                 └──── writes: POST /v1/… (withCredentials) ──►  api :8080  Fastify + Zod + Better Auth
                                                                     │ Drizzle
                                                                     ▼
                                                                Postgres 18
```

- **Reads** go through the web server, using a TanStack server function.
- **Writes** go from the browser straight to the API.
- `shared` holds the Zod schemas, types and constants both sides compile against.

---

<!-- _class: lead -->

# 1. The panel's concern

"The paginated list queries will be slow at millions of rows."

---

## They were right. Measured on one dataset

2.2M transactions, 1.05M disputes, one customer with 200k transactions. Postgres 18, `psql \timing`, median of 5 runs.

| Request | Before | After index refactor | Now |
|---|---|---|---|
| Admin queue, first page (page + count) | 448 ms | 7.4 ms | **1.9 ms** |
| Admin queue, row 500,000 | 1,780 ms | 3,278 ms | **2.6 ms** |
| Admin queue sorted by amount | 893 ms | 977 ms | **1.6 ms** |
| Admin search, first page (page + count) | 1,297 ms | 764 ms | **5.9 ms** |
| Heavy customer's disputes, row 40,000 | 178 ms | 191 ms | **0.6 ms** |

The "Now" column times the exact SQL the app sends. Method, raw results and rerunnable scripts: `docs/list-query-performance.md`.

---

## What changed, in three steps

1. **Index only what a query uses** (decision #68).
   - 48 → 29 indexes.
   - Dropped the `updated_at` index on every table and three duplicate unique constraints.
   - Added one index per list that matches its sort order exactly.
2. **Cursor (keyset) paging, no count** (#69).
   - The query is `WHERE (sort key, id) > (cursor) ORDER BY … LIMIT 11`.
   - Postgres seeks straight to the position instead of reading and discarding `OFFSET` rows.
   - The pager is First / Prev / Next / Last.
3. **Sort indexes chosen by `EXPLAIN`** (#70).
   - Tried 9 candidates on the 2.2M-row copy and kept the 5 the planner actually used.
   - 29 → 34 indexes; inserts are about 25% slower.

---

## The cursor, as the API sees it

Captured from the API log after clicking **Next** on the review queue:

```
GET /v1/admin/disputes?limit=10&cursor=next~queue~desc~SUBMITTED~2026-02-20T04%253A19%253A10.907000Z~01a1602b-0eb9-71bb-…
→ 200 in 32 ms
```

What each part of the cursor means:

| Part | Value |
|---|---|
| direction | `next` |
| sort | `queue` (the default order) |
| order | `desc` |
| last row's sort values | `SUBMITTED`, `2026-02-20T04:19:10.907Z` |
| last row's id | `01a1602b-…` |

- A cursor from another list, another sort or a hand edit returns a `422`, never a database error.
- `cursor=last` reads the list from the far end.
- The cursor lives in the page URL, so Back, Forward and reload all return to the same page.

---

## Lessons worth sharing

- **Time the SQL the app sends, not your own version of it.**
  - One version of the cursor code added two range conditions on the same index column.
  - Postgres started its scan from the looser one: 435 ms on a deep page.
  - The results were correct, so every test passed. Only timing the logged SQL caught it.
- **`EXPLAIN ANALYZE` overstates time** inside this container.
  - An exact count read 5.4 s under `EXPLAIN ANALYZE`, but 0.5 s with `\timing`.
  - Use plans for their shape and `\timing` for numbers.
- **Not every index pays for itself.** Two per-customer composite indexes (123–142 MB each) went unused; the planner preferred two small global ones.
- **Still slow:** sorting the admin queue by customer takes 120–140 ms when one customer owns 50k disputes.

---

<!-- _class: lead -->

# 2. TanStack

"What is sent to the backend? Is it an HTTP POST? What does the receiving endpoint look like?
If we stopped using it, what gap is left?"

---

## Three libraries, three jobs

| Library | What it does in this repo | Where |
|---|---|---|
| **TanStack Router** | Typed routes. Search params are parsed by the **same Zod schema** the API uses (`validateSearch: adminDisputesQuerySchema`) | `web/src/routes/**` |
| **TanStack Query** | The in-memory cache. Each route loader calls `ensureQueryData` with a key like `["admin","disputes",{limit,cursor}]` | loaders, `web/src/lib/query.ts` |
| **TanStack Start** | Server-side rendering, plus **server functions** (`createServerFn`): code in `web/src/api/*.ts` that always runs on the web server | `web/src/api/*.ts` |

---

## Q: What is sent? Answer: it depends on when the read happens

| When | What the browser sends | Who calls the API |
|---|---|---|
| **Full page load or reload** | Only the HTML document request. **No data request at all.** | The web server, while rendering the page |
| **Navigating in the app** (Next, a filter, a sort) | `GET :3000/_serverFn/<id>?payload=…`, sent **to the web server, not the API** | The web server, server to server |
| **Back to a page already visited** | **Nothing.** Served from the Query cache | Nobody |
| **A write** (submit, withdraw, review, resolve) | `POST :8080/v1/…` with a JSON body, **straight to the API** | The browser |

Measured in Chrome:
- **Reload of `/admin`:** 10 rows rendered, 0 `_serverFn` requests, 0 requests to `:8080`.
- **Next:** exactly one `_serverFn` GET.
- **Back:** no new requests.

---

## Why the Network tab doesn't look like a normal API call (1/3)

This is the **actual request** Chrome recorded when Next was clicked on the review queue:

```
GET http://localhost:3000/_serverFn/eyJmaWxlIjoiL3NyYy9hcGkvYWRtaW4udHM_dHNzLXNlcnZlcmZuLXNwbGl0IiwiZXhwb3J0Ijoi
    YWRtaW5EaXNwdXRlc1JlcXVlc3RfY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9
    ?payload=%7B%22t%22%3A%7B%22t%22%3A10%2C%22i%22%3A0%2C%22p%22%3A%7B%22k%22%3A%5B%22data%22%5D…
x-tsr-serverFn: true
accept: application/x-tss-framed, application/x-ndjson, application/json
```

There are three reasons it looks strange:
1. **It goes to the web server (`:3000`)**, not the API (`:8080`).
2. **The path is a function id, not a resource.**
3. **The arguments aren't query params.** They're one serialized blob in `?payload=`.

---

## Why the Network tab doesn't look like a normal API call (2/3)

**The id** decodes, in development, to the file and export it calls (base64url JSON):

```json
{"file":"/src/api/admin.ts?tss-serverfn-split",
 "export":"adminDisputesRequest_createServerFn_handler"}
```

In a production build the id is a **SHA-256 hash** (`start-plugin-core/…/compiler.js`), so production URLs say nothing about the code behind them.

**The payload** is the function's input encoded with **seroval**, TanStack's serializer. Unlike JSON, seroval keeps `Date`, `Map` and repeated references intact. Decoded:

```json
{"t":{"t":10,"i":0,"p":{"k":["data"],"v":[{"t":10,"i":1,"p":{"k":["limit","cursor"],
  "v":[{"t":0,"s":10},{"t":1,"s":"next~queue~desc~SUBMITTED~2026-02-20T04%3A19%3A10.907000Z~01a1602b-…"}]}}]}},"f":127,"m":[]}
```

`t` is the value's type (10 = object, 0 = number, 1 = string), `k` the keys, `v` the values. So the request is just `{ data: { limit: 10, cursor: "next~…" } }`.

---

## Why the Network tab doesn't look like a normal API call (3/3)

**The response** is seroval-encoded too. Headers we captured:

```
content-type: application/json
x-tss-serialized: true
```

The body starts like this:

```json
{"t":10,"i":0,"p":{"k":["result","error","context"],"v":[{"t":10,"i":1,"p":{"k":["code","message","total",
 "next_cursor","prev_cursor","limit","data"],"v":[{"t":1,"s":"OK"},{"t":1,"s":"Disputes retrieved."},…
```

Inside the wrapper is **our normal API envelope**: `code`, `message`, `next_cursor`, `data`, and so on.

**The real REST call is invisible to DevTools.** It happens between the containers, and the API log shows it:

```
INFO HTTP GET /v1/admin/disputes → 200 (32.31ms)
  url: "/v1/admin/disputes?limit=10&cursor=next~queue~desc~SUBMITTED~…"
  correlationId: "01a1ebbd-927b-76e9-b477-7a3a85a63da4"
```

**Demo:**
1. In DevTools → Network, filter on `_serverFn` and click Next. Open **Payload**, then **Response**.
2. Run `docker compose logs -f api` to see the matching `GET /v1/admin/disputes`.

---

## What the receiving endpoint looks like: both ends

**Web server side:** the server function, `web/src/api/admin.ts`.

```ts
export const adminDisputesRequest = createServerFn({ method: "GET" })
  .inputValidator((input: Partial<AdminDisputesQuery>) => input)
  .handler(async ({ data: params }) => {
    const { data } = await api.get(`${adminUrl}${API_PATHS.ADMIN_DISPUTES}`, forwardCookie({ params }));
    return data;
  });
```

**API side:** a Fastify route with a Zod schema, `api/src/modules/admin-dispute/route.ts`.

```ts
app.route({ method: "GET", url: API_PATHS.ADMIN_DISPUTES, handler: listDisputesForReview,
  preHandler: [app.authenticate, app.authorize(USER_ROLE.ADMIN)],
  schema: { querystring: adminDisputesQuerySchema,
            response: { 200: adminDisputeListResponseSchema, 401: …, 403: …, 422: …, 429: …, 500: … } } });
```

**Is it a POST?**
- Reads are server-function **GETs**, chosen with `{ method: "GET" }`. A POST server function would put the same seroval payload in the request body instead.
- Writes are **plain REST POSTs** to the API.

---

## Why reads and writes take different paths

**Reads must also run while the page renders on the server.**
- A full page load runs the loader on the web server, where there is no browser.
- `forwardCookie()` copies the incoming `Cookie` header onto the server-side call to the API.
- The browser can't send the request itself here: the page HTML arrives with the data already in it.
- When the same read runs again after a client-side navigation, it goes through the server function, so the request path and auth handling are the same in both cases.

**Writes only ever happen after a click in the browser.**
- There is no page render to take part in, so `submitDispute` is a plain `axios.post` to `:8080/v1/disputes`.
- It sends a JSON body `{ transactionId, reason, description }` and the cookie via `withCredentials`.
- Going through the web server would add a network hop and gain nothing.

**Trade-off to name:** the API has two kinds of caller, the browser and the web server. CORS and cookies must work for both (see section 3).

---

## Caching: `refreshQuery` vs `invalidateQueries`

After every write, we call our own helper (`web/src/lib/query.ts`, decision #52):

```ts
export const refreshQuery = async (queryClient, router, queryKeys) => {
  for (const queryKey of queryKeys) queryClient.removeQueries({ queryKey });
  await router.invalidate();
};
```

What each TanStack Query call does to a cached list:

| Call | What it does to the cache entry | What happens in this app |
|---|---|---|
| `invalidateQueries` | Marks it stale, then refetches only queries a mounted `useQuery` is watching (`refetchType: "active"` by default) | Nothing is watched: pages read through `Route.useLoaderData()`. **No refetch; the old list stays** |
| `refetchQueries` | Refetches now, with the stored query function | Fails for data fetched during the server render: functions don't survive the hand-over to the browser (from the `refreshQuery` JSDoc, #52) |
| `resetQueries` | Puts the entry back to its initial state, then refetches active queries | Same "no watcher" problem |
| **`removeQueries` + `router.invalidate()`** | **Deletes the entry, then reruns the route loaders** | The loader's `ensureQueryData` finds nothing cached and fetches. **Fresh data, every time** |

---

## Why `invalidateQueries` alone leaves the screen stale

From `@tanstack/query-core` 5.100.14, `queryClient.js`:

```js
ensureQueryData(options) {
  const cachedData = query.state.data;
  if (cachedData === void 0) return this.fetchQuery(options);   // only fetches when nothing is cached
  if (options.revalidateIfStale && query.isStaleByTime(...)) void this.prefetchQuery(...);
  return Promise.resolve(cachedData);                           // otherwise: cached data, stale or not
}
```

1. `invalidateQueries` marks the entry stale, but no `useQuery` is watching it, so nothing refetches.
2. `router.invalidate()` reruns the loader.
3. The loader calls `ensureQueryData`, which **still returns the old data**, because the entry exists.

Removing the entry is the only one of these calls that makes `ensureQueryData` fetch.

**The idiomatic alternative a reviewer will raise:**
- Keep `ensureQueryData` in the loader, but read the data in the component with `useSuspenseQuery(sameOptions)` instead of `useLoaderData()`.
- That gives the cache a watcher, so a plain `invalidateQueries` would work and `staleTime` would apply.
- `refreshQuery` is the cost of reading through `useLoaderData`. Switching is a reasonable follow-up.

---

## Caveat: how stale can a list get?

- The 30-second `staleTime` in `query-provider.tsx` **never applies to loader reads**: `ensureQueryData` ignores staleness unless `revalidateIfStale: true` is passed.
- So pressing Back to a list shows the cached copy until Query's garbage collector removes it: **5 minutes by default** (`gcTime`, not overridden).
- **What limits the risk today:**
  - every write in the app calls `refreshQuery`;
  - live ntfy notifications call `refreshQuery` when a dispute's status changes.
- **Still not covered:** another admin's change, made in another browser, while you sit on a cached page.
- **Fix, if wanted:** add `revalidateIfStale: true` to the list loaders. The cached page shows immediately and a background refetch replaces it. That's a small change, not made in this PR.

---

## If we stopped using TanStack, what's the gap?

- **Not filtering or sorting.** Those are SQL on the API and wouldn't change.
- **Caching.**
  - Back would refetch every time.
  - Identical requests wouldn't be deduplicated.
  - Every write would need hand-written cache clearing.
- **The URL as state.**
  - Search params would be untyped strings parsed by hand.
  - Today, a bad `?sort=` fails the shared Zod schema before any request is made.
- **Server rendering plus the server-to-server data path.** Without Start we'd need another SSR framework, or render only in the browser. That would show a blank page or a loading flash, and would put the API directly in front of every read.
- **The pattern:** every read is a loader (#51). Without that rule, fetching drifts into `useEffect`, which brings request waterfalls and loading flicker.

**Answer:** the gap is caching, server rendering and a consistent pattern for data reads. Filtering and sorting don't depend on it.

---

<!-- _class: lead -->

# 3. Authentication & authorisation

"How does the session hand-over happen? How does TanStack send the cookie so the API knows who is signed in?
How is a user identified, exactly?"

---

## Sign-in: from email to cookie

```
Browser                         api :8080 (Fastify + Better Auth)                Postgres / Mailpit
  │ POST /v1/auth/otp/request {email} ─►  emailOTP plugin: 6-digit code ─────────► verification row (hashed)
  │                                       sendVerificationOTP() ─────────────────► email with the code
  │ POST /v1/auth/otp/verify {email,otp} ─► auth.api.signInEmailOTP({ asResponse: true })
  │                                       ├─ code matches, not expired, attempts left?
  │                                       ├─ INSERT session (token, user_id, expires_at, ip, user_agent)
  │                                       ├─ auth_audit_log: LOGIN_SUCCESS / LOGIN_FAILURE / OTP_LOCKED
  │                                       └─ new-device alert email if this user agent is new to the account
  │ ◄── 200 + Set-Cookie: transaction-dispute-portal.session_token=<token>.<HMAC signature>
  │         HttpOnly; Path=/; SameSite=Lax (Strict in production); Secure in production
```

- **No passwords** (`emailAndPassword: { enabled: false }`). The emailed code is the only credential (#21).
- **The code:** 6 digits, valid for 10 minutes, at most 5 attempts, stored **hashed** (`storeOTP: "hashed"`).
- **No self sign-up** (`disableSignUp: true`). Customers are seeded; admins join by invite.
- **Rate limits:** `/otp/request` 5 per minute, `/otp/verify` 10 per minute, and 100 per minute for every other route.
- **The hand-over:** `verifyOtp` copies Better Auth's `Set-Cookie` onto our own reply (`forwardSessionCookies`). The browser stores the cookie, and that's the whole hand-over.

---

## What the cookie is, and isn't

- **It's an opaque random token plus a signature, not a JWT.**
  - It carries no claims: no user id, role or email.
  - The value is `<32-character token>.<HMAC-SHA256 of the token, keyed with BETTER_AUTH_SECRET>`.
- **HttpOnly, so JavaScript can't read it.** Verified in Chrome: `document.cookie` contains no session cookie. An XSS bug can't steal the token, although it could still make requests as the user.
- **The truth is in the database.** The `session` table holds `token`, `user_id`, `expires_at`, `ip_address` and `user_agent`.
  - Signing out deletes the row, so the token stops working immediately.
  - A stolen-but-signed-out cookie is useless.
- **Lifetime: Better Auth's defaults** (`better-auth/dist/context/create-context.mjs`; we set no `session` options).
  - Sessions last **7 days**.
  - Expiry is pushed forward at most **once a day** while the session is in use (`updateAge`).

---

## How the cookie reaches the API, on both paths

**1. Browser → API (writes, and the Network-tab demo).**
- axios uses `withCredentials: true`, so the browser attaches the cookie to `:8080`.
- Cookies are scoped by **host, not port**, and `localhost:3000` and `localhost:8080` are the same site.
- CORS allows exactly one origin (`CORS_ORIGIN = http://localhost:3000`) with `credentials: true`. Any other origin's page can't read the responses.

**2. Browser → web → API (every read).**
- The browser sends the cookie to `:3000` too, because cookies ignore the port.
- In the server function, `forwardCookie()` reads it from the incoming request (`getRequest().headers.get("cookie")`) and copies it into the server-side axios call to `http://api:8080`.

```ts
export const forwardCookie = (extra = {}) => {
  const cookie = getRequest().headers.get("cookie");
  return cookie ? { ...extra, headers: { ...extra.headers, cookie } } : extra;
};
```

The web server never decodes, stores or trusts the cookie. It **passes it through unchanged**, and only the API decides who you are.

---

## How the API identifies the caller, on every request

`app.authenticate` runs before the handler on every protected route (`api/src/middleware/authenticate.ts`):

```ts
const result = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
if (!result?.session || !result.user) return reply.status(401).send({ code: "UNAUTHENTICATED", redirectUrl: "/sign-in" });
request.user = { id, name, email, role, … };   request.session = { id, token, expires_at, … };
```

What `getSession` does, with the two queries taken from the Drizzle log:

1. **Reads the cookie** `transaction-dispute-portal.session_token`.
2. **Checks the HMAC signature** with `BETTER_AUTH_SECRET`. A forged or edited cookie fails here, with no database query.
3. `select … from "session" where "session"."token" = $1`: **does the session exist, and is it unexpired?**
4. `select … from "user" where "user"."id" = $1`: **loads the current user, including `role`.**

The role is read fresh on every request, so demoting a user takes effect on their next request.

---

## Authorisation: three layers, and only two of them are security

| Layer | Where | What it does | Is it security? |
|---|---|---|---|
| **Route guard** | `web/src/routes/_authenticated.tsx` | Root `beforeLoad` fetches the session through the `sessionRequest` server function. No user → redirect to sign-in; an admin on a customer page or the reverse → redirect | **No: user experience only.** Anyone can call the API directly |
| **Role** | `preHandler: [app.authenticate, app.authorize(USER_ROLE.ADMIN)]` | Wrong role → `403 FORBIDDEN` | **Yes** |
| **Ownership** | Repository queries | Every customer query includes `eq(DisputeModel.user_id, userId)`. Another customer's dispute → **`404`, not `403`**, so a guessed id doesn't reveal whether the dispute exists | **Yes** |

- `role` is a Better Auth `additionalField` with `input: false`. **A client can't set its own role** through any auth endpoint.
- Admin accounts exist only through a one-time invite (#16).

**Demo:** signed in as a customer, run in the browser console:
`fetch("http://localhost:8080/v1/admin/disputes", { credentials: "include" }).then(r => r.status)` → `403`.

---

## What else protects the session

- **CSRF** (another site making requests as you):
  - `SameSite=Lax` (Strict in production) keeps the cookie off cross-site requests.
  - Every write uses `Content-Type: application/json`, which forces a CORS preflight that only `:3000` passes.
- **Audit trail:**
  - `auth_audit_log` records every sign-in success, failure and lockout, with IP and user agent.
  - A sign-in from a browser the account hasn't used before triggers a **new-device email** (`databaseHooks.session.create`).
- **Headers:** `@fastify/helmet` adds a Content-Security-Policy and the other standard security headers.
- **Secrets:** `BETTER_AUTH_SECRET` and `COOKIE_SECRET` are generated per environment (`docs/production-runbook.md` §2).

---

## Auth caveats, before someone asks

- **The dev query log prints session tokens.** Drizzle's logger writes bound parameters as-is, so `docker compose logs api` shows the raw token from step 3. That's why the logger is off outside development; production would need a logger that redacts parameters.
- **Tokens are stored as-is** in `session.token`, which is Better Auth's default. Anyone who can read the database can take over live sessions; restrict who can read it.
- **One database round trip per request, for the session and user lookups.** The load test (#48) showed this is the ceiling for signed-in routes. The fix is Better Auth's `cookieCache` or a short-lived session cache, at the cost of role changes taking effect after a delay.
- **Production cookie domain is still to decide.** With `app.` and `api.` subdomains, the API's cookie must still reach the web server. The two options are a shared parent domain or one origin behind a proxy (`docs/production-runbook.md`, decision still open).
- **`better-auth` has a critical advisory** (section 7). It's in OAuth code we don't enable, but upgrade anyway.

---

<!-- _class: lead -->

# 4. Drizzle

"ORM or query builder? Can you always derive the SQL that runs, and log it?"

---

## A query builder with types; the terms are SQL's

From `api/src/database/repository/transaction.ts`:

```ts
const probed = await executor
  .select({ ...CUSTOMER_COLUMNS, seek: page.seek })
  .from(TransactionModel)
  .where(and(eq(TransactionModel.user_id, userId), page.where))
  .orderBy(...page.orderBy)
  .limit(page.limit);
```

- **Answer: a query builder.** `select`, `from`, `innerJoin`, `where`, `orderBy` and `limit` map 1:1 to SQL.
  - No lazy loading, no identity map, no queries run behind your back.
- **Types come from the schema.** A misspelled column is a compile error, and the result type is inferred.
- **When the builder has no word for it, use `sql\`…\``.** That's still parameterised, and the cursor's row comparison and `to_char(…)` are written this way.

---

## Yes, you can always see the SQL. This is the captured log line

From `docker compose logs api` after clicking Next on the review queue:

```sql
select "dispute"."id", …, "transaction"."merchant_name", "transaction"."amount_cents", "user"."name", "user"."email",
       array[("dispute"."status")::text, to_char("dispute"."created_at" at time zone 'UTC', '…'), ("dispute"."id")::text]
from "dispute"
  inner join "transaction" on "dispute"."transaction_id" = "transaction"."id"
  inner join "user" on "dispute"."user_id" = "user"."id"
where ("dispute"."status", "dispute"."created_at") >= ($1, $2)
  and (("dispute"."status", "dispute"."created_at") > ($3, $4)
       or (("dispute"."status", "dispute"."created_at") = ($5, $6) and ("dispute"."id") < ($7)))
order by "dispute"."status" asc, "dispute"."created_at" asc, "dispute"."id" desc
limit $8
-- params: ["SUBMITTED", "2026-02-20T04:19:10.907000Z", …, "01a1602b-0eb9-…", 11]
```

That's the cursor seek, with the extra 11th row used to tell whether a next page exists.

---

## Three ways to see the SQL

1. **Logged in development.** `drizzle(client, { logger: !isProduction && !isTesting })` in `api/src/database/config.ts`.
2. **Without running the query.** `.toSQL()` on any query returns `{ sql, params }`.
3. **Captured for benchmarking.** `docs/list-query-performance/scripts/capture-current.ts` swaps in a logger, calls the real repository functions and times the exact SQL. That's how the 435 ms regression was found.

**Demo:** run `docker compose logs -f api | grep Query:`, then click Next and change the sort.

**Caveat:** the logger prints parameters verbatim, including session tokens (section 3). Development only.

---

<!-- _class: lead -->

# 5. HTTP/2 vs HTTP/1.1

"What are the benefits for a web app talking to its backend?"

---

## What HTTP/2 buys a web app

- **Many requests on one connection** (multiplexing).
  - With HTTP/1.1 a browser opens about 6 connections per origin and queues the rest.
  - One slow response blocks the others queued behind it on that connection.
- **Header compression (HPACK).** Repeated headers, like the session cookie on every request, are sent once and then referenced.
- **One TLS handshake** for everything on that origin.
- **Server push is gone:** browsers removed it, so it's no longer a reason to adopt HTTP/2.

Where it helps here: the admin page loads the list and the status summary in parallel, and pages fetch their JS modules in parallel.

---

## Where this repo stands. Measured

Chrome's `performance.getEntriesByType(...)`, read on the running app:

```json
{ "navigation": "http/1.1", "_serverFn and :8080 requests": ["http/1.1"] }
```

- **HTTP/1.1 everywhere today**: Vite's dev server, Fastify's default listener, and the web → API hop.
- **Browsers only use HTTP/2 over TLS,** and the dev stack is plain `http://localhost`. This is expected.
- **In production:**
  - Terminate HTTP/2 or HTTP/3 at the load balancer / Ingress (`docs/production-runbook.md`).
  - Inside the VPC, the LB → app hop and the web → API hop stay HTTP/1.1 keep-alive, which is where most deployments leave them.
- **Inside Fastify, if ever needed:** `fastify({ http2: true, https: { key, cert } })`.

**Answer:** the benefits are real for browser ↔ edge traffic. Get them at the load balancer, not by changing the app.

---

<!-- _class: lead -->

# 6. Input validation & the API contract

"How does the backend reject bad input? Is there a contract? Can the code return JSON that differs from it?"

---

## One contract, two sides

- `shared/src/schema/*.ts` defines every request body, query and response in **Zod**.
- **API:** every Fastify route declares `schema: { body | querystring | params, response: { 200, 401, 403, 422, … } }`, using `fastify-type-provider-zod`'s `validatorCompiler` and `serializerCompiler`.
- **Web:** the same schemas validate URL search params (`validateSearch`) and type every response.
- **Change a field in `shared`, and both packages stop compiling until they agree.**

---

## Bad input is rejected before our code runs. Captured responses

```http
GET /v1/admin/disputes?sort=user_id
→ 422 {"code":"VALIDATION_ERROR","message":"Validation error.",
       "errors":[{"field":"sort","message":"Invalid option: expected one of \"created_at\"|\"merchant\"|\"amount_cents\"|\"status\"|\"customer\""}]}

GET /v1/admin/disputes?limit=500&from=2026-05-01&to=2026-01-01
→ 422 {"code":"VALIDATION_ERROR","message":"Validation error.",
       "errors":[{"field":"limit","message":"Too big: expected number to be <=100"},
                 {"field":"from","message":"`from` must be on or before `to`"}]}
```

- Fastify validates against the Zod schema **before the handler**. `api/src/middleware/error.ts` turns failures into the shared error envelope.
- **Every** problem is reported in one response, not just the first.
- Rules that span fields are checked too: `from ≤ to`, `min ≤ max`, and a cursor that matches its sort.
- **Sort columns come from an allow-list.** `sort` is never interpolated into SQL.

**Demo:** run the first `fetch` above in the browser console while signed in.

---

## Can the code return JSON that breaks the contract? Two guards, both tested

**At compile time.** Every service maps database rows through a typed `toWire(row): Dispute`. Renaming `status` to `state` in `api/src/modules/dispute/service.ts`:

```
$ tsc --noEmit
src/modules/dispute/service.ts(37,2): error TS2353: Object literal may only specify known properties,
  and 'state' does not exist in type '{ id: string; …; status: "SUBMITTED" | "UNDER_REVIEW" | … }'.
```

CI runs `typecheck`, so this can't merge.

**At run time.** The Zod serializer checks every response against its schema. Tested on Fastify with the same compiler:

| Handler returns | Client receives |
|---|---|
| `{ id, amount_cents: 100, user_id: "secret" }` (an extra key) | `200 {"id":"d1","amount_cents":100}`: **the extra key is stripped** |
| `{ id, amount_cents: "100" }` (wrong type) | **`500`** `FST_ERR_RESPONSE_SERIALIZATION`: "Response doesn't match the schema" |

So an internal column can't leak, and malformed JSON is never sent. In the app, our error handler reshapes that `500` into the shared envelope.

**Gap:** a route's reply type includes the generic error envelope, so the compiler won't catch every shape mistake. The serializer is the safety net.

---

<!-- _class: lead -->

# 7. npm vulnerabilities & the supply chain

"How do you check packages? `npm audit`, IBM's `audit-ci`?"

---

## We ran it while preparing this: `pnpm audit`

**110 advisories:** 5 critical, 42 high, 54 moderate, 9 low. 104 of them are on production dependency paths.

| Critical | Exposure here |
|---|---|
| `@tanstack/react-start`: reflected XSS in the Start server | `web` runs Start: **upgrade first** |
| `better-auth`: OAuth state usable as a magic link | We use email OTP only, no OAuth, but upgrade anyway |
| `tinypool` ×2: prototype pollution leading to remote code execution | Comes in with the test runner |

The highs include `fast-uri`, `axios`, `nodemailer`, `fastify`, `seroval` and `vite`.

**CI doesn't run an audit today. That's the gap.**

---

## What's already in place, and what to add

**In place:**
- **`--frozen-lockfile` in CI:** installs exactly what the lockfile says, with no silent upgrades.
- **`save-exact=true`:** versions are pinned, not `^` ranges.
- **Only `esbuild` may run install scripts** (pnpm `allowBuilds`). `postinstall` is the classic supply-chain payload.

**To add:**
1. **An audit step in CI that fails on high or critical.**
   - `pnpm audit --prod --audit-level high`, or `npx audit-ci --high`.
   - Keep an allow-list file for advisories that were reviewed and accepted.
2. **Upgrade the criticals:**
   - first `@tanstack/react-start` and `better-auth`;
   - then `axios`, `fastify`, `nodemailer` and `vite`.
3. **pnpm `minimumReleaseAge`:** don't install releases younger than a few days. Hijacked versions are usually pulled within that window.
4. **Dependabot or Renovate** for small, reviewable upgrade PRs.

---

<!-- _class: lead -->

# 8. Bonus: Next.js vs this stack

---

## Same job, different shapes

| | Next.js (App Router) | This stack |
|---|---|---|
| Rendering | React Server Components by default | React components, server-rendered by TanStack Start |
| Routing | File-based; `searchParams` are plain strings | File-based; search params **typed and validated with Zod** |
| Reads | `async` server components; `fetch` cache | Route loaders, the TanStack Query cache, server functions |
| Writes | Server Actions: an RPC POST to the Next server | Typed REST calls to a versioned API |
| What DevTools shows | Server Actions: a POST to the page URL with a `Next-Action` header | Server functions: a GET to `/_serverFn/<id>` (section 2) |
| Caching | Several framework layers (fetch, data, full route, router) | One explicit cache: Query keys plus `refreshQuery` |
| Backend | Route handlers inside the Next app | **A separate Fastify API** under `/v1`, scaled on its own |
| Build | Next's own (Turbopack) | Vite |

**Same opacity in both:** server functions and Server Actions are both framework RPC, so neither looks like a REST call in DevTools.

---

## Where Next.js is the better choice

- **Content-heavy, mostly-read sites:** Server Components, streaming and static generation shine there.
- **Ecosystem and hiring:** far more documentation, examples, libraries and engineers who already know it.
- **Built-ins:** image optimisation, middleware, incremental static regeneration (ISR), fonts.
- **One deployable:** keeping the UI and endpoints together is simpler when the web app is the only client.

---

## Why this stack fits a dispute portal

- **The API is the product boundary.**
  - A mobile app, a back-office tool or another bank system can call `/v1` directly.
  - In Next, the API tends to grow inside the web app.
- **One contract both sides compile against** (the Zod schemas in `shared`). Server Actions are typed inside one app, but they aren't a contract another client can use.
- **Caching you can see.** One cache, named keys, one refresh helper. It has a known stale window (section 2), which can be fixed with one flag.
- **Auth lives in one place.** Only the API reads the session; the web server just passes the cookie through (section 3).
- **Independent scaling and deploys:** the API is stateless (`docs/infrastructure.md`).
- **The costs:**
  - two deployables and more wiring;
  - a younger framework with a smaller ecosystem;
  - an RPC layer that hides the real REST call from DevTools.

---

## Bottom line

> Next.js is built for **one app** that renders pages and serves its own data.
> This stack is built for **one stable API** that any number of clients can use.

- **For a bank's dispute flow,** separating them is worth the extra wiring: other channels will need the API, and contracts and auth should stay in one place.
- **For a marketing site or a single-client internal tool,** Next.js would be faster to build.

---

## Questions to be ready for

| Question | Answer |
|---|---|
| Why no total count? | Counting a million rows on every page cost 450 ms. Nobody needs "page 43,712 of 105,000"; the status cards give the totals that matter |
| What if a row is inserted while paging? | A cursor names a row, not a position, so nothing repeats or is skipped (unlike `OFFSET`) |
| Why does the Network tab show `/_serverFn/…`? | Reads are TanStack server functions: an RPC call to the web server, which calls the API server to server (section 2) |
| Why `removeQueries` and not `invalidateQueries`? | Nothing watches our queries, and `ensureQueryData` returns cached data even when it's stale (section 2) |
| Where is the user's identity? | In the database. The cookie is a signed, random token; each request looks it up (section 3) |
| Can the web server pretend to be someone else? | It only forwards the browser's cookie. The API checks the signature and the session row |
| Why not raw SQL? | Postgres runs the same statement either way, and Drizzle adds types. Measured difference: microseconds |
| What would you do next? | An audit step in CI, the upgrades, `revalidateIfStale` on lists, a session cache, `pg_trgm` for search |

---

# Thank you

- Pagination evidence: `docs/list-query-performance.md`
- Decisions: `docs/progress-and-decisions.md` (#21, #48, #51, #52, #68–#70)
- This deck: `docs/presentation/engineering-exchange.md`
