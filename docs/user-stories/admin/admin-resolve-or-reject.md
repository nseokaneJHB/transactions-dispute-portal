# Admin: resolve or reject a dispute

**Role:** admin. **Screen:** `/admin` → row modal → the decision form (shown
only for an `UNDER_REVIEW` dispute).

1. Admin picks `RESOLVED` or `REJECTED` (`ADMIN_RESOLUTION_STATUS` — resolve
   **cannot** target `WITHDRAWN`) and writes a note (1–2000 chars, shown to the
   customer). Web calls **`POST /v1/admin/disputes/:disputeId/resolve`**
   (`{ resolution, note }`), `authenticate` + `authorize(ADMIN)`.
2. Service: `findDisputeById` — missing dispute, see
   *not found* (below). Still `SUBMITTED` — see
   *requires under review first* (below) (resolve
   **requires** `UNDER_REVIEW`, `docs/progress-and-decisions.md` #41). Already
   terminal — see *already closed* (below).
3. In one transaction: `resolveDispute` — guarded `UPDATE … SET status =
   {resolution}, resolution_note = {note}, resolved_by = {reviewer}, resolved_at
   = now() WHERE id = ? AND status = 'UNDER_REVIEW'` — plus a
   `dispute_audit_log` row (`UNDER_REVIEW → {resolution}`, the note).
4. **`publishDisputeUpdate(ownerId, { dispute_id, status: resolution })`** —
   ntfy, same mechanism as
   `docs/user-stories/admin/admin-move-to-review.md`.
5. Response `200`. Web refreshes the review queue and closes the modal.

Concurrent resolves collapse to one `200` + the rest `409`; one audit row, one
`resolved_by`.

The full lifecycle is therefore forward-only:
`SUBMITTED → UNDER_REVIEW → RESOLVED | REJECTED`, with `SUBMITTED / UNDER_REVIEW
→ WITHDRAWN` available to the customer
(`docs/user-stories/client/withdraw-a-dispute.md`). Every closed dispute has a
complete `dispute_audit_log` chain.

A customer session hitting this endpoint — see
*forbidden for a non-admin* (below).

## Error cases

### Not found

**Trigger:** `POST /v1/admin/disputes/:disputeId/resolve` where
`findDisputeById` can't find a dispute with that id at all.

**Response:** `404` via the shared response envelope.

**What the user sees / does next:** unreachable through the web UI in the
normal case — the decision form only exists for a dispute already rendered
in the queue. Direct-API call, or a dispute deleted out from under a stale
page, shows a not-found error.

### Requires under review first

**Trigger:** `POST /v1/admin/disputes/:disputeId/resolve` on a dispute that is
still `SUBMITTED` — resolve requires `UNDER_REVIEW`
(`docs/progress-and-decisions.md` #41); there is no direct
`SUBMITTED → RESOLVED|REJECTED` edge.

**Response:** `409`, `"move it to review first"`.

**What the user sees / does next:** the decision form is only shown for an
`UNDER_REVIEW` dispute (`docs/user-stories/admin/admin-resolve-or-reject.md`), so
this is normally a race (two admins, a stale modal) rather than a reachable
button click. The UI shows the message and points the admin at
`docs/user-stories/admin/admin-move-to-review.md` first.

### Already closed

**Trigger:** `POST /v1/admin/disputes/:disputeId/resolve` on a dispute already
in a terminal status (`RESOLVED`, `REJECTED`, or `WITHDRAWN`). The
legal-from-status check lives in the guarded `UPDATE … WHERE status =
'UNDER_REVIEW'`, so two admins racing to resolve the same dispute collapse to
one `200` and the other gets this `409`
(`docs/progress-and-decisions.md` #41).

**Response:** `409`, `"already closed"`.

**What the user sees / does next:** normally a race — another admin resolved
it first, or the customer withdrew it moments earlier. The modal shows the
conflict and the queue refreshes to the dispute's current terminal status.

### Forbidden for a non-admin

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
