# Admin: resolve or reject — not found

**Flow:** `docs/user-stories/admin/admin-resolve-or-reject.md`

**Trigger:** `POST /v1/admin/disputes/:disputeId/resolve` where
`findDisputeById` can't find a dispute with that id at all.

**Response:** `404` via the shared response envelope.

**What the user sees / does next:** unreachable through the web UI in the
normal case — the decision form only exists for a dispute already rendered
in the queue. Direct-API call, or a dispute deleted out from under a stale
page, shows a not-found error.
