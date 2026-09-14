# Admin invite — forbidden for a non-admin

**Flow:** `docs/user-stories/admin/admin-invite.md` (send)

**Trigger:** a customer session calls `POST /v1/admin/invites`. The route is
gated `authenticate` + `authorize(ADMIN)`; `authorize` rejects on role
mismatch (`docs/user-stories.md`'s "Roles" section — `authorize` → `403` on role
mismatch).

**Response:** `403` via the shared response envelope.

**What the user sees / does next:** unreachable through the web UI — a
customer session never sees `/admin/invites` (`_authenticated.tsx` keeps a
customer out of `/admin*`). This is a direct-API-call case only; the customer
stays on their own pages.
