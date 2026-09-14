# Admin invite — email already has an account

**Flow:** `docs/user-stories/admin/admin-invite.md` (send)

**Trigger:** an admin calls `POST /v1/admin/invites` (`{ email }`) for an
address that `findUserByEmail` already resolves to an existing user — customer
or admin.

**Response:** `409`, `"An account already exists for that email."`.

**What the user sees / does next:** the invite form on `/admin/invites` shows
the conflict message; no invite row is created and no email is sent.
