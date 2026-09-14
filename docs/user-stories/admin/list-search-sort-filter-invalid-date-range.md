# Admin lists — invalid date range

**Flow:** `docs/user-stories/admin/list-search-sort-filter.md` (applies to
`GET /v1/admin/disputes`, `GET /v1/admin/invites`)

**Trigger:** the query string's `from` and `to` (`YYYY-MM-DD`, inclusive
bounds on that list's date column) are both present and `from > to`.

**Response:** `422`, `errors: [{ field, message }]` per the shared response
envelope.

**What the user sees / does next:** `ListControls` on the web side applies
filters on submit, so this is normally caught client-side before the request
goes out; a hand-crafted request or a manipulated URL shows the validation
error instead of a filtered list.
