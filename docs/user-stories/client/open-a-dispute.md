# Customer: open a dispute

**Role:** customer. **Screen:** `/transactions/$id` (the form on the detail
page). **Entry:** only shown when the transaction has no open dispute.

1. User picks a `reason` (`DISPUTE_REASON`) and writes a description (1–2000
   chars, enforced by zod). Web calls **`POST /v1/disputes`**
   (`{ transactionId, reason, description }`), `authenticate` +
   `authorize(CUSTOMER)`.
2. Service: `findUserTransactionById` looks up the transaction scoped to the
   caller — see *transaction not found* (below) if
   it isn't theirs.
3. In one transaction: `createDispute` (status defaults to `SUBMITTED`) + the
   first `dispute_audit_log` row (`null → SUBMITTED`, "Dispute opened by the
   customer.").
4. **The one-open-dispute-per-transaction rule is the partial unique index
   `dispute_open_per_transaction_uq_idx` plus the global 409 handler** — there
   is no pre-check query and no try/catch in the service
   (`docs/progress-and-decisions.md` #40). See
   *duplicate open dispute rejected* (below) for the collision
   case. Concurrent submits collapse to exactly one `201` + the rest `409`.
5. Response `201` with the dispute (wire shape omits `user_id` / `resolved_by`,
   nests the disputed transaction's `merchant_name` / `amount_cents` /
   `transacted_at`, `docs/progress-and-decisions.md` #53).
6. Web refreshes the disputes query and navigates to `/disputes/$newId`.

No ntfy on submit — notifications are the admin transitions only
(`docs/dev-tools.md`).

An admin session hitting this endpoint — see
*forbidden for a non-customer* (below).

## Error cases

### Duplicate open dispute rejected

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

### Forbidden for a non-customer

**Trigger:** an admin session calls `POST /v1/disputes`. The route is gated
`authenticate` + `authorize(CUSTOMER)`; `authorize` rejects on role mismatch
(`docs/user-stories.md`'s "Roles" section).

**Response:** `403` via the shared response envelope.

**What the user sees / does next:** unreachable through the web UI — an admin
session never sees `/transactions/$id`'s open-dispute form
(`_authenticated.tsx` keeps an admin out of the customer pages). Direct-API
call only.

### Transaction not found

**Trigger:** `POST /v1/disputes` (`{ transactionId, reason, description }`)
where `findUserTransactionById` can't find that transaction scoped to the
caller — either the id doesn't exist, or it belongs to another customer.

**Response:** `404` via the shared response envelope — never `403`, matching
the same no-existence-leak pattern used for transaction/dispute detail lookups
(`docs/progress-and-decisions.md` #39).

**What the user sees / does next:** the open-dispute form shows a not-found
error; there is no legitimate path to this through the web UI since the form
only renders from a transaction the customer is already viewing.
