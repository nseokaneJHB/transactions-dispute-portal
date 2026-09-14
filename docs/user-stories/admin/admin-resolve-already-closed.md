# Admin: resolve or reject — already closed

**Flow:** `docs/user-stories/admin/admin-resolve-or-reject.md`

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
