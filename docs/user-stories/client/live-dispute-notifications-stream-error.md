# Live dispute notifications — dropped or errored stream

**Flow:** `docs/user-stories/client/live-dispute-notifications.md`

**Trigger:** the browser `EventSource` connection to
`${VITE_NTFY_URL}/dispute-updates-{userId}/sse` errors or drops — network
blip, ntfy restart, proxy hiccup.

**Response:** not a REST call, so there's no status code or envelope. The
`EventSource`'s own `onerror` fires and the client closes the connection.

**What the user sees / does next:** nothing — there is no toast, no banner,
no reconnect logic documented. The page keeps working normally; the customer
simply stops getting live toasts until they navigate again (which remounts
`_authenticated.tsx` and reopens the stream) or refresh. Best-effort,
self-hosted (`docs/dev-tools.md`) — a dropped stream is explicitly called
out as never affecting the page.
