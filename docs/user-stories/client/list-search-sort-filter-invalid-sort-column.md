# Customer lists — invalid sort column

**Flow:** `docs/user-stories/client/list-search-sort-filter.md` (applies to
`GET /v1/transactions`, `GET /v1/disputes`)

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
