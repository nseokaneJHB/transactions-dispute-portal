# Change sign-in email — bad or expired confirm token

**Flow:** `docs/user-stories/auth/change-sign-in-email.md`

**Trigger:** `POST /v1/auth/change-email/confirm` (`{ token }`, no auth) is
called with a token that doesn't match, or one that has passed its
`EMAIL_CHANGE_TOKEN_EXPIRY_MINUTES` (30 min) expiry. This applies to either
leg of the two-step confirm — the approval-link token sent to the current
address, or the verification-link token sent to the new address.

**Response:** `401`, `"start the change again"`.

**What the user sees / does next:** the `/account/email-change` page shows the
error; the user goes back to `/account` and re-submits the new address from
step 1, restarting the whole double-opt-in flow.
