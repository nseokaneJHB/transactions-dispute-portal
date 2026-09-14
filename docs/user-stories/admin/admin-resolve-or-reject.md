# Admin: resolve or reject a dispute

**Role:** admin. **Screen:** `/admin` → row modal → the decision form (shown
only for an `UNDER_REVIEW` dispute).

1. Admin picks `RESOLVED` or `REJECTED` (`ADMIN_RESOLUTION_STATUS` — resolve
   **cannot** target `WITHDRAWN`) and writes a note (1–2000 chars, shown to the
   customer). Web calls **`POST /v1/admin/disputes/:disputeId/resolve`**
   (`{ resolution, note }`), `authenticate` + `authorize(ADMIN)`.
2. Service: `findDisputeById` — missing dispute, see
   `docs/user-stories/admin/admin-resolve-not-found.md`. Still `SUBMITTED` — see
   `docs/user-stories/admin/admin-resolve-requires-under-review.md` (resolve
   **requires** `UNDER_REVIEW`, `docs/progress-and-decisions.md` #41). Already
   terminal — see `docs/user-stories/admin/admin-resolve-already-closed.md`.
3. In one transaction: `resolveDispute` — guarded `UPDATE … SET status =
   {resolution}, resolution_note = {note}, resolved_by = {reviewer}, resolved_at
   = now() WHERE id = ? AND status = 'UNDER_REVIEW'` — plus a
   `dispute_audit_log` row (`UNDER_REVIEW → {resolution}`, the note).
4. **`publishDisputeUpdate(ownerId, {resolution})`** — ntfy, same mechanism as
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
`docs/user-stories/admin/admin-resolve-forbidden-non-admin.md`.
