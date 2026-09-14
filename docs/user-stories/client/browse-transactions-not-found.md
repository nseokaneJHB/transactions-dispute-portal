# Browse transactions — not found

**Flow:** `docs/user-stories/client/browse-transactions.md` (detail)

**Trigger:** `GET /v1/transactions/:transactionId` where the id either
doesn't exist at all, or exists but belongs to another customer.

**Response:** `404` via the shared response envelope, in both cases —
**never `403`** for the ownership case, so a caller can't distinguish "not
yours" from "doesn't exist" and probe for valid ids
(`docs/progress-and-decisions.md` #39).

**What the user sees / does next:** `/transactions/$id` renders a not-found
state; the user goes back to `/transactions`.
