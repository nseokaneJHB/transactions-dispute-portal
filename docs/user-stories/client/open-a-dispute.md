# Customer: open a dispute

**Role:** customer. **Screen:** `/transactions/$id` (the form on the detail
page). **Entry:** only shown when the transaction has no open dispute.

1. User picks a `reason` (`DISPUTE_REASON`) and writes a description (1–2000
   chars, enforced by zod). Web calls **`POST /v1/disputes`**
   (`{ transactionId, reason, description }`), `authenticate` +
   `authorize(CUSTOMER)`.
2. Service: `findUserTransactionById` looks up the transaction scoped to the
   caller — see `docs/user-stories/client/open-a-dispute-transaction-not-found.md` if
   it isn't theirs.
3. In one transaction: `createDispute` (status defaults to `SUBMITTED`) + the
   first `dispute_audit_log` row (`null → SUBMITTED`, "Dispute opened by the
   customer.").
4. **The one-open-dispute-per-transaction rule is the partial unique index
   `dispute_open_per_transaction_uq_idx` plus the global 409 handler** — there
   is no pre-check query and no try/catch in the service
   (`docs/progress-and-decisions.md` #40). See
   `docs/user-stories/client/open-a-dispute-duplicate-rejected.md` for the collision
   case. Concurrent submits collapse to exactly one `201` + the rest `409`.
5. Response `201` with the dispute (wire shape omits `user_id` / `resolved_by`,
   nests the disputed transaction's `merchant_name` / `amount_cents` /
   `transacted_at`, `docs/progress-and-decisions.md` #53).
6. Web refreshes the disputes query and navigates to `/disputes/$newId`.

No ntfy on submit — notifications are the admin transitions only
(`docs/dev-tools.md`).

An admin session hitting this endpoint — see
`docs/user-stories/client/open-a-dispute-forbidden-non-customer.md`.
