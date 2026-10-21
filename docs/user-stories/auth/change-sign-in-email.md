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
see *too many requests from one IP* (below) and
*bad or expired confirm token* (below).

## Error cases

### Bad or expired confirm token

**Trigger:** `POST /v1/auth/change-email/confirm` (`{ token }`, no auth) is
called with a token that doesn't match, or one that has passed its
`EMAIL_CHANGE_TOKEN_EXPIRY_MINUTES` (30 min) expiry. This applies to either
leg of the two-step confirm — the approval-link token sent to the current
address, or the verification-link token sent to the new address.

**Response:** `401`, `"start the change again"`.

**What the user sees / does next:** the `/account/email-change` page shows the
error; the user goes back to `/account` and re-submits the new address from
step 1, restarting the whole double-opt-in flow.

### Too many requests from one IP

**Trigger:** more than `OTP.MAX_ATTEMPTS` calls to `POST /v1/auth/change-email`
from the same IP within a minute — the same per-route rate-limiting mechanism
used across the auth routes (`docs/progress-and-decisions.md` #37).

**Response:** `429` via the shared response envelope. `docs/user-stories/auth/change-sign-in-email.md`
documents the threshold but not bespoke copy for this case.

**What the user sees / does next:** a "too many attempts, try again shortly"
style message on `/account`; the user waits out the window and resubmits.
