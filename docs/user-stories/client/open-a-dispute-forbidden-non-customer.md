# Open a dispute — forbidden for a non-customer

**Flow:** `docs/user-stories/client/open-a-dispute.md`

**Trigger:** an admin session calls `POST /v1/disputes`. The route is gated
`authenticate` + `authorize(CUSTOMER)`; `authorize` rejects on role mismatch
(`docs/user-stories.md`'s "Roles" section).

**Response:** `403` via the shared response envelope.

**What the user sees / does next:** unreachable through the web UI — an admin
session never sees `/transactions/$id`'s open-dispute form
(`_authenticated.tsx` keeps an admin out of the customer pages). Direct-API
call only.
