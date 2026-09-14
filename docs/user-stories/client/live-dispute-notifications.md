# Customer: live dispute-status notifications

**Role:** customer (admins don't subscribe). **Always on** while any
`_authenticated` page is mounted.

1. `_authenticated.tsx` calls `useDisputeNotifications(user.id)` for
   customers. It opens a browser `EventSource` on
   `${VITE_NTFY_URL}/dispute-updates-{userId}/sse` — the **same per-user
   topic** the API publishes to on admin transitions
   (`docs/user-stories/admin/admin-move-to-review.md`,
   `docs/user-stories/admin/admin-resolve-or-reject.md`).
2. On a message it toasts ("One of your disputes is now Under review") and
   `refreshQuery`s the disputes list + router.

Best-effort, self-hosted (`docs/dev-tools.md`).

A dropped or errored stream — see
`docs/user-stories/client/live-dispute-notifications-stream-error.md`.
