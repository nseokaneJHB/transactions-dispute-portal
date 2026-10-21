# Customer: live dispute-status notifications

**Role:** customer (admins don't subscribe). **Always on** while any
`_authenticated` page is mounted.

1. `_authenticated.tsx` calls `useDisputeNotifications(user.id)` for
   customers. It opens a browser `EventSource` on
   `${VITE_NTFY_URL}/dispute-updates-{userId}/sse` — the **same per-user
   topic** the API publishes to on admin transitions
   (`docs/user-stories/admin/admin-move-to-review.md`,
   `docs/user-stories/admin/admin-resolve-or-reject.md`).
2. The message body is `{ dispute_id, status }` — only an opaque id, since
   ntfy topics are unauthenticated (`docs/progress-and-decisions.md` #66).
   The hook `refreshQuery`s the disputes list, that dispute's detail and the
   router, so the row moves without a reload.
3. It fetches the dispute through the authenticated `GET
   /v1/disputes/:disputeId` and toasts "Dispute under review — Sasol ·
   R 1 117,20 is now Under Review." with a **View** button that opens
   `/disputes/{disputeId}`. If that lookup fails, the toast falls back to
   "One of your disputes is now …", still with **View**.

Best-effort, self-hosted (`docs/dev-tools.md`).

A dropped or errored stream — see
*dropped or errored stream* (below).

## Error cases

### Dropped or errored stream

**Trigger:** the browser `EventSource` connection to
`${VITE_NTFY_URL}/dispute-updates-{userId}/sse` errors or drops — network
blip, ntfy restart.

**Response:** not a REST call, so there's no status code or envelope. The
`EventSource`'s own `onerror` fires and the client closes the connection.

**What the user sees / does next:** nothing — there is no toast, no banner,
no reconnect logic documented. The page keeps working normally; the customer
simply stops getting live toasts until they navigate again (which remounts
`_authenticated.tsx` and reopens the stream) or refresh. Best-effort,
self-hosted (`docs/dev-tools.md`) — a dropped stream is explicitly called
out as never affecting the page.
