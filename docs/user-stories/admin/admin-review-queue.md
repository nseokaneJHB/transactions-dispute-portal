# Admin: the review queue

**Role:** admin. **Screen:** `/admin`.

## Stat cards + priority ordering

- The page loads two things in parallel: `GET /v1/admin/disputes` (the page of
  rows) and `GET /v1/admin/disputes/summary` (unfiltered count per status).
- **Stat cards** — one per status, in lifecycle order. The two open statuses
  (`SUBMITTED`, `UNDER_REVIEW`) render as a solid-filled alert whenever their
  count is non-zero — the reviewer's backlog. Clicking a card filters the
  queue to that status (`?status=`); clicking the active one clears it. The
  summary query key is a prefix of the list key, so a review/resolve
  mutation's cache removal refreshes it too.
- **Default ordering** — with no explicit `?sort`, the queue is a work list:
  `ORDER BY status ASC, created_at ASC, id DESC`. The `dispute_status` pgEnum
  is declared in lifecycle order, so `SUBMITTED` / `UNDER_REVIEW` sort ahead of
  the terminal states, oldest-first so nothing rots at the bottom. Any
  explicit `sort` overrides this entirely.

## The list

`GET /v1/admin/disputes`, `authenticate` + `authorize(ADMIN)`. Every
customer's disputes (no owner scope). Shared list query (see
`docs/user-stories/admin/list-search-sort-filter.md`), with a **wider `sort`
whitelist** than the customer's own list — `ADMIN_DISPUTE_SORT` adds
`customer` (the owning user's name), since a reviewer benefits from grouping
one person's disputes together. `search` matches the description, the
disputed merchant, **and** the customer's name and email. Wire shape = the
customer shape + `user_id` + the owning `customer` `{ name, email }` (joined
in, `docs/progress-and-decisions.md` #53). Each row's action button opens a
modal (`docs/user-stories/admin/admin-move-to-review.md`,
`docs/user-stories/admin/admin-resolve-or-reject.md`).

A customer session hitting this endpoint — see
`docs/user-stories/admin/admin-review-queue-forbidden-non-admin.md`.
