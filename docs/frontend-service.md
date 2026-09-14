# Frontend service (`web`)

The architecture and recurring patterns behind the TanStack Start app — not a screen-by-screen tour. For that, see `docs/user-stories/` (every flow walked end to end, per role). For the file/folder shape, see `docs/codebase-index.md`'s "## web" section. For *why* each pattern below was chosen over the alternatives, the cited `docs/progress-and-decisions.md` #NN entries carry the full reasoning.

## Route tree & auth gating

`CLAUDE.md` mandates "TanStack Router loaders for data fetching, never `useEffect` for it." The route tree applies the same rule to auth itself — who's signed in, and which role's UI a route shows, is resolved by the router before anything renders, not discovered client-side after mount.

- `src/routes/__root.tsx`'s `beforeLoad` seeds `RouterContext.user` (`AuthSession | null`) by `queryClient.ensureQueryData`-ing `GET /v1/auth/session` once per navigation root — the one place the whole app learns who's signed in (`docs/progress-and-decisions.md` #50, #51).
- Two layout routes split on that context. `src/routes/_unauthenticated.tsx` holds `sign-in`. `src/routes/_authenticated.tsx`'s `beforeLoad` redirects to sign-in if `user` is `null`, then splits by `user.role`: a customer under `/admin` is bounced to `/transactions`, an admin outside `/admin` is bounced to `/admin`, except the shared `/account` prefix both roles can reach.
- The split is a `beforeLoad` redirect, not a conditional render — an admin session never even receives the customer bundle's data, and there's no unauthenticated flash while a `useEffect` would still be resolving (`docs/progress-and-decisions.md` #51).
- Two routes deliberately live **outside** `_authenticated`, reached from an emailed link rather than in-app navigation: `src/routes/account/email-change.tsx` (confirms the two-step email-change flow, no session required) and `src/routes/admin/invite.tsx` (accepts an admin invite, no session required).

## Data fetching pattern

Every read is a route `loader` + `queryClient.ensureQueryData`, keyed on `loaderDeps` so pagination/filtering/sorting re-fetches on navigation instead of a `useEffect` watching search-param state (`docs/progress-and-decisions.md` #51). `src/router.tsx` wires a fresh `QueryClient` per router (`src/integrations/query-provider.tsx`) and `setupRouterSsrQueryIntegration`, which dehydrates the query cache into the SSR payload so the client doesn't re-fetch what the server already loaded.

**One API client, one error type.** `src/api/index.ts` is the single axios instance. `ApiError`/`isApiError`/`normalizeAxiosError` collapse every failure — a server envelope, a network drop, anything else — into the same shape (`status`, `code`, `message`, `errors?`, `redirectUrl?`), so no component or mutation branches on axios's error shape versus the server's.

**`SERVER_API_URL` vs `VITE_API_URL`.** The instance's `baseURL` branches on `typeof window === "undefined"`:

- Server-side (inside a `createServerFn`, during SSR) it's `SERVER_API_URL` — the api container's Docker-network name, read from `process.env` at request time. `localhost` from inside the `web` container doesn't reach the `api` container.
- Client-side it's `VITE_API_URL` — a Vite **build-time** env var, inlined as a literal string into the client JS bundle. `src/api/server.ts`'s `forwardCookie()` copies the inbound SSR request's `Cookie` header onto the server-side axios call (via `getRequest()` from `@tanstack/react-start/server`) so an SSR read authenticates as the visiting browser; client-side calls rely on `withCredentials` instead.

The distinction matters beyond dev convenience: `docs/production-runbook.md` §3 covers why `VITE_API_URL` baked into a bundle must point at a stable owned domain behind a reverse proxy, never a raw infra address that can change under a customer's already-open tab — `SERVER_API_URL` carries no such risk, since it's read fresh from `process.env` on every server restart, never shipped to a browser. The dev stack's nginx proxy (`docs/progress-and-decisions.md` #61) is that pattern's live, smaller-scale demonstration: `web`/`api` no longer publish their own ports, and `VITE_API_URL`/`VITE_NTFY_URL` point at the proxy's one stable address.

**Cross-user 404s.** `rejectNotFound(error)` (`src/api/index.ts`) is called from a single-entity server function's catch block (`transactionRequest`, `disputeRequest`) while the error is still the real `ApiError`, server-side. A `404` throws the router's own `notFound()` instead of letting the original error propagate. This exists because `createServerFn`'s RPC boundary only round-trips `notFound()`/`redirect()` intact — every other thrown error flattens to a bare `.message`, so a client-side transition to another customer's dispute/transaction URL used to render the generic crash screen instead of a real 404 (`docs/progress-and-decisions.md` #56).

**Forms** use `react-hook-form` + `@hookform/resolvers`'s `zodResolver` over the same zod schemas `shared` already exports for request bodies — client validation is the server's own schema, not a hand-duplicated shadow of it (`docs/progress-and-decisions.md` #51). `src/lib/form.ts`'s `applyServerErrors(setError, error)` maps an `ApiError`'s `errors: [{ field, message }]` back onto the form.

**Mutations** go through `src/lib/toast-mutation.ts`'s `runToastMutation`, which drives a mutation promise through one `sonner` `toast.promise` — loading/success/error all read the server's own `message` string, so a new mutation gets consistent toast behaviour for free instead of bespoke `try/catch` + toast wiring per component. It calls no hooks and runs inside event handlers, so it's a plain function, not a `use*` hook — renamed from `useToastMutation` (`src/hooks/use-toast-mutation.tsx`) once that mismatch was flagged as a rules-of-hooks trip hazard (`docs/progress-and-decisions.md` #59). Every mutation site pairs it with `refreshQuery` below: `runToastMutation` handles the toast, `refreshQuery` handles getting fresh data back on screen.

## Query-client refresh pattern (`refreshQuery`)

Post-mutation UI updates (withdraw a dispute, move to review, resolve) were initially wired with the pattern TanStack's own docs show — `queryClient.invalidateQueries({ queryKey })` then `router.invalidate()` — and it silently did nothing: the toast said success, the backend had really transitioned the row, but the on-screen card never changed until a full reload (`docs/progress-and-decisions.md` #52).

Two stacked bugs, both direct consequences of the loader-driven fetch pattern above:

1. `invalidateQueries`'s default `refetchType: "active"` only refetches queries with a live `useQuery` observer. Every read here is `ensureQueryData` inside a loader — by design nothing observes it the way a mounted `useQuery` would, so the default call marks the entry stale and stops there.
2. Forcing `refetchType: "all"` surfaced a worse problem: a query hydrated from SSR has no `queryFn` attached client-side (functions don't survive dehydration). Forcing a refetch on the existing query object threw `Missing queryFn` — silently, since per-query fetch errors don't propagate out of `invalidateQueries`'s own resolved promise — and `ensureQueryData` only ever checks whether `state.data === undefined`, not `isInvalidated` or `status`, so the rerun loader just handed back the stale pre-mutation data.

**Fix:** `src/lib/query.ts`'s `refreshQuery(queryClient, router, queryKeys)` calls `queryClient.removeQueries({ queryKey })` — not `invalidateQueries` — for each key, then `router.invalidate()`. Removing the entry deletes the `Query` object outright, so the rerun loader's `ensureQueryData` call sees an empty cache and does a genuine `fetchQuery` using the `queryFn` *that same call supplies* — sidestepping both the missing-observer and missing-queryFn problems by deleting the stale object instead of trying to refetch it in place. Every mutation site (`dispute-actions.tsx`'s review/resolve, `withdraw-button.tsx`, `dispute-form.tsx`, `use-dispute-notifications.ts`'s ntfy handler) goes through this one helper.

One query-key detail leans on the same helper: `QUERY_KEYS.ADMIN_DISPUTE_SUMMARY` (`["admin","disputes","summary"]`) is a *prefix* of `QUERY_KEYS.ADMIN_DISPUTES`, so one `removeQueries` call after a review/resolve refreshes both the review-queue table and its stat cards with no extra invalidation wiring (`docs/progress-and-decisions.md` #58).

## Shared list UI (`<DataList>`)

Four surfaces — customer transactions, customer disputes, the admin review queue, the admin invite list — share one server-side query contract (`paginationQuerySchema` + a per-endpoint whitelisted `sort` + `search`/`from`/`to` filters, `docs/progress-and-decisions.md` #57) and, since a second cleanup pass, one client-side component:

- `src/components/custom/data-list.tsx` — a generic `<DataList TRow TStatus TSort>` that owns `ListControls` + a sortable `Table` + `Pagination` and the apply/clear/sort-cycle/page-change handlers. Each page passes a `columns` array (`{ header, cell, sortKey?, align?, cellClassName? }`), its filter/empty copy, and `onSearchChange={(next) => navigate({ search: next })}`.
- `src/components/custom/list-controls.tsx` (`ListControls`) — search + date range + an optional status `<select>`, applied on submit, not keystroke (one request per intent, not per keystroke; it also keeps the loader from thrashing).
- `src/components/custom/sortable-header.tsx` (`SortableHeader`) — a table header cell driving a 3-state click cycle (desc → asc → cleared), via `src/lib/list-query.ts`'s `nextSort`.
- `src/components/custom/pagination.tsx` (`Pagination`) — first/prev/next/last + a page-number box.
- `src/router.tsx` has a custom `stringifySearch` that orders the list-query URL keys into a fixed sequence (`page`/`limit` first, `sort`/`order` last) so the URL reads consistently regardless of the order the UI set them in (rendering only, not meaning).

`<DataList>` wasn't extracted until the fourth concrete caller (the admin invite list) existed — the third and fourth pages each revealed real divergence (a joined-field sort on the review queue, a two-line customer cell, page-specific content above the list) that a two-caller abstraction would have guessed wrong (`docs/progress-and-decisions.md` #59). The review queue additionally composes `<DataList>` with `DisputeSummaryCards` (`src/components/custom/dispute-summary-cards.tsx`) — per-status stat cards from `GET /v1/admin/disputes/summary`, clicking one sets/clears `?status=` (`docs/progress-and-decisions.md` #58).

## Live notifications (`useDisputeNotifications`)

`src/hooks/use-dispute-notifications.ts` opens a browser `EventSource` against ntfy's per-user SSE topic — the same topic `api/src/lib/notifier.ts` publishes to on `review`/`resolve` (`docs/dev-tools.md`) — from the `_authenticated` layout, only for customers (an admin has no personal dispute topic). On a message it toasts a summary and calls `refreshQuery` on the disputes query + the router, so the list updates with no poll.

**Why SSE over polling:** the backend already publishes the event (`docs/progress-and-decisions.md` #41's `notifier.ts`); polling would just re-derive on a delay what push already delivers immediately, and ntfy speaks SSE natively. Best-effort posture matches the backend: a stream error just closes the connection, never surfaces as a page error (`docs/progress-and-decisions.md` #51).

**The `<Toaster/>` SSR-hydration bug.** A live browser pass found ntfy messages arriving correctly — `EventSource` connected, `JSON.parse` succeeded, `toast.info(...)` ran and queued into sonner's internal store — but nothing painted. Root cause: `<Toaster/>` was rendered inside `src/routes/__root.tsx`'s `RootDocument`, which is server-rendered; its subscription effect ran as part of the initial SSR hydration pass rather than a clean client-only mount, and its subscription to sonner's `ToastState` singleton never received updates afterward. Fix: `src/components/ui/sonner.tsx`'s `Toaster` now gates its own render on a `useState`/`useEffect` "mounted" flag, returning `null` until after the first client-side effect runs — the underlying `SonnerToaster` is never part of the SSR-rendered/hydrated tree, only ever mounted fresh, client-side (`docs/progress-and-decisions.md` #63). `<Toaster/>` stays at the document root rather than moving into a route-level component, since `toast` is used from unauthenticated and top-level routes (`sign-in`, `email-change`, `admin/invite`) as well as `_authenticated/*`.

## Cross-references

- `docs/user-stories/` — every flow this app supports, walked screen by screen per role (what a customer/admin sees and does).
- `docs/codebase-index.md` — the "## web" section for the literal file map.
- `docs/progress-and-decisions.md` — #50–#63 cover the web build-out in full; cited by number above rather than restated.
- `docs/production-runbook.md` §3 — the production shape of the `VITE_API_URL`/reverse-proxy pattern this doc's data-fetching section only summarizes.
