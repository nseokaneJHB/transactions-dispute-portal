# Admin: move to review — already closed

**Flow:** `docs/user-stories/admin/admin-move-to-review.md`

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
