# Over-built parts of the current implementation

> **Status (2026-08-30):** every trim in this doc has landed on branch
> `pass-2-trims-and-modules`. #1 (generic query DSL) — the whole
> `api/src/database/repository/` directory was deleted; Pass 2 adds real Drizzle
> queries per module. #3 (`event` middleware / `EVENT_NAMES` / `X-Event-Name`),
> #4 (dual correlation ids → one, seeded from `x-correlation-id` / `x-request-id`
> via `genReqId`), #5 (custom Pino `LEVELS`), and #6 (three-state `readyz` →
> flat ready/503, plus a 2s DB-probe timeout — also closes `enhance-suggestion.md`
> #7) are all applied. #7 (two rate limiters) — Better Auth's own `rateLimit` is
> now `enabled: false`; the tighter per-route cap on `/v1/auth/otp` lands with the
> auth module in Pass 2. #2 and #8 were already done. `lib/constant.ts` and
> `type/global.ts` are gone as a result.

Machinery in the uncommitted skeleton pass 1 that costs more than it currently
returns. Each entry: what the problem is (why it reads as over-built), how it's
wired today, the suggested trim (with code), and how the flow and the payoff
change.

The throughline: `CLAUDE.md` says, first bullet of Conventions, *"No speculative
abstraction — don't introduce a service/repository/DI layer until there's a
second concrete caller that needs it."* Several of these are that layer, built
ahead of the callers. Most exist because the skeleton mirrors the Ubuntu Stories
house style (`docs/decisions.md` #28) — a reasonable instinct, but the panel
reads this repo against the rule it states, not against a codebase they can't
see. Where a trim diverges from Ubuntu Stories, that divergence needs its own
`docs/decisions.md` entry.

---

## 1. The generic query builder in `core/helpers.ts`

**Problem.** ~370 lines re-implement a slice of Drizzle's own query API: a
`WhereClause` type with nested `OR` / `AND`, an operator DSL
(`lt` / `gte` / `in` / `notIn` / `contains` / `mode`), plus `buildWhere`,
`buildSelect`, `buildOrder`, and generic `manyRecords` / `oneRecord` /
`createRecords` / `updateRecords` / `deleteRecords`. The only caller wired today
is `select 1` in the health check. It is a general-purpose ORM-over-the-ORM
serving zero real queries, and its hand-rolled SQL generation is exactly the
kind of code that needs its own test suite.

**How it connects today.** `core/helpers.ts` exports the builders and the five
generic functions. `core/{user,transaction,dispute,dispute-audit-log}.ts` each
wrap them in a class. `CoreService` instantiates all four. Nothing calls any of
it.

**Suggested change.** Delete the DSL. Write the ~6 queries the portal actually
needs as plain Drizzle, one function per query, in the module that uses them:

```ts
/**
 * The signed-in customer's transactions, newest first, one page.
 */
export const listTransactionsForUser = (
	db: Executor,
	userId: string,
	page: PageParams,
): Promise<Page<TransactionListItem>> =>
	db
		.select({
			id: TransactionModel.id,
			amount_cents: TransactionModel.amount_cents,
			merchant: TransactionModel.merchant,
			occurred_at: TransactionModel.occurred_at,
		})
		.from(TransactionModel)
		.where(eq(TransactionModel.user_id, userId))
		.orderBy(desc(TransactionModel.occurred_at), asc(TransactionModel.id))
		.limit(page.limit)
		.offset(page.offset);
```

Keep one tiny shared helper for the count-plus-page pattern (see
`docs/enhance-suggestion.md` #3) if it repeats — that's a real second caller.
The full where/order/select DSL comes back only if a screen genuinely needs
arbitrary client-driven filtering, and then it's scoped to that screen.

**Resulting flow & benefit.** Each query is a named function whose SQL you can
read in one screen and whose correctness is obvious from the Drizzle call — no
translation layer to audit, no operator-matrix tests to write. The repo shrinks
by a few hundred lines and stops contradicting its own stated convention. Cost:
a new one-off query is ~5 lines to add instead of a method call on an existing
class — acceptable at this scale, and honest about how few queries there are.

---

## 2. `CoreService`, the per-table classes, and `withTransaction` — DONE (2026-08-30)

Implemented: `CoreService` / `TransactableCore` deleted; the four repo classes
became free functions (`manyDisputes(executor, options)` …) in
`api/src/database/repository/`; `BetterAuth` became free functions in
`api/src/lib/authentication.ts`; `middleware/index.ts` now does
`app.decorate("connection", connection)` + an `onClose` hook instead of
`app.decorate("core", …)`; `app.ts` shutdown dropped `app.core.close()` and
relies on the hook (which also fixes the ordering bug — see
`docs/enhance-suggestion.md` #8). A transaction is now
`app.connection.transaction(tx => insertFn(tx, …))`. Needs a `docs/decisions.md`
entry on push (deviation from the Ubuntu Stories class style, #28).

**Problem.** Five classes (`User`, `Transaction`, `Dispute`, `DisputeAuditLog`,
`BetterAuth`), each holding a `private readonly executor` set in a constructor,
aggregated by `CoreService`, which also carries `withTransaction(tx)` that
*re-instantiates* all four data classes bound to a transaction, plus a
`TransactableCore` `Pick<>` type to describe the subset. That is DI-flavoured
plumbing whose payoff scales with the number of distinct transactional
workflows. This app has essentially one (submit dispute = insert dispute + audit
row).

**How it connects today.** `middleware/index.ts`:

```ts
app.decorate("core", { close, connection, ...new CoreService(connection, auth) });
```

`type/fastify.ts` declares `core: Core` (a `CoreService` plus `close` /
`connection`). Call sites would be `app.core.dispute.one(...)`, and inside a
transaction `app.core.withTransaction(tx).dispute.one(...)`.

**What was done.** No `fastify-plugin` dependency added — the decoration stays
inline in `middlewares(app)` alongside `event` / `authenticate` / `authorize`,
consistent with the existing style:

```ts
// middleware/index.ts
app.decorate("connection", connection);
app.addHook("onClose", async () => {
	await close();
});
```

```ts
// type/fastify.ts
interface FastifyInstance {
	connection: typeof connection;
}
```

```ts
// database/repository/dispute.ts — no class, no constructor
export const oneDispute = async <TSelect extends keyof DisputeModelSelect>(
	executor: Executor,
	options: FindUniqueOptions<DisputeModelSelect>,
): Promise<Pick<DisputeModelSelect, TSelect> | null> =>
	(await oneRecord(executor, DisputeModel, options)) as Pick<
		DisputeModelSelect,
		TSelect
	> | null;
```

```ts
// a handler needing a transaction
await request.server.connection.transaction(async (tx) => {
	const [dispute] = await createDisputes(tx, { /* … */ });
	await createDisputeAuditLogs(tx, { data: { dispute_id: dispute.id, /* … */ }, select: { id: true } });
	return dispute;
});
```

Better Auth didn't belong on a "core service" anyway — `lib/authentication.ts`
now holds three free functions (`sendSignInOtp` / `verifySignInOtp` / `signOut`)
that import the `auth` singleton from `lib/auth.js` directly.

**Resulting flow & benefit.** No instantiation, no `withTransaction` (a
transaction is just "pass `tx` where you'd pass `connection`" — the same
functions, unchanged), no `TransactableCore` type, no `CoreService` file, no
`core/` directory. `middleware/index.ts` loses its most complex `decorate` call.
The transaction boundary is visible at the call site
(`connection.transaction(...)`) instead of hidden behind a rebinding method.
Five class files became five modules of small functions. The generic query DSL
in `helpers.ts` was kept (not in scope for this change — see #1). Divergence
from Ubuntu Stories' class style (`docs/decisions.md` #28) — needs a decisions
entry on push noting the no-speculative-abstraction rule won here.

---

## 3. The `event` middleware, `X-Event-Name` header, and `EVENT_NAMES` registry

**Problem.** Every route is required to tag itself with a named event that is
stamped on `request.eventName` and echoed as an `X-Event-Name` response header,
"so logs and downstream middleware can key on intent rather than URL". There is
no downstream middleware keying on it, and `middleware/logging.ts` already logs
`route: request.routeOptions.url`. For ~8 routes the matched route path *is* the
intent. It's infrastructure for a policy layer that doesn't exist, and it adds a
mandatory `app.event(...)` to every route's `preHandler` array.

**How it connects today.** `EVENT_NAMES` in `lib/constant.ts` (2 entries,
both health). `EventName = keyof typeof EVENT_NAMES` typed as a **required**
field on `FastifyRequest` in `type/fastify.ts`, though only the `event`
preHandler sets it — a route that forgets `app.event(...)` has
`request.eventName === undefined` at runtime despite the type. `modules/check/route.ts`
threads `EVENT_NAMES.HEALTHZ` / `.READYZ` through.

**Suggested change.** Drop `event.ts`, `EVENT_NAMES`, the `X-Event-Name` header,
and the `eventName` request field. If structured logs want a stable per-route
key, use the route path Fastify already knows, or add a single `logName` to each
route's `config` object and read it in the existing `onResponse` hook:

```ts
app.route({
	method: "POST",
	url: API_PATHS.DISPUTES,
	config: { logName: "dispute.submit" },
	handler: submit,
});
```

```ts
// logging.ts onResponse
eventName: request.routeOptions.config?.logName ?? request.routeOptions.url,
```

**Resulting flow & benefit.** Routes declare a handler and a schema, nothing
else. One fewer preHandler on every route, one fewer header on every response,
one fewer registry to keep in sync with the route list. If an intent-based
policy layer is ever needed, it's added then, against real requirements.

---

## 4. Two correlation identifiers per request

**Problem.** `build.ts` configures Fastify's own request id
(`genReqId: () => generateUuid()`, `requestIdHeader: "x-request-id"`,
`requestIdLogLabel: "reqId"`). Then `middleware/logging.ts` independently
generates a *second* id (`correlationId`, from `x-correlation-id`, else a fresh
UUID) and sets its own response header. Two IDs doing the same job on every
request; a log reader has to know that `reqId` and `correlationId` are both
"the request id" and which one upstream/downstream systems actually send.

**How it connects today.** `reqId` is on by default in every Pino line via
Fastify. `correlationId` is set in `onRequestTimerHook`, logged explicitly in
the `onResponse` line's `data` object, and echoed as `x-correlation-id`.

**Suggested change.** Keep one. The simplest is to make Fastify's built-in id
*be* the correlation id by having `genReqId` read the inbound header:

```ts
// build.ts
genReqId: (req) =>
	(req.headers["x-correlation-id"] as string) ??
	(req.headers["x-request-id"] as string) ??
	generateUuid(),
requestIdHeader: "x-correlation-id",
requestIdLogLabel: "correlationId",
```

Then delete the `correlationId` field, the manual generation in
`onRequestTimerHook`, and just set the response header from `request.id`.

**Resulting flow & benefit.** One id, named once, present on every log line for
free (Fastify does it), honoured from the inbound header, returned on the
response. `onRequestTimerHook` shrinks to just the `startTime` stamp.

---

## 5. Custom Pino levels that redefine the defaults to their own values

**Problem.** `lib/constant.ts` exports `LEVELS = { trace: 10, debug: 20, info: 30,
warn: 40, error: 50, fatal: 60 }` — the exact standard Pino levels and numbers.
It's wired through as `customLevels` and surfaces as a `CustomLevels` type on
`FastifyBaseLogger`. It changes no behaviour; it's a maintenance surface that
looks like configuration.

**How it connects today.** `lib/logger.ts` passes it to Pino; `type/global.ts`
derives `CustomLevels = keyof typeof LEVELS`; `type/fastify.ts` types the logger
as `pino.Logger<CustomLevels>`.

**Suggested change.** Delete `LEVELS`, `customLevels`, and `CustomLevels`. Let
Pino use its defaults; `FastifyBaseLogger` is already correct without the
augmentation. Set `level` from `env.LOG_LEVEL` and stop there. Reintroduce a
custom level only when there's a real one to add (e.g. an `audit` level) —
adding it then is a two-line change.

**Resulting flow & benefit.** `lib/constant.ts` drops to just `EVENT_NAMES` (and
if #3 is taken too, the file goes away). One fewer type parameter threaded
through the Fastify module augmentation. Nothing about logging output changes.

---

## 6. `readyz`'s three-state, per-subsystem health model for a single dependency

**Problem.** `readyz` builds a `HealthCheck` object per subsystem
(`health` ∈ `HEALTHY` / `DEGRADED` / `UNHEALTHY`, plus `message`,
`responseTimeMs`), computes a `DEGRADED` state for a DB query over 1000ms,
aggregates the subsystems into an overall state with a nested ternary, and maps
that to `200` or `503`. There is exactly one dependency (Postgres) and one
consumer (a Kubernetes readiness probe), and the probe only distinguishes
"ready" from "not ready" — it throws away the `DEGRADED` nuance.

**How it connects today.** `modules/check/service.ts` → `readyz`;
`SERVER_STATUS` three-value enum in `shared/src/constant.ts`;
`readyzResponseSchema` in `shared`; both the `200` and `503` responses serialise
the full nested shape.

**Suggested change.** Two states, flat body:

```ts
export const readyz = async (request, reply) => {
	if (isShuttingDown()) return reply.status(503).send({ code: HTTP_CODE.SERVICE_UNAVAILABLE, message: "Draining." });

	try {
		await withTimeout(request.server.db.execute(sql`select 1`), 2000);
	} catch {
		return reply.status(503).send({ code: HTTP_CODE.SERVICE_UNAVAILABLE, message: "Database unreachable." });
	}

	return reply.status(200).send({
		code: HTTP_CODE.OK,
		message: "Ready.",
		data: { uptimeSeconds: Math.floor(process.uptime()) },
	});
};
```

If a richer status page is wanted later for humans (not the probe), that's a
separate `GET /v1/admin/status` endpoint with its own audience — build it then.

**Resulting flow & benefit.** The probe endpoint answers the one question the
probe asks. `SERVER_STATUS` can drop to a boolean or go away; `readyzResponseSchema`
becomes a two-line object. The `DEGRADED` / slow-query detection moves to where
it belongs (metrics / alerting) instead of a field nobody reads.

---

## 7. Two independent rate limiters (needs a decision, likely redundant)

**Problem.** `@fastify/rate-limit` is registered `global: true` with
`max: env.RATE_LIMIT_MAX` / `env.RATE_LIMIT_WINDOW`, covering every route
including `/v1/auth/*`. Better Auth is *also* configured with its own
`rateLimit: { enabled: true, max, window }` from the same env vars, applying to
its own endpoints. The auth paths are rate-limited twice, by two subsystems,
with the same numbers meaning different things (global bucket vs. per-auth-route
bucket), and `docs/auth.md` / `docs/decisions.md` #21 describe an OTP-attempt
limit that is actually a *third* mechanism (`allowedAttempts: 5` in the
`emailOTP` plugin).

**How it connects today.** `middleware/index.ts` registers `@fastify/rate-limit`
globally; `lib/auth.ts` sets `rateLimit` on the Better Auth instance; the
`emailOTP` plugin sets `allowedAttempts`.

**Suggested change.** Decide the layering explicitly and write it down:

- `@fastify/rate-limit` global — coarse abuse protection for the whole API.
  Keep.
- Better Auth's own `rateLimit` — turn **off** (`enabled: false`) and let the
  global limiter cover its routes, **or** keep it and add a tighter
  per-route override on `/v1/auth/otp` via `@fastify/rate-limit`'s route
  `config` instead, so there's one limiter with one story.
- `allowedAttempts: 5` — this one is genuinely different (wrong-code lockout,
  not request rate). Keep, and make `docs/auth.md` state all three layers and
  what each defends against.

**Resulting flow & benefit.** One request-rate limiter with a clear boundary
instead of two overlapping ones sharing env vars by coincidence; the OTP-attempt
lockout documented as the distinct control it is. Mostly a clarity and
docs-accuracy win — but "why are there two rate limiters" is a predictable
review question with no good answer today.

---

## Not over-built — keeping these

For contrast, a few things that look heavy but earn their place:

- **`build()` / `app.ts` split** — the test seam. Needed the moment suggestion #2
  in `docs/enhance-suggestion.md` lands.
- **`lib/env.ts` zod singleton** — fail-fast on misconfig with a per-key report
  is worth its ~40 lines; it's already caught real issues.
- **`docs/decisions.md` at 34 entries** — the brief explicitly evaluates
  design reasoning; this is the primary artifact for it.
- **Graceful shutdown via `close-with-grace` + `isShuttingDown()`** — small, and
  directly supports the `k8s/` probe story (fix the ordering per
  `docs/enhance-suggestion.md` #8).
- **`helmet` CSP / strict CORS lists / `trustProxy` / `requestTimeout`** — a few
  lines each, all standard hardening, no real cost.
