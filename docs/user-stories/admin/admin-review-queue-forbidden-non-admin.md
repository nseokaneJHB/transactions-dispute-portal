# Admin review queue — forbidden for a non-admin

**Flow:** `docs/user-stories/admin/admin-review-queue.md`

**Trigger:** a customer session calls `GET /v1/admin/disputes` (or
`GET /v1/admin/disputes/summary`). Both routes are gated `authenticate` +
`authorize(ADMIN)`; `docs/user-stories.md`'s Roles section states this explicitly for the list: "a
customer session → `403`."

**Response:** `403` via the shared response envelope.

**What the user sees / does next:** unreachable through the web UI — a
customer session never sees `/admin` (`_authenticated.tsx` keeps a customer
out of `/admin*`). Direct-API call only.
