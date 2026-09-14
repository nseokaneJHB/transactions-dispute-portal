# Admin: resolve or reject — forbidden for a non-admin

**Flow:** `docs/user-stories/admin/admin-resolve-or-reject.md`

**Trigger:** a customer session calls
`POST /v1/admin/disputes/:disputeId/resolve`. The route is gated
`authenticate` + `authorize(ADMIN)`; `authorize` rejects on role mismatch
(`docs/user-stories.md`'s "Roles" section). This is also the specific case that would
otherwise let a customer resolve their own dispute — a real authorization
hole, not a shortcut, per `docs/backend-service.md`'s closing note on keeping the
customer and admin auth paths honestly separate.

**Response:** `403` via the shared response envelope.

**What the user sees / does next:** unreachable through the web UI — a
customer session never sees the admin review queue's decision form.
Direct-API call only. A customer's only self-service exit from an open
dispute is `docs/user-stories/client/withdraw-a-dispute.md`.
