# Customer: browse transactions

**Role:** customer. **Screens:** `/transactions` (list), `/transactions/$id`
(detail).

- **List** — `GET /v1/transactions`, scoped to the caller in the SQL `WHERE`
  (`docs/progress-and-decisions.md` #39), never a post-fetch filter. Supports
  the shared list query (see `docs/user-stories/client/list-search-sort-filter.md`):
  `search` (merchant name), `from`/`to` (on `transacted_at`),
  `sort` ∈ {`transacted_at`, `merchant`, `amount_cents`}, `order`, `page`,
  `limit`. Default order `transacted_at` desc, `id` desc as a stable tiebreak.
  The response envelope's `count` is the full match total, `total` is the rows
  on this page.
- **Detail** — `GET /v1/transactions/:transactionId`. The loader **also**
  fetches `GET /v1/disputes?transaction_id=…` (limit 100):
  - an **open** dispute on this transaction → renders a "View dispute" link,
    the open-a-dispute form is **not** mounted;
  - any **closed** disputes → a "Dispute history" list underneath.

Another user's transaction id, a missing one, or a malformed id — see
`docs/user-stories/client/browse-transactions-not-found.md` and
`docs/user-stories/client/browse-transactions-malformed-id.md`.
