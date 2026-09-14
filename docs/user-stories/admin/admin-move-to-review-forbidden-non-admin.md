# Admin: move to review — forbidden for a non-admin

**Flow:** `docs/user-stories/admin/admin-move-to-review.md`

**Trigger:** a customer session calls
`POST /v1/admin/disputes/:disputeId/review`. The route is gated
`authenticate` + `authorize(ADMIN)`; `authorize` rejects on role mismatch
(`docs/user-stories.md`'s "Roles" section).

**Response:** `403` via the shared response envelope.

**What the user sees / does next:** unreachable through the web UI — a
customer session never sees the admin review queue's row modal. Direct-API
call only.
