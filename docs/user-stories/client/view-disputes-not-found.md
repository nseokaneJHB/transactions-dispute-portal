# View disputes — not found

**Flow:** `docs/user-stories/client/view-disputes.md` (detail)

**Trigger:** `GET /v1/disputes/:disputeId` where the id either doesn't exist
at all, or exists but belongs to another customer.

**Response:** `404` via the shared response envelope, in both cases — never
`403`, same no-existence-leak pattern as
`docs/user-stories/client/browse-transactions-not-found.md`
(`docs/progress-and-decisions.md` #39).

**What the user sees / does next:** `/disputes/$id` renders a not-found state;
the user goes back to `/disputes`.
