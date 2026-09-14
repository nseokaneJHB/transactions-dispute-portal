# Admin: move to review — not found

**Flow:** `docs/user-stories/admin/admin-move-to-review.md`

**Trigger:** `POST /v1/admin/disputes/:disputeId/review` where
`findDisputeById` (unscoped — admins see every dispute) can't find a dispute
with that id at all.

**Response:** `404` via the shared response envelope.

**What the user sees / does next:** unreachable through the web UI in the
normal case — the row modal's "Move to review" button only exists for a
dispute already rendered in the queue. Direct-API call, or a dispute deleted
out from under a stale page, shows a not-found error.
