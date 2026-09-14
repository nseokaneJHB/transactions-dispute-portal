# Admin: move a dispute to review

**Role:** admin. **Screen:** `/admin` → row modal → "Move to review" (shown
only for a `SUBMITTED` dispute).

1. Web calls **`POST /v1/admin/disputes/:disputeId/review`**, `authenticate` +
   `authorize(ADMIN)`.
2. Service: `findDisputeById` (unscoped) — missing dispute, see
   `docs/user-stories/admin/admin-move-to-review-not-found.md`. Already
   `UNDER_REVIEW` → idempotent `200` no-op (no second audit row, no second
   ntfy publish). Any terminal status — see
   `docs/user-stories/admin/admin-move-to-review-already-closed.md`.
3. In one transaction: `markDisputeUnderReview` — guarded `UPDATE … SET status
   = 'UNDER_REVIEW' WHERE id = ? AND status = 'SUBMITTED'`
   (`docs/progress-and-decisions.md` #41) — plus a `dispute_audit_log` row
   (`SUBMITTED → UNDER_REVIEW`, actor = reviewer).
4. **`publishDisputeUpdate(ownerId, 'UNDER_REVIEW')`** — fire-and-forget ntfy
   POST to the owner's topic (2s timeout, failures logged not thrown). This is
   what surfaces the customer's toast in
   `docs/user-stories/client/live-dispute-notifications.md`.
5. Response `200` with the dispute (transaction + customer merged in from the
   pre-write read). Web refreshes the review queue.

Concurrent reviews collapse to one write / one audit row.

A customer session hitting this endpoint — see
`docs/user-stories/admin/admin-move-to-review-forbidden-non-admin.md`.
