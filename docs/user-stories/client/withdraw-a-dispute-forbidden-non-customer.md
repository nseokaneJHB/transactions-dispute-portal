# Withdraw a dispute — forbidden for a non-customer

**Flow:** `docs/user-stories/client/withdraw-a-dispute.md`

**Trigger:** an admin session calls `POST /v1/disputes/:disputeId/withdraw`.
The route is gated `authenticate` + `authorize(CUSTOMER)`; `authorize` rejects
on role mismatch (`docs/user-stories.md`'s "Roles" section).

**Response:** `403` via the shared response envelope.

**What the user sees / does next:** unreachable through the web UI — an admin
session never sees `/disputes/$id`'s withdraw card. Direct-API call only. An
admin closes a dispute through
`docs/user-stories/admin/admin-resolve-or-reject.md` instead.
