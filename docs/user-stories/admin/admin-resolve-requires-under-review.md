# Admin: resolve or reject — requires under review first

**Flow:** `docs/user-stories/admin/admin-resolve-or-reject.md`

**Trigger:** `POST /v1/admin/disputes/:disputeId/resolve` on a dispute that is
still `SUBMITTED` — resolve requires `UNDER_REVIEW`
(`docs/progress-and-decisions.md` #41); there is no direct
`SUBMITTED → RESOLVED|REJECTED` edge.

**Response:** `409`, `"move it to review first"`.

**What the user sees / does next:** the decision form is only shown for an
`UNDER_REVIEW` dispute (`docs/user-stories/admin/admin-resolve-or-reject.md`), so
this is normally a race (two admins, a stale modal) rather than a reachable
button click. The UI shows the message and points the admin at
`docs/user-stories/admin/admin-move-to-review.md` first.
