# Browse transactions — malformed id

**Flow:** `docs/user-stories/client/browse-transactions.md` (detail)

**Trigger:** `GET /v1/transactions/:transactionId` where `transactionId` isn't
a well-formed UUID.

**Response:** `422` (the UUID params schema rejects it before the handler
runs), `errors: [{ field, message }]` per the shared response envelope.

**What the user sees / does next:** unreachable through normal navigation —
the web app only ever links to real UUIDs. A hand-edited URL shows a
validation-error state.
