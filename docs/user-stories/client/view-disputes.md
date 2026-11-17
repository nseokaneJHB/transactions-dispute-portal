# Customer: view disputes

**Role:** customer. **Screens:** `/disputes` (list), `/disputes/$id` (detail).

- **List** — `GET /v1/disputes`, caller-scoped. Shared list query (see
  `docs/user-stories/client/list-search-sort-filter.md`): `search` (description
  **and** the disputed merchant's name), `from`/`to` (on `created_at`),
  `status`, `transaction_id`,
  `sort` ∈ {`created_at`, `merchant`, `amount_cents`, `status`}, `order`,
  `limit`, `cursor`. `sort=status` orders by the pgEnum's declaration order,
  which is lifecycle order. Paged by cursor, never counted (#69).
- **Detail** — `GET /v1/disputes/:disputeId`, caller-scoped. Shows the reason,
  status, the customer's own description, the disputed transaction (links to
  `/transactions/$id`), the reviewer's note once closed, and — while the
  dispute is open — the withdraw action (`docs/user-stories/client/withdraw-a-dispute.md`).

Another user's dispute id, a missing one, or a malformed id — see
*not found* (below) and
*malformed id* (below).

## Error cases

### Malformed id

**Trigger:** `GET /v1/disputes/:disputeId` where `disputeId` isn't a
well-formed UUID.

**Response:** `422` (the UUID params schema rejects it before the handler
runs), `errors: [{ field, message }]` per the shared response envelope.

**What the user sees / does next:** unreachable through normal navigation —
the web app only ever links to real UUIDs. A hand-edited URL shows a
validation-error state.

### Not found

**Trigger:** `GET /v1/disputes/:disputeId` where the id either doesn't exist
at all, or exists but belongs to another customer.

**Response:** `404` via the shared response envelope, in both cases — never
`403`, same no-existence-leak pattern as
`docs/user-stories/client/browse-transactions.md` (error cases)
(`docs/progress-and-decisions.md` #39).

**What the user sees / does next:** `/disputes/$id` renders a not-found state;
the user goes back to `/disputes`.
