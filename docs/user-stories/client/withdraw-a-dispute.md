# Customer: withdraw a dispute

**Role:** customer. **Screen:** `/disputes/$id` ("Changed your mind?" card,
shown only while the dispute is open). Two-click confirm in the UI.

1. Web calls **`POST /v1/disputes/:disputeId/withdraw`**, `authenticate` +
   `authorize(CUSTOMER)`.
2. The whole handler runs in one transaction:
   - `findUserDisputeById(…, { lockForUpdate: true })` — `SELECT … FOR UPDATE`,
     so a concurrent admin transition can't change the status between this
     read and the write. Not the caller's / missing → see
     *not found* (below).
   - status not open (`isOpenDisputeStatus`) → see
     *already closed* (below).
   - `withdrawDispute` — guarded `UPDATE … SET status = 'WITHDRAWN', resolved_at
     = now() WHERE id = ? AND user_id = ? AND status IN (open statuses)`
     (`docs/progress-and-decisions.md` #45).
   - `dispute_audit_log` row: `{from_status} → WITHDRAWN`, "Withdrawn by the
     customer."
3. Response `200` with the updated dispute. Web refreshes the disputes list +
   this dispute's query.

`WITHDRAWN` is terminal. To dispute the transaction again, the customer opens a
*new* dispute (`docs/progress-and-decisions.md` #45).

An admin session hitting this endpoint — see
*forbidden for a non-customer* (below).

## Error cases

### Already closed

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

### Forbidden for a non-customer

**Trigger:** an admin session calls `POST /v1/disputes/:disputeId/withdraw`.
The route is gated `authenticate` + `authorize(CUSTOMER)`; `authorize` rejects
on role mismatch (`docs/user-stories.md`'s "Roles" section).

**Response:** `403` via the shared response envelope.

**What the user sees / does next:** unreachable through the web UI — an admin
session never sees `/disputes/$id`'s withdraw card. Direct-API call only. An
admin closes a dispute through
`docs/user-stories/admin/admin-resolve-or-reject.md` instead.

### Not found

**Trigger:** `POST /v1/disputes/:disputeId/withdraw` where
`findUserDisputeById(…, { lockForUpdate: true })` can't find that dispute
scoped to the caller — either the id doesn't exist, or it belongs to another
customer.

**Response:** `404` via the shared response envelope.

**What the user sees / does next:** unreachable through the web UI in the
normal case — the withdraw card only renders on the caller's own dispute
detail page. Direct-API call only; shows a not-found error.
