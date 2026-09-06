# Enhancement suggestions

Concrete improvements to what already exists on disk (the uncommitted API skeleton
pass 1 — `shared/` restructure, `api/src/{build,app}.ts`, `core/`, `middleware/`,
`modules/check/`). Each entry: the problem, how the code connects today, the
suggested change, and what the new flow buys.

Ordered by submission value — the first two are the difference between "a
skeleton" and "a working portal"; the rest are hardening of code that is already
written.

> **Status (2026-08-31):** #3, #4, and #6 are moot — the generic query builder
> they patch was deleted (see `overkill-implementation.md` #1); the modules write
> plain Drizzle. #7 (`readyz` DB probe timeout) and #8 (shutdown order) are done.
> #5 is done both halves: every list query appends the primary key as an order
> tiebreak, and submit idempotency is handled by the partial unique index +
> global 409 handler — **not** the `Idempotency-Key` column this doc proposed
> (`docs/decisions.md` #40 rejected that as machinery the DB constraint already
> covers). #1, #2, #9, #10 remain Week-3 work.
>
> **Update (2026-09-06):** #2 is done — the Vitest integration suite exists
> (`docs/decisions.md` #47). A second batch of findings, from a backend audit, is
> in the **Backend audit — 2026-09-06** section at the end of this file.

---

## 1. No customer-facing flow runs end to end

**Problem.** The definition of done opens with "View / dispute / historic-view all
work end-to-end" and "Dispute lifecycle enforced server-side". Neither is
started. The only mounted routes are `/healthz` and `/readyz`.

**How it connects today.**
- `api/src/route/index.ts` registers exactly one plugin: `healthRoute` under the
  (empty) `HEALTH` prefix.
- `core/` has `User` / `Transaction` / `Dispute` / `DisputeAuditLog` repos and
  `BetterAuth`, all wired onto `app.core` in `middleware/index.ts`, but nothing
  calls them.
- Better Auth HTTP routes (`/v1/auth/*`) are deliberately not mounted — the
  `authenticate` middleware calls `auth.api.getSession()` directly, so login
  itself has no HTTP surface yet.
- `shared/src/schema/global.ts` already defines
  `paginationSortAndSearchQuerySchema` and `paginatedGlobalResponseSchema` for
  list endpoints that don't exist.

**Suggested change.** Build pass 2 as `api/src/modules/*` siblings of
`modules/check/`, each a `{ route, service, type }` triple:

- `modules/authentication/` — `POST /v1/auth/otp` (request code),
  `POST /v1/auth/otp/verify` (exchange code for session, forward `set-cookie`),
  `POST /v1/auth/sign-out`. Thin wrappers over `app.core.betterAuth`. Write
  `auth_audit_log` rows (`OTP_REQUESTED` / `LOGIN_SUCCESS` / `LOGIN_FAILURE` /
  `OTP_LOCKED`) around each call.
- `modules/transaction/` — `GET /v1/transactions` (the signed-in user's, paged),
  `GET /v1/transactions/:transactionId`. `preHandler: [app.event(...), app.authenticate]`.
- `modules/dispute/` — `GET /v1/disputes`, `GET /v1/disputes/:disputeId`,
  `POST /v1/disputes` (submit; see suggestion #5 for idempotency).
- `modules/admin/` — `GET /v1/admin/disputes`,
  `POST /v1/admin/disputes/:disputeId/resolve`, both behind
  `app.authorize(USER_ROLE.ADMIN)`.
- A seed script under `api/src/database/` (users, ~1k transactions across a
  handful of accounts, a spread of disputes in every status).

Extend `EVENT_NAMES` in `api/src/lib/constant.ts` with one entry per new route.

**Resulting flow & benefit.** A customer can sign in, list their transactions,
open a dispute, and watch its status; an admin can list the queue and resolve.
That is the artifact the panel is asked to evaluate — everything else in this
file is polish on top of it.

---

## 2. Zero tests, and Vitest is not installed

**Problem.** The definition of done names four tests explicitly (cross-user read
isolation, admin-only resolve reachable/unreachable, duplicate-dispute
rejection, probes wired to k8s). None exist. `api/vitest.config.ts` is an empty
file, `api/package.json` has no `vitest` dependency and no `test` script.
`.github/workflows/build.yml` runs `pnpm test`, which currently passes because
no package defines the script — so CI is green on zero coverage.

**How it connects today.** `api/src/build.ts` exports `build(logger?)`
specifically so a test can construct a fully-wired app with no `listen()` call —
that seam is the intended test entry point and is unused.

**Suggested change.**

```jsonc
// api/package.json
"scripts": {
	"test": "vitest run",
	"test:watch": "vitest"
},
"devDependencies": {
	"vitest": "3.2.4"
}
```

```ts
// api/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
		fileParallelism: false,
	},
});
```

Then, against a disposable Postgres (Testcontainers, or a
`docker compose` DB in CI), per module:

- `modules/dispute/dispute.test.ts` — user A cannot `GET /v1/disputes/:id` for a
  dispute owned by user B (expect `404`, not `403` — don't confirm existence);
  a second `POST /v1/disputes` for the same transaction is rejected.
- `modules/admin/admin.test.ts` — `POST /v1/admin/disputes/:id/resolve` returns
  `403` with a customer session and `200` with an admin session.
- `core/helpers.test.ts` — only if the generic query builder survives suggestion
  `overkill #1`; if it does, its `buildWhere` operator matrix needs coverage
  because it is hand-rolled SQL generation.

**Resulting flow & benefit.** `pnpm test` starts meaning something, CI fails
loudly on a regression, and the security-relevant claims (tenant isolation, role
gating) are demonstrated rather than asserted in prose. For a promotion
submission this is the difference between "I know how to test" and "I tested it".

---

## 3. `manyRecords` counts the whole table on every list call, and the result shape contradicts the wire schema

**Problem.** Two issues in one function:

1. Every paginated read runs an unfiltered `count(*)` over the entire table, in
   addition to the filtered count and the page query. On the "voluminous seed
   data" the brief leans on, that is a full sequential scan on every page view —
   exactly the pattern a reviewer probes when asking about pagination cost.
2. `Pagination<T>` returns `{ count, total }` where `total` is the unfiltered
   table count and `count` is the filtered count. But
   `shared/src/schema/global.ts`'s `paginatedGlobalResponseSchema` documents
   `total` as "items returned in this page" and `count` as "items available".
   The names mean opposite things on the two sides, and neither side exposes the
   page length.

**How it connects today.** `core/helpers.ts` → `manyRecords` runs three queries
in `Promise.all`:

```ts
const [totalResult, filteredResult, records] = await Promise.all([
	executor.select({ count: sql<number>`count(*)` }).from(table),
	executor.select({ count: sql<number>`count(*)` }).from(table).where(where),
	executor.select(select).from(table).where(where).orderBy(...order).limit(limit).offset(offset),
]);
```

Every repo's `many()` (`User`, `Transaction`, `Dispute`, …) returns this shape
unchanged.

**Suggested change.** Drop the unfiltered count. Return one filtered total plus a
derived page count, and align the names with the schema:

```ts
export type Page<T> = {
	items: T[];
	page: number;
	limit: number;
	totalItems: number;
	totalPages: number;
};

export const manyRecords = async <TModel>(
	executor: Executor,
	table: PgTable,
	options: FindAllOptions<TModel>,
): Promise<Page<TModel>> => {
	const where = buildWhere(table, options.where);
	const order = buildOrder(table, options.order);
	const select = buildSelect(table, options.select);

	const limit = clampLimit(options.limit);
	const page = Math.max(options.page ?? DEFAULT_PAGE_NUMBER, DEFAULT_PAGE_NUMBER);
	const offset = (page - DEFAULT_PAGE_NUMBER) * limit;

	const [totalResult, records] = await Promise.all([
		executor.select({ count: sql<number>`count(*)` }).from(table).where(where),
		executor.select(select).from(table).where(where).orderBy(...order).limit(limit).offset(offset),
	]);

	const totalItems = Number(totalResult[0]?.count ?? 0);

	return {
		page,
		limit,
		totalItems,
		totalPages: Math.max(Math.ceil(totalItems / limit), 1),
		items: records as TModel[],
	};
};
```

Update `paginatedGlobalResponseSchema` field names/descriptions to match
(`totalItems`, `totalPages`), and the repo generic return types.

**Resulting flow & benefit.** One count query instead of two per list call, the
one that remains answers a question a client actually asks ("how many match my
filter"), and the field a consumer reads means the same thing in the type, the
schema, and the JSON. If an exact grand total is ever wanted for an unfiltered
admin view, `pg_class.reltuples` gives an estimate for free — worth a one-line
note in `docs/scaling-and-resilience.md`.

---

## 4. `limit` is unbounded

**Problem.** A client can request `?limit=1000000` and get a million-row page —
a trivial way to pin the DB and the event loop.

**How it connects today.** `manyRecords` does `options.limit ?? DEFAULT_PAGE_LIMIT`
with no ceiling. `shared/src/schema/global.ts` types `limit` as a bare string
with a default, no `max`.

**Suggested change.** Clamp in one place in `core/helpers.ts`, and add a matching
`MAX_PAGE_LIMIT` to `shared/src/constant.ts`:

```ts
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from "@transaction-dispute-portal/shared";

const clampLimit = (value?: number): number => {
	if (!value || value < 1) return DEFAULT_PAGE_LIMIT;
	return Math.min(value, MAX_PAGE_LIMIT);
};
```

Optionally also `.pipe(z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT))` on the
query schema so an over-limit request is a clean `422` rather than a silent
clamp — pick one behaviour and document it.

**Resulting flow & benefit.** Worst-case page size is bounded no matter what the
client sends, and the bound lives next to `DEFAULT_PAGE_LIMIT` instead of being
implicit.

---

## 5. Pagination ordering is not guaranteed stable, and submit is not idempotent

**Problem.** Two related gaps that both bite the dispute flow:

1. `buildOrder` falls back to a column literally named `created_at`, and if the
   table has none it returns `[]` — no `ORDER BY`. Postgres is then free to
   return rows in any order, so `offset`-based pages can repeat or skip rows.
   Even with `created_at`, ties (same millisecond) aren't broken, so the last
   row of one page can reappear on the next.
2. "Duplicate-dispute submission (retry / double-click) is rejected, not
   double-inserted" is on the definition of done. The schema has a partial
   unique index (`dispute_open_per_transaction_uq_idx`) that stops two *open*
   disputes on one transaction, but a fast double-submit still surfaces as an
   unhandled unique-violation `500` rather than a clean `409`, and a retry after
   a dropped response has no idempotency key to recognise.

**How it connects today.** `buildOrder` in `core/helpers.ts`; the unique index in
`api/src/database/schema/dispute.ts`; `middleware/error.ts` has no branch for a
Postgres `23505`.

**Suggested change.**

Stable order — always append the primary key as a tiebreak, and require an
explicit sort for list endpoints:

```ts
export const buildOrder = <TTable extends PgTable, TModel>(
	table: TTable,
	order?: OrderClause<TModel>,
): SQL<unknown>[] => {
	const fragments = Object.entries(order ?? {}).map(([key, direction]) => {
		const column = table[key as keyof typeof table] as PgColumn | undefined;
		if (!column) throw new InvalidQueryError(`Unknown sort column: ${key}`);
		return direction === "desc"
			? sql`${desc(column)} nulls last`
			: sql`${asc(column)} nulls first`;
	});

	const created = table["created_at" as keyof typeof table] as PgColumn | undefined;
	if (fragments.length === 0 && created) fragments.push(sql`${desc(created)} nulls last`);

	const id = table["id" as keyof typeof table] as PgColumn | undefined;
	if (id) fragments.push(sql`${asc(id)}`);

	return fragments;
};
```

Idempotent submit — accept an `Idempotency-Key` header, and map the unique
violation:

```ts
// modules/dispute/service.ts
const submit = async (request, reply) => {
	const key = request.headers["idempotency-key"];
	return request.server.core.connection.transaction(async (tx) => {
		const core = request.server.core.withTransaction(tx);
		const existing = key
			? await core.dispute.one({ where: { idempotency_key: key }, select: { id: true } })
			: null;
		if (existing) return reply.status(200).send(/* existing */);
		/* insert dispute + audit-log row */
	});
};
```

```ts
// middleware/error.ts
if (typeof error.code === "string" && error.code === "23505") {
	const { status, code } = HTTP_RESPONSE_CODE.CONFLICT;
	return reply.status(status).send({ code, message: "That dispute already exists." });
}
```

(Add a nullable `idempotency_key` column + unique index to `DisputeModel`.)

**Resulting flow & benefit.** Page N+1 never re-shows a row from page N regardless
of insert timing; a double-clicked "Submit dispute" returns the same dispute
twice instead of one dispute and one `500`; a client that retries after a
timeout is safe. All three are directly on the checklist.

---

## 6. Repo-layer errors become `500`s instead of `400`s

**Problem.** `buildWhere` / `buildOrder` / `buildSelect` throw a bare
`new Error("Invalid column: …")` when handed a key that isn't a column.
`middleware/error.ts` only special-cases `FST_ERR_VALIDATION` and Better Auth
`APIError`; everything else falls through to a logged generic `500`. The moment
a list endpoint accepts `?sort=` / filter params from the client, a typo in a
query param is a server error, not a client error.

**How it connects today.** `error.ts` branches on `error.code === "FST_ERR_VALIDATION"`,
then `error instanceof APIError`, then the `500` fallback.

**Suggested change.** A typed error the helpers throw and the handler recognises:

```ts
// core/helpers.ts
export class InvalidQueryError extends Error {
	readonly statusCode = 400;
	constructor(message: string) {
		super(message);
		this.name = "InvalidQueryError";
	}
}
```

```ts
// middleware/error.ts
if (error instanceof InvalidQueryError) {
	const { status, code } = HTTP_RESPONSE_CODE.BAD_REQUEST;
	return reply.status(status).send({ code, message: error.message });
}
```

Belt-and-braces: also constrain `sort` in each module's query schema to a
literal union of that resource's sortable columns, so most bad input is caught
at validation before it reaches the repo.

**Resulting flow & benefit.** A bad filter/sort param returns `400` with a
useful message and doesn't spend a line in the error log or page anyone; genuine
`500`s in the log are all genuine.

---

## 7. `readyz` has no timeout on its database probe

**Problem.** The readiness check runs `select 1` with `performance.now()` timing
around it, but nothing bounds the query itself. A half-open connection (network
partition, DB failover in progress) makes the probe hang until Fastify's
`requestTimeout` (120s) fires. Kubernetes then waits a full `timeoutSeconds` per
probe instead of getting a fast "not ready".

**How it connects today.** `modules/check/service.ts` → `readyz` →
`await request.server.core.connection.execute(sql\`select 1\`)` inside a
`try/catch`.

**Suggested change.** Race the probe against a short timeout:

```ts
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
	Promise.race([
		promise,
		new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms).unref(),
		),
	]);

try {
	await withTimeout(request.server.core.connection.execute(sql`select 1`), 2000);
	/* healthy / degraded */
} catch {
	/* unhealthy — unreachable OR too slow to matter */
}
```

**Resulting flow & benefit.** `readyz` answers within ~2s in every failure mode,
so the load balancer drains a wedged instance promptly instead of holding
connections open against it. Pairs naturally with the existing `isShuttingDown()`
drain path.

---

## 8. Shutdown closes the database pool before the HTTP server — DONE (2026-08-30)

Fixed as a side effect of removing `CoreService` (`docs/overkill-implementation.md`
#2): pool teardown moved to an `onClose` hook registered in `middleware/index.ts`,
and `app.ts` now calls only `await app.close()`, so the server stops and
in-flight requests drain before `onClose` ends the pool. The explicit
`app.core.close()` is gone.

**Problem.** On `SIGTERM`, `app.ts` calls `app.core.close()` (ends the
`postgres-js` pool) and then `app.close()` (stops the server, runs `onClose`
hooks). Any request still in flight during `close-with-grace`'s 500ms grace
window loses its connection mid-query and errors, when the whole point of the
grace window is to let those finish.

**How it connects today.**

```ts
closeWithGrace({ delay: 500 }, async ({ signal, err }) => {
	setShuttingDown(true);
	app.log.warn({ signal }, "Draining: no longer accepting new requests");
	await app.core.close();
	await app.close();
	/* … */
});
```

**Suggested change.** Reverse the order — server first, pool last:

```ts
closeWithGrace({ delay: 500 }, async ({ signal, err }) => {
	setShuttingDown(true);
	app.log.warn({ signal }, "Draining: readyz now failing, finishing in-flight requests");
	await app.close();
	await app.core.close();
	if (err) app.log.error({ signal, err }, "Shutdown complete (after error)");
	else app.log.warn({ signal }, "Shutdown complete");
});
```

`app.close()` stops accepting connections and resolves once in-flight requests
drain (or the grace timer fires); only then is it safe to tear down the pool.

**Resulting flow & benefit.** Rolling deploys and pod evictions finish in-flight
disputes cleanly instead of turning a fraction of them into `500`s. It's a
one-line reorder that makes the graceful-shutdown story actually graceful — a
likely follow-up question given the `k8s/` manifests.

---

## 9. A session round-trip to Better Auth on every authenticated request

**Problem.** `authenticate` calls `auth.api.getSession({ headers })` on every
protected route, which hits the `session` table each time. Fine at submission
scale, but "how does this behave under load" is an expected question and the
honest current answer is "one extra DB read per request".

**How it connects today.** `middleware/authenticate.ts` → `auth.api.getSession`,
then maps the result onto `request.user` / `request.session`. No caching layer.

**Suggested change.** Enable Better Auth's signed cookie cache in
`api/src/lib/auth.ts`:

```ts
session: {
	modelName: "session",
	fields: { /* … unchanged … */ },
	cookieCache: { enabled: true, maxAge: 60 },
},
```

Short `maxAge` so revocation still takes effect within a minute; the DB read
drops to once per minute per active session. If even that's unwanted complexity,
the alternative is a one-paragraph note in `docs/scaling-and-resilience.md`
naming the per-request read and why it's acceptable (indexed point lookup on
`session.token`, sub-millisecond, and horizontally scalable with the app).

**Resulting flow & benefit.** Either the hot path loses its per-request DB
dependency, or the tradeoff is documented as a conscious choice rather than
found by the reader.

---

## 10. `web/` is still the placeholder scaffold

**Problem.** `web/src/routes/` is one index route rendering a title string. The
role is "Full Stack" and the definition of done's first line is a UI flow. Week
3 in the suggested pace, but flagged here so it doesn't get squeezed.

**How it connects today.** `web/src/router.tsx` wires `routeTree.gen.ts`; the
production `server.mjs` + `Dockerfile` path is already proven. Nothing consumes
the API.

**Suggested change.** Not code here — the shape: TanStack Router file routes with
**loaders** for every read (never `useEffect` — it's in `CLAUDE.md`), an auth
client calling the pass-2 `/v1/auth/*` endpoints, a `beforeLoad` guard
redirecting to `/sign-in` on `401` (the API already returns `redirectUrl` in the
`GlobalResponse` envelope for exactly this), and three screens: transactions
list, dispute detail/history, admin queue. Reuse the `shared` zod schemas for
form validation so the client and server validate identically.

**Resulting flow & benefit.** The `redirectUrl` field, the paginated envelope,
and the shared schemas all start earning their keep, and the submission
demonstrates the full stack rather than a backend with a proof-of-concept
frontend.

---

# Backend audit — 2026-09-06

A read-through of everything on `pass-2-trims-and-modules` (the four backend
modules: admin-invite, dispute withdraw, account-security emails, the Vitest
suite). Two bugs and two cross-module inconsistencies were **fixed in place** —
`docs/decisions.md` #49 records the split, #45 / #46 carry the detail. The items
below were **deferred**: each is real, none blocks the submission, and several
need a design decision rather than an edit. Ordered by value.

## A1 — new-device alert email had a broken sign-in link · FIXED

`api/src/email/new-device-login.ts` rendered `FRONTEND_URLS.SIGN_IN` (`/sign-in`)
literally into the email body. Now takes an absolute `signInUrl`
(`${env.FRONTEND_URL}${…}`), matching the invite / verification emails.

## A2 — withdraw audit row could record a stale `from_status` · FIXED

The pre-read was outside the transaction and unlocked; an admin `review` landing
between the read and the guarded `UPDATE` made the `dispute_audit_log` row say
`SUBMITTED → WITHDRAWN` for what was really `UNDER_REVIEW → WITHDRAWN`. Fixed with
`SELECT … FOR UPDATE` inside the transaction (`docs/decisions.md` #45); covered by
a new case in `dispute-lifecycle.test.ts`.

## Consistency fixes · FIXED

- `isOpenDisputeStatus` / `isTerminalDisputeStatus` in `shared/util.ts` replace the
  per-file `const TERMINAL: readonly string[] = TERMINAL_DISPUTE_STATUS` widening
  alias in `modules/dispute/service.ts`.
- `POST /v1/auth/change-email` writes an `EMAIL_CHANGE_REQUESTED` `auth_audit_log`
  row, matching the OTP handlers (`docs/decisions.md` #46).
- `web/.env`'s `VITE_APP_NAME` (a hand-copy of `shared`'s `APP_NAME`) deleted —
  nothing consumed it.

---

## E1 — new-device detection is an exact `user_agent` string match

**Problem.** `repository/session.ts` `hasKnownDeviceSession` compares `user_agent`
verbatim, so every browser point-release counts as a new device and emails the
user. The seeded known-device UA is a frozen Chrome-140 string — a reviewer on
any other browser/version gets a new-device alert on their first login.

**Suggested change.** Coarsen the fingerprint: match on a normalised
browser-family + major-version (or browser-family + a rounded IP prefix). Keep the
raw `user_agent` in the row for the email body. This needs a small parsing helper
and a call on how coarse is right — worth a `decisions.md` line when done.

**Benefit.** Alerts fire on genuine new devices, not on Chrome updating itself.

## E2 — the first-ever login fires a "new device" alert

**Problem.** A newly-invited admin who accepts the invite and signs in has no
prior session, so `hasKnownDeviceSession` returns false and they get a "we noticed
a new sign-in" email for the first login of an account they just created.

**Suggested change.** In `alertOnNewDeviceLogin`, skip the alert when the user has
**zero** prior sessions (distinct from "one or more, none matching"). One extra
count, or fold it into the E1 helper.

**Benefit.** The alert means "a device you didn't set up", not "you, just now".

## E3 — best-effort sends fail silently with no signal · partly C

**Problem.** `sendEmail`, `publishDisputeUpdate`, and `alertOnNewDeviceLogin` all
swallow errors. A permanently misconfigured SMTP or ntfy is invisible except for
console noise — no counter, no `/readyz` degradation.

**Suggested change.** Two parts. (a) Route the three `console.error` calls in
`lib/{auth,notifier,mailer}.ts` through the Pino `logger` singleton (they're the
only runtime paths not using it — everything else does). (b) Optionally increment
a module-level failure counter and expose it on a future `/metrics` endpoint
(`docs/production-runbook.md` §8 already plans `prom-client`).

**Benefit.** Structured, level-respecting logs in production; a hook for the
"how would you know email delivery broke" question.

## E5 — `confirmEmailChange` routes both token types through `verifyEmail`

**Problem.** `lib/authentication.ts` sends step 1 (approval token, old address)
and step 2 (verification token, new address) both to `auth.api.verifyEmail`. In
Better Auth 1.7.2 that's correct — both are JWTs the `/verify-email` handler
branches on by `requestType` — but it's an undocumented internal shape. A minor
BA bump that splits the endpoints breaks step 1 as a generic 401 with no signal
it's a wiring problem.

**Suggested change.** Add an integration test that runs the full two-step change
against the real BA instance (submit → follow approval token → follow verification
token → assert `user.email` changed). The suite already has the Mailpit plumbing;
`extractToken` is in `test/helpers/mailpit.ts`. Pin the behaviour so a BA upgrade
that breaks it fails CI loudly.

## E6 — `change-email/confirm` shares the request-side rate limit

**Problem.** `EMAIL_CHANGE_RATE_LIMIT` (`max: OTP.MAX_ATTEMPTS`, i.e. 5 / window)
gates both `POST /v1/auth/change-email` and `.../confirm`. The confirm step is a
link click from an email; a double-click or a client retry burns the budget, and
5 is tight for that.

**Suggested change.** Split into `CHANGE_EMAIL_REQUEST_RATE_LIMIT` and a looser
`CHANGE_EMAIL_CONFIRM_RATE_LIMIT`, and while there stop borrowing
`OTP.MAX_ATTEMPTS` for non-OTP endpoints — a `RATE_LIMIT` constant group in
`shared/constant.ts` (`AUTH_SENSITIVE`, `AUTH_VERIFY`, …) names the intent. Same
applies to `admin-invite`'s `ACCEPT_RATE_LIMIT`.

**Benefit.** The limit for each endpoint reflects that endpoint, and the constant
it reads is named for what it's limiting.

## E7 — `auth_audit_log` still has no `EMAIL_CHANGE_CONFIRMED`

**Problem.** The request side is now audited (`EMAIL_CHANGE_REQUESTED`, #46); the
confirm side isn't, because `.../confirm` has no user context — just a token from
an email.

**Suggested change.** When it's worth the coupling: decode the BA JWT in
`confirmEmailChange` (`jose`, `BETTER_AUTH_SECRET` — we own the secret) to read
`{ email, updateTo, requestType }`, and on a successful `change-email-verification`
write `EMAIL_CHANGE_CONFIRMED` with the old email. Alternatively wait for a BA
version that types `emailVerification.afterEmailVerification` and hook that.

## E8 — env duplication: `API_URL` unset, `CORS_ORIGIN` ≡ `FRONTEND_URL`

**Problem.** `api/.env` pins `FRONTEND_URL` but leaves `API_URL` to its default;
`CORS_ORIGIN` and `FRONTEND_URL` are separate vars holding the same value, so
setting one wrong silently diverges redirects from CORS.

**Suggested change.** Set `API_URL` explicitly in `api/.env` for symmetry, and
default `CORS_ORIGIN` from `FRONTEND_URL` in `lib/env.ts` (keep the override for
the multi-origin case). One-line `env.ts` change.

## E9 — two hardcoded `2000 ms` timeouts, and `VARCHAR_LIMIT = 255`

**Problem.** `lib/notifier.ts` (`PUBLISH_TIMEOUT_MS`) and `modules/check/service.ts`
(`DATABASE_PROBE_TIMEOUT_MS`) each declare their own `2000`. `repository/auth-audit-log.ts`
hardcodes `255` to mirror the schema `varchar` width — a silent over-truncation
risk if the column grows.

**Suggested change.** A small `TIMEOUTS` group in `shared/constant.ts` (or
`env`-driven if a reviewer would want to tune the probe timeout). Derive the
clamp width from the column, or hoist the `255` to one named constant the schema
and the repo both read.

## E10 — `confirmEmailChange` drops the session cookie Better Auth issues

**Problem.** On the `change-email-verification` step, BA creates a session and
calls `setSessionCookie` if the request is unauthenticated. `confirmEmailChange`
uses `asResponse: true` but the handler doesn't forward `Set-Cookie` (unlike
`verifyOtp` / `endSession`), so BA's session is orphaned and the user isn't
logged in after confirming from the link.

**Suggested change.** Decide the intent first: *should* confirming an email change
from a link log you in? If yes, forward the cookies like `verifyOtp` does. If no,
that's fine — but then the orphaned session row is worth a note, or disable
BA's auto-session-on-verify. Either way it's a product call, not just a fix.
