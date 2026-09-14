# Open a dispute — transaction not found

**Flow:** `docs/user-stories/client/open-a-dispute.md`

**Trigger:** `POST /v1/disputes` (`{ transactionId, reason, description }`)
where `findUserTransactionById` can't find that transaction scoped to the
caller — either the id doesn't exist, or it belongs to another customer.

**Response:** `404` via the shared response envelope — never `403`, matching
the same no-existence-leak pattern used for transaction/dispute detail lookups
(`docs/progress-and-decisions.md` #39).

**What the user sees / does next:** the open-dispute form shows a not-found
error; there is no legitimate path to this through the web UI since the form
only renders from a transaction the customer is already viewing.
