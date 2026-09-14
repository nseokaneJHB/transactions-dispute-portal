# Customer: view disputes

**Role:** customer. **Screens:** `/disputes` (list), `/disputes/$id` (detail).

- **List** — `GET /v1/disputes`, caller-scoped. Shared list query (see
  `docs/user-stories/client/list-search-sort-filter.md`): `search` (description
  **and** the disputed merchant's name), `from`/`to` (on `created_at`),
  `status`, `transaction_id`,
  `sort` ∈ {`created_at`, `merchant`, `amount_cents`, `status`}, `order`,
  `page`, `limit`. `sort=status` orders by the pgEnum's declaration order,
  which is lifecycle order. Because `search` can touch the joined
  `transaction` table, the page count is an explicit joined `COUNT(*)` rather
  than `$count`.
- **Detail** — `GET /v1/disputes/:disputeId`, caller-scoped. Shows the reason,
  status, the customer's own description, the disputed transaction (links to
  `/transactions/$id`), the reviewer's note once closed, and — while the
  dispute is open — the withdraw action (`docs/user-stories/client/withdraw-a-dispute.md`).

Another user's dispute id, a missing one, or a malformed id — see
`docs/user-stories/client/view-disputes-not-found.md` and
`docs/user-stories/client/view-disputes-malformed-id.md`.
