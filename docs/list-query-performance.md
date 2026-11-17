# List query performance: evidence

The SE II panel's first concern was that the paginated list queries would be slow at millions of rows. This is the measured record of what changed, taken on **one dataset** in three states, in order:

1. **Before** — `main` as presented: `000_init.sql` (48 indexes), offset paging (`LIMIT … OFFSET`), and an exact `count(*)` on every list request.
2. **After the index refactor** — migration `0001_prune_unused_indexes_add_dispute_list_indexes` (29 indexes, `docs/progress-and-decisions.md` #68) and the count capped at 10,001 rows. Still offset paging.
3. **Current** — plus migration `0002_add_list_sort_indexes` (34 indexes, #70) and cursor paging on every list and every sort, with no count at all (#69).

The decisions behind each step are #68–#70 in `docs/progress-and-decisions.md`. Raw results, query plans, the exact SQL timed, and the scripts that produced them are in `docs/list-query-performance/`.

## Dataset and method

- **Data:** 50,001 users, 2,200,000 transactions, 1,050,000 disputes (5% `SUBMITTED`, 5% `UNDER_REVIEW`, the rest closed). One "heavy" customer owns 200,000 transactions and 50,000 disputes; a normal customer owns about 40 of each. `setseed(0.42)` makes a rerun statistically identical (not row-identical: `now()` and `uuidv7()` vary). Loader: `scripts/load.sql`.
- **Where:** Postgres 18 in the compose `database` container, on a 5 GB laptop. Nothing else running.
- **Timing:** `psql \timing`, each query 6 times, the first discarded, the **median of the other 5**. `vacuum analyze` before each state. Page size 10 (the API default).
- **What is timed:** states 1 and 2 time the SQL those versions of the code sent (`results/*.queries.tsv`). State 3 times the **exact SQL the current repository functions emit**, captured from a logging Drizzle client and run with its parameters inlined (`scripts/capture-current.ts`), with the cursor placed so the page starts at the same row as the offset version.
- **Why not `EXPLAIN ANALYZE` times:** its per-row instrumentation inflates row-heavy queries several-fold in this container (an exact count showed 5.4 s under `EXPLAIN ANALYZE` against 0.5 s real). Plans are kept for their *shape* (`results/*.plans.txt`), not their timings.
- **"Row N"** means the page whose first row is the Nth in that list's order: offset `N - 10` in states 1–2, a cursor in state 3.

## Default order

| Page | Before | After index refactor | Current |
|---|---|---|---|
| admin queue, first page | 43.2 ms | 1.45 ms | 1.88 ms |
| admin queue, row 10,000 | 167 ms | 102 ms | 1.63 ms |
| admin queue, row 500,000 | 1,780 ms | 3,278 ms (API now 422) | 2.64 ms |
| admin queue status=SUBMITTED, first page | 1.83 ms | 1.50 ms | 1.63 ms |
| admin search 'merchant 42', first page | 80.7 ms | 5.55 ms | 5.88 ms |
| heavy customer transactions, first page | 0.26 ms | 0.29 ms | 0.33 ms |
| heavy customer transactions, row 10,000 | 6.46 ms | 7.44 ms | 0.35 ms |
| heavy customer transactions, row 100,000 | 71.9 ms | 61.6 ms (API now 422) | 0.42 ms |
| heavy customer disputes, first page | 0.72 ms | 0.60 ms | 0.61 ms |
| heavy customer disputes, row 10,000 | 189 ms | 31.7 ms | 0.64 ms |
| heavy customer disputes, row 40,000 | 178 ms | 191 ms (API now 422) | 0.58 ms |
| normal customer transactions, first page | 0.32 ms | 0.22 ms | 0.71 ms |
| normal customer disputes, first page | 0.59 ms | 0.56 ms | 0.59 ms |

## Sorted lists

| Sorted page | Before | After index refactor | Current |
|---|---|---|---|
| admin sort=amount desc, first page | 893 ms | 977 ms | 1.61 ms |
| admin sort=amount desc, row 10,000 | 1,310 ms | 1,500 ms | 2.07 ms |
| admin sort=amount desc, row 500,000 | 1,431 ms | 1,502 ms (API now 422) | 1.78 ms |
| admin sort=customer asc, first page | 895 ms | 907 ms | 140 ms |
| admin sort=customer asc, row 10,000 | 1,651 ms | 1,573 ms | 118 ms |
| admin sort=status asc, first page | 39.3 ms | 41.6 ms | 1.42 ms |
| admin sort=status asc, row 10,000 | 83.7 ms | 109 ms | 1.52 ms |
| heavy customer transactions sort=amount asc, first page | 28.8 ms | 32.8 ms | 0.28 ms |
| heavy customer transactions sort=amount asc, row 10,000 | 38.1 ms | 45.5 ms | 0.39 ms |
| heavy customer disputes sort=merchant asc, first page | 144 ms | 143 ms | 2.30 ms |
| heavy customer disputes sort=merchant asc, row 10,000 | 197 ms | 189 ms | 3.00 ms |

## Count queries

States 1 and 2 ran a count in parallel with every page, for the "1–10 of N" label. State 3 shows no total, so it runs none.

| Count query | Before (exact) | After index refactor (capped at 10,001) | Current |
|---|---|---|---|
| admin queue | 448 ms | 7.42 ms | not run |
| admin queue status=SUBMITTED | 109 ms | 29.7 ms | not run |
| admin search | 1,297 ms | 764 ms | not run |
| heavy customer transactions | 12.7 ms | 1.23 ms | not run |
| heavy customer disputes | 40.0 ms | 17.1 ms | not run |
| normal customer transactions | 0.20 ms | 0.45 ms | not run |
| normal customer disputes | 0.50 ms | 0.52 ms | not run |

## Whole request

What a list request actually cost: page and count ran in parallel, so the slower of the two.

| Whole request (page and count run in parallel, so the slower one) | Before | After index refactor | Current |
|---|---|---|---|
| admin queue, first page | 448 ms | 7.42 ms | 1.88 ms |
| admin queue, row 10,000 | 448 ms | 102 ms | 1.63 ms |
| admin queue status=SUBMITTED, first page | 109 ms | 29.7 ms | 1.63 ms |
| admin search 'merchant 42', first page | 1,297 ms | 764 ms | 5.88 ms |
| heavy customer transactions, row 10,000 | 12.7 ms | 7.44 ms | 0.35 ms |
| heavy customer disputes, row 10,000 | 189 ms | 31.7 ms | 0.64 ms |
| admin sort=amount desc, first page | 893 ms | 977 ms | 1.61 ms |
| admin sort=customer asc, first page | 895 ms | 907 ms | 140 ms |


## Writes and storage

| | Before | After index refactor | Current |
|---|---|---|---|
| Indexes (incl. primary keys) | 48 | 29 | 34 |
| Index size: `transaction` / `dispute` / `user` | 296 / 135 / 9.2 MB | 209 / 215 / 5.0 MB | 296 / 316 / 6.6 MB |
| Insert 200k transactions (median of 3; second run in brackets) | 5,715 ms | 5,099 ms (5,315) | 6,645 ms (6,387) |
| Update 20k disputes, `resolution_note` + `updated_at` | 1,238 ms | 2,157 ms (1,582) | 1,825 ms (2,051) |

Each write runs inside a transaction that is rolled back; every run is in `results/*.writes.tsv`. The index sizes are read after each state's write tests, and a rolled-back insert still leaves dead index entries behind, so they overstate real growth; the clean figures are below.

## Automated test evidence

The API suite is integration tests against real Postgres and Mailpit (#47); the web suite is unit tests. Both pass at every step:

| State | API tests | Web tests | What the new tests prove |
|---|---|---|---|
| Before | 71 | 12 | — |
| Index refactor + capped count | 75 | 12 | count stops at the cap and flags it; counts exactly under the cap; `422` for a page past the window |
| First cursor version (default order only) | 83 | 12 | cursors both ways; a walk over 10,000+ transactions; rows microseconds apart; `422` for a bad cursor |
| **Current** | **89** | **12** | no `count` on the envelope; cursors under every sort; `cursor=last` lands on the true last page; `422` for a cursor from another sort, order or list, or hand-edited; a leftover `?page=` is ignored; a sorted walk where 2,500 rows tie on the sort value; nine list × sort combinations walked forwards and back from `last` over exactly the same rows |

Typecheck, lint and build pass in all three packages. The pager was also clicked through in a browser against the dev stack: Prev/Next/First/Last, browser Back/Forward and reload on a cursor page, sorting and filtering resetting the cursor, a sorted walk with tied amounts, the full 265-dispute review queue forwards and back, and the rows-per-page picker keeping the current row.

## Findings and caveats

- **Deep pages are now flat.** The admin queue at row 500,000 went from 1.8 s to 2.6 ms, and every customer page from 0.3 to 0.7 ms however deep. Offset cost grew with depth; a cursor seek doesn't.
- **The index refactor alone helped the first page and the count, not depth.** Row 500,000 of the admin queue got *slower* in state 2 (1.8 s → 3.3 s) because Postgres now walks the new index instead of hash-joining and sorting. The API refused that page in state 2 (the 10,000-row window); state 3 removed the problem rather than refusing it.
- **The biggest win is the count that's no longer there.** Before, every admin request paid a 450 ms count (1.3 s with a search) even on page 1.
- **One sort is still slow: the admin queue by customer, about 120–140 ms.** "Heavy Account" sorts first and owns 50,000 disputes, so the first 50,000 rows are one name and Postgres sorts that whole group by `id`. A real customer with a few hundred disputes doesn't hit this. Fixing it would need the tie-break to come from the same index as the name, which a join can't give.
- **Search is unchanged by design.** `ILIKE` substring search has no index (`pg_trgm` was deferred). Its first page is fast only because the queue now reads in index order and stops at 11 matches; a rare term still scans.
- **Normal customer pages moved by under half a millisecond** (0.2–0.3 ms → 0.6–0.7 ms): the seek column (`to_char` of the sort key) and an incremental sort over ~40 rows. Not measurable in a request.
- **Writes are noisy here.** Repeat runs of the same write in the same state varied by 20–40%. The insert cost of the sort indexes is real (two more `transaction` indexes, about +25%), but only the seed writes `transaction` in this app. Dispute updates show no consistent change.
- **Storage:** measured on a fresh load, the five sort indexes (#70) add 144 MB: `dispute (user_id, status, id)` 59 MB, `dispute (status, id)` 41 MB, `transaction (amount_cents)` 26 MB, `transaction (merchant_name)` 16 MB, `user (name)` 1.5 MB. The refactor (#68) had removed 19 indexes and three duplicate unique constraints, so the current total is still below where it started in index count.
- **One regression was caught by this method, not by tests.** An intermediate version of the cursor seek added a second range condition on the queue index's first column, which made Postgres start the scan at the looser bound: the default queue's deep page took 435 ms. Timing hand-written SQL had missed it; timing the exact SQL the app emits found it (#70). The tests could not catch it because the results were correct, only slow.

## Rerunning

From the repo root, with nothing else using the `database` container (about 10 minutes; needs ~2 GB free disk):

```bash
docs/list-query-performance/scripts/run.sh /tmp/list-query-results
```

It creates a throwaway `perf_evidence` database, loads the dataset on the original schema, measures state 1, applies `0001` and measures state 2, applies `0002`, captures the current SQL from the repository functions and measures state 3, then drops the database.

