# Customer: browse transactions

**Role:** customer. **Screens:** `/transactions` (list), `/transactions/$id`
(detail).

- **List** — `GET /v1/transactions`, scoped to the caller in the SQL `WHERE`
  (`docs/progress-and-decisions.md` #39), never a post-fetch filter. Supports
  the shared list query (see `docs/user-stories/client/list-search-sort-filter.md`):
  `search` (merchant name), `from`/`to` (on `transacted_at`),
  `sort` ∈ {`transacted_at`, `merchant`, `amount_cents`}, `order`, `limit`,
  `cursor`. Default order `transacted_at` desc, `id` desc as a stable tiebreak
  (every sort breaks ties on `id`, which is what lets a cursor name one row).
  Paged by cursor, never counted (#69).
- **Detail** — `GET /v1/transactions/:transactionId`. The loader **also**
  fetches `GET /v1/disputes?transaction_id=…` (limit 100):
  - an **open** dispute on this transaction → renders a "View dispute" link,
    the open-a-dispute form is **not** mounted;
  - any **closed** disputes → a "Dispute history" list underneath.

Another user's transaction id, a missing one, or a malformed id — see
*not found* (below) and
*malformed id* (below).

## Error cases

### Malformed id

**Trigger:** `GET /v1/transactions/:transactionId` where `transactionId` isn't
a well-formed UUID.

**Response:** `422` (the UUID params schema rejects it before the handler
runs), `errors: [{ field, message }]` per the shared response envelope.

**What the user sees / does next:** unreachable through normal navigation —
the web app only ever links to real UUIDs. A hand-edited URL shows a
validation-error state.

### Not found

**Trigger:** `GET /v1/transactions/:transactionId` where the id either
doesn't exist at all, or exists but belongs to another customer.

**Response:** `404` via the shared response envelope, in both cases —
**never `403`** for the ownership case, so a caller can't distinguish "not
yours" from "doesn't exist" and probe for valid ids
(`docs/progress-and-decisions.md` #39).

**What the user sees / does next:** `/transactions/$id` renders a not-found
state; the user goes back to `/transactions`.
