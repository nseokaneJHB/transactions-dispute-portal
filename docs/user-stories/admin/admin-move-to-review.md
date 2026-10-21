# Admin: move a dispute to review

**Role:** admin. **Screen:** `/admin` → row modal → "Move to review" (shown
only for a `SUBMITTED` dispute).

1. Web calls **`POST /v1/admin/disputes/:disputeId/review`**, `authenticate` +
   `authorize(ADMIN)`.
2. Service: `findDisputeById` (unscoped) — missing dispute, see
   *not found* (below). Already
   `UNDER_REVIEW` → idempotent `200` no-op (no second audit row, no second
   ntfy publish). Any terminal status — see
   *already closed* (below).
3. In one transaction: `markDisputeUnderReview` — guarded `UPDATE … SET status
   = 'UNDER_REVIEW' WHERE id = ? AND status = 'SUBMITTED'`
   (`docs/progress-and-decisions.md` #41) — plus a `dispute_audit_log` row
   (`SUBMITTED → UNDER_REVIEW`, actor = reviewer).
4. **`publishDisputeUpdate(ownerId, { dispute_id, status: 'UNDER_REVIEW' })`**
   — fire-and-forget ntfy POST to the owner's topic (2s timeout, failures logged not thrown). This is
   what surfaces the customer's toast in
   `docs/user-stories/client/live-dispute-notifications.md`.
5. Response `200` with the dispute (transaction + customer merged in from the
   pre-write read). Web refreshes the review queue.

Concurrent reviews collapse to one write / one audit row.

A customer session hitting this endpoint — see
*forbidden for a non-admin* (below).

## Error cases

### Already closed

**Trigger:** `POST /v1/admin/disputes/:disputeId/review` on a dispute already
in a terminal status (`RESOLVED`, `REJECTED`, or `WITHDRAWN`). Note this is
distinct from the already-`UNDER_REVIEW` case, which is an idempotent `200`
no-op, not an error — this file only covers terminal statuses, which can't
move backward into review.

**Response:** `409`, `"already closed"`.

**What the user sees / does next:** normally a race — the customer withdrew,
or another admin resolved the dispute, between the queue loading and this
admin clicking "Move to review." The modal shows the conflict and the queue
refreshes to the dispute's current terminal status.

### Forbidden for a non-admin

**Trigger:** a customer session calls
`POST /v1/admin/disputes/:disputeId/review`. The route is gated
`authenticate` + `authorize(ADMIN)`; `authorize` rejects on role mismatch
(`docs/user-stories.md`'s "Roles" section).

**Response:** `403` via the shared response envelope.

**What the user sees / does next:** unreachable through the web UI — a
customer session never sees the admin review queue's row modal. Direct-API
call only.

### Not found

**Trigger:** `POST /v1/admin/disputes/:disputeId/review` where
`findDisputeById` (unscoped — admins see every dispute) can't find a dispute
with that id at all.

**Response:** `404` via the shared response envelope.

**What the user sees / does next:** unreachable through the web UI in the
normal case — the row modal's "Move to review" button only exists for a
dispute already rendered in the queue. Direct-API call, or a dispute deleted
out from under a stale page, shows a not-found error.
