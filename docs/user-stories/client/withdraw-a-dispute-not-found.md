# Withdraw a dispute — not found

**Flow:** `docs/user-stories/client/withdraw-a-dispute.md`

**Trigger:** `POST /v1/disputes/:disputeId/withdraw` where
`findUserDisputeById(…, { lockForUpdate: true })` can't find that dispute
scoped to the caller — either the id doesn't exist, or it belongs to another
customer.

**Response:** `404` via the shared response envelope.

**What the user sees / does next:** unreachable through the web UI in the
normal case — the withdraw card only renders on the caller's own dispute
detail page. Direct-API call only; shows a not-found error.
