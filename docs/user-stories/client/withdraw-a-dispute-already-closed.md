# Withdraw a dispute — already closed

**Flow:** `docs/user-stories/client/withdraw-a-dispute.md`

**Trigger:** `POST /v1/disputes/:disputeId/withdraw` on a dispute whose status
is no longer open (`isOpenDisputeStatus` — i.e. already `RESOLVED`,
`REJECTED`, or `WITHDRAWN`). Caught in two places inside the same
transaction: the initial locked read's status check, and — for a status
change that races in between — the guarded `UPDATE … WHERE id = ? AND user_id
= ? AND status IN (open statuses)` returning empty (`docs/progress-and-decisions.md`
#45). Both land on the same response, so an admin resolving the dispute a
moment before the customer's withdraw click produces the identical error.

**Response:** `409`, `"already closed"`.

**What the user sees / does next:** the "Changed your mind?" card is only
shown while the dispute is open, so this is normally a race (two tabs, a
concurrent admin transition) rather than a reachable button click; the UI
shows the conflict and refreshes to the dispute's current, now-closed status.
