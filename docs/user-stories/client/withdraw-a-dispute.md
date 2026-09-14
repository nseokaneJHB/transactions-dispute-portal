# Customer: withdraw a dispute

**Role:** customer. **Screen:** `/disputes/$id` ("Changed your mind?" card,
shown only while the dispute is open). Two-click confirm in the UI.

1. Web calls **`POST /v1/disputes/:disputeId/withdraw`**, `authenticate` +
   `authorize(CUSTOMER)`.
2. The whole handler runs in one transaction:
   - `findUserDisputeById(…, { lockForUpdate: true })` — `SELECT … FOR UPDATE`,
     so a concurrent admin transition can't change the status between this
     read and the write. Not the caller's / missing → see
     `docs/user-stories/client/withdraw-a-dispute-not-found.md`.
   - status not open (`isOpenDisputeStatus`) → see
     `docs/user-stories/client/withdraw-a-dispute-already-closed.md`.
   - `withdrawDispute` — guarded `UPDATE … SET status = 'WITHDRAWN', resolved_at
     = now() WHERE id = ? AND user_id = ? AND status IN (open statuses)`
     (`docs/progress-and-decisions.md` #45).
   - `dispute_audit_log` row: `{from_status} → WITHDRAWN`, "Withdrawn by the
     customer."
3. Response `200` with the updated dispute. Web refreshes the disputes list +
   this dispute's query.

`WITHDRAWN` is terminal — there is no reopen
(`docs/progress-and-decisions.md` #45; the reopen-after-close question is an
open design item, see `docs/progress-and-decisions.md`'s end note).

An admin session hitting this endpoint — see
`docs/user-stories/client/withdraw-a-dispute-forbidden-non-customer.md`.
