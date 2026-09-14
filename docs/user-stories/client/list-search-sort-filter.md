# Customer lists: the shared list query

`GET /v1/transactions` (`docs/user-stories/client/browse-transactions.md`) and
`GET /v1/disputes` (`docs/user-stories/client/view-disputes.md`) both extend
`paginationQuerySchema`. The admin side uses the same contract on its own two
list endpoints — see `docs/user-stories/admin/list-search-sort-filter.md`.

| Key | Meaning |
| --- | --- |
| `page`, `limit` | 1-based page + size (default 1 / 10, `limit` capped at 100). Always present in the URL. |
| `search` | case-insensitive substring across that list's text columns; `%` / `_` / `\` the user types are matched literally. Omitted from the URL unless set. |
| `from`, `to` | inclusive `YYYY-MM-DD` bounds on the list's date column (`from` snaps to start-of-day, `to` to end-of-day). |
| `sort` | a **whitelisted** column name (`TRANSACTION_SORT` / `DISPUTE_SORT`). |
| `order` | `asc` / `desc`; defaults to `desc`. Omitted from the URL unless set. |

The string→`PgColumn` binding lives in each repository (`SORT_COLUMN`), typed
`Record<XSort, …>` so it can't drift from the whitelist; the whitelist itself
is in `shared`. On the web side, `sort` / `order` are driven by **clicking a
column header** (`SortableHeader`) — a 3-state cycle: 1st click desc, 2nd asc,
3rd clears — not a dropdown. `ListControls` is the search/date/status bar and
applies on submit. URL key order is fixed by a custom `stringifySearch` in
`router.tsx`: `page, limit, search, status, …, from, to, sort, order`.

The response envelope for every list: `count` = full match total,
`total` = rows on this page, plus `page` / `limit`.

An invalid `from > to` range, or an unlisted `sort` value — see
`docs/user-stories/client/list-search-sort-filter-invalid-date-range.md` and
`docs/user-stories/client/list-search-sort-filter-invalid-sort-column.md`.
