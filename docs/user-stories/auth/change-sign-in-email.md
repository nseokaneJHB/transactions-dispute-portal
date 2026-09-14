# Change sign-in email (two-step, double opt-in)

**Role:** any authenticated user. **Screens:** `/account` (request),
`/account/email-change?token=…` (confirm — reached from an emailed link, works
with or without a session).

1. On `/account` the user submits a new address. Web calls
   **`POST /v1/auth/change-email`** (`{ newEmail }`), `authenticate` required.
2. Service calls Better Auth `changeEmail`. Better Auth emails an **approval
   link to the _current_ address** (`sendChangeEmailConfirmation` →
   `buildEmailChangeApprovalEmail`), token expiry
   `EMAIL_CHANGE_TOKEN_EXPIRY_MINUTES` (30 min). Nothing changes yet.
3. Service writes `auth_audit_log`: `event: EMAIL_CHANGE_REQUESTED`.
4. Response is deliberately vague ("if that address is available, we've emailed
   an approval link to your current address") — same whether `newEmail` is
   taken. Anti-enumeration, same pattern as sign-in.
5. User opens the approval link → `/account/email-change?token=…` → clicks
   confirm → **`POST /v1/auth/change-email/confirm`** (`{ token }`, no auth) →
   Better Auth `verifyEmail`. This step applies the approval; Better Auth then
   emails a **verification link to the _new_ address**
   (`emailVerification.sendVerificationEmail` → `buildEmailVerificationEmail`).
6. User opens the second link → same `/account/email-change` page, same
   `confirm` endpoint with the new token → the `user.email` column is updated.

The two links use the same frontend route and the same confirm endpoint; the
page just tells the user to follow whichever email is still waiting.

Too many change-email requests from one IP, or a bad/expired confirm token —
see `docs/user-stories/auth/change-sign-in-email-rate-limited.md` and
`docs/user-stories/auth/change-sign-in-email-invalid-or-expired-token.md`.
