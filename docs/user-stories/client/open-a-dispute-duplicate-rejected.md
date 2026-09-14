# Open a dispute — duplicate open dispute rejected

**Flow:** `docs/user-stories/client/open-a-dispute.md`

**Trigger:** `POST /v1/disputes` for a `transactionId` that already has an
open dispute (`SUBMITTED` or `UNDER_REVIEW`). Enforced entirely by the
partial unique index `dispute_open_per_transaction_uq_idx` plus the global
`409` handler on Postgres `23505` — there is no pre-check query and no
try/catch in the service (`docs/progress-and-decisions.md` #40). This also
covers two concurrent submits racing on the same transaction: exactly one
`201` wins, the index rejects the rest.

**Response:** `409`, `"This transaction already has an open dispute."`.

**What the user sees / does next:** normally unreachable through the web UI —
the open-dispute form is only mounted when the transaction detail page's
loader shows no open dispute (`docs/user-stories/client/browse-transactions.md`).
Reachable via a stale page, a double-submit race, or a direct API call; the
UI shows the conflict message and the customer is pointed at the existing
open dispute instead.
