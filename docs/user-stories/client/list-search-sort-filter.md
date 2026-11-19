# Customer lists: the shared list query

`GET /v1/transactions` (`docs/user-stories/client/browse-transactions.md`) and
`GET /v1/disputes` (`docs/user-stories/client/view-disputes.md`) both extend
`paginationQuerySchema`. The admin side uses the same contract on its own two
list endpoints — see `docs/user-stories/admin/list-search-sort-filter.md`.

| Key | Meaning |
| --- | --- |
| `limit` | page size (default 10, capped at 100); the pager offers 10 / 25 / 50 / 100. Always present in the URL. |
| `cursor` | which page: absent for the first, a `next_cursor` / `prev_cursor` from the previous response for its neighbours, `last` for the final page. No page numbers and no total (`docs/progress-and-decisions.md` #69). A cursor from another `sort` / `order` or list, or edited by hand, is a `422`. |
| `search` | case-insensitive substring across that list's text columns; `%` / `_` / `\` the user types are matched literally. Omitted from the URL unless set. |
| `from`, `to` | inclusive `YYYY-MM-DD` bounds on the list's date column (`from` snaps to start-of-day, `to` to end-of-day). |
| `min_amount_cents`, `max_amount_cents` | inclusive bounds on the transaction amount in ZAR cents (for disputes, the disputed transaction's); non-negative integers, `min ≤ max` or `422`. The UI sets them with a two-thumb Rand slider in the Filters modal (R0 to R25,000; a thumb at either end leaves that side unbounded). |
| `sort` | a **whitelisted** column name (`TRANSACTION_SORT` / `DISPUTE_SORT`). |
| `order` | `asc` / `desc`; defaults to `desc`. Omitted from the URL unless set. |

The string→`PgColumn` binding lives in each repository (`SORT_COLUMN`), typed
`Record<XSort, …>` so it can't drift from the whitelist; the whitelist itself
is in `shared`. On the web side, `sort` / `order` are driven by **clicking a
column header** (`SortableHeader`) — a 3-state cycle: 1st click desc, 2nd asc,
3rd clears — not a dropdown. `ListControls` is a search box plus a **Filters** modal (status pills, date range, amount slider) and
applies on submit. URL key order is fixed by a custom `stringifySearch` in
`router.tsx`: `limit, search, status, …, from, to, min_amount_cents, max_amount_cents, sort, order, cursor`.

The response envelope for every list: `total` = rows on this page, `limit`,
and `next_cursor` / `prev_cursor` (`null` where there is no page that way).
The pager is First / Prev / Next / Last plus Rows per page; changing a filter
or the sort drops the cursor, and the cursor stays in the URL so Back and a
reload return to the same page.

An invalid `from > to` range, or an unlisted `sort` value — see
*invalid date range* (below) and
*invalid sort column* (below).

## Error cases

### Invalid date range

**Trigger:** the query string's `from` and `to` (`YYYY-MM-DD`, inclusive
bounds on that list's date column) are both present and `from > to`.

**Response:** `422`, `errors: [{ field, message }]` per the shared response
envelope.

**What the user sees / does next:** `ListControls` on the web side applies
filters on submit, so this is normally caught client-side before the request
goes out; a hand-crafted request or a manipulated URL shows the validation
error instead of a filtered list.

### Invalid sort column

**Trigger:** the query string's `sort` value isn't one of that endpoint's
whitelisted columns (`TRANSACTION_SORT` / `DISPUTE_SORT`). The whitelist
exists precisely so an unlisted value is rejected up front rather than ever
reaching an interpolated column name.

**Response:** `422`, `errors: [{ field, message }]` per the shared response
envelope.

**What the user sees / does next:** unreachable through normal use — the web
side drives `sort` by clicking a known column header (`SortableHeader`), never
free text. A hand-crafted request or a manipulated URL shows the validation
error instead of a sorted list.

### Invalid amount range

**Trigger:** `min_amount_cents` greater than `max_amount_cents`, or either one negative or not a whole number (e.g. `?min_amount_cents=20000&max_amount_cents=10000`). Checked by the query schema's `.refine(isOrderedAmountRange)` and the integer/non-negative field schemas, before any SQL runs.

**Response:** `422` with `errors: [{ field: "min_amount_cents", … }]`.

**What the user sees / does next:** the route's `validateSearch` runs the same schema, so a reversed range entered in the UI is caught client-side before any request goes out, the same as an invalid date range. A hand-crafted API request gets the `422`.
