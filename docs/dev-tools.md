# Dev tools

Dev-only tooling in the stack: two services that stand in for real external delivery so the app can be demoed and tested with zero third-party dependency. Neither ships to production — see each section's "in production" note.

## ntfy

### What and why

Dispute status changes (`submitted → under_review → resolved | rejected`) publish to a self-hosted [ntfy](https://github.com/binwiederhier/ntfy) topic instead of just logging to the console. ntfy is a single-binary, self-hostable HTTP pub/sub service — publish with a plain HTTP POST, subscribers get it instantly via the web UI, its app, or SSE. No accounts, no API keys.

This upgrades the "simulated (logged/stubbed, never actually sent)" notification the brief requires for _dispute status_ — it's not a requirement itself, just a console.log turned into something demoable live in an interview (dispute resolves → a real push notification arrives). See `docs/requirements.md` for why the event-driven line exists at all.

### Scope boundary — read before wiring this up

**ntfy is for the dispute-status notification only. It must never become the delivery channel for the OTP code or any other auth credential.** ntfy topics are broadcast by design — using one for a sign-in code would let anyone who knows the topic name read it, a worse security story than the tool this project already has for credential delivery: outbound SMTP.

Auth is Better Auth email-OTP (`docs/progress-and-decisions.md` #21 — see `docs/backend-service.md`), so OTP codes, account-recovery/compromise-alert email (`docs/backend-service.md` §3), and admin invites all go out over SMTP; ntfy stays scoped to the one thing it's suited for — a broadcast-shaped, non-credential status update.

### How it's wired

- `compose.yml` has an `ntfy` service (`binwiederhier/ntfy`), alongside Postgres/api/web/Mailpit. Web UI on `http://localhost:8090`; the api reaches it at `http://ntfy` (`env.NTFY_URL`). The browser's own SSE subscription (`use-dispute-notifications.ts`) goes through the reverse proxy at `/ntfy` (`VITE_NTFY_URL`, `docs/progress-and-decisions.md` #61) rather than ntfy's port directly — same reasoning as the api URL: the client bundle only ever knows the proxy's stable address.
- On a dispute status change (the `POST /v1/admin/disputes/:id/review` **and** `.../resolve` handlers — see `docs/backend-service.md`), `lib/notifier.ts`'s `publishDisputeUpdate` does a fire-and-forget `POST ${NTFY_URL}/dispute-updates-{userId}` with the new status (`UNDER_REVIEW` / `RESOLVED` / `REJECTED`) as the body. Failures are logged, never block or fail the request.
- Per-user topics, not one shared topic, so one customer's dispute activity isn't visible to another — the same authz principle as everything else in `docs/requirements.md`, applied to the notification channel too.
- Local dev: subscribe via `curl -s http://localhost:8090/dispute-updates-{userId}/json` or the ntfy web UI to watch events arrive while testing the dispute flow.

### Explicitly out of scope

- Real delivery of _dispute-status_ notifications specifically — that stays simulated via ntfy, not real push/SMS. (The OTP sign-in email, the new-device login alert, and the email-change approval are all real, via SMTP — see `docs/backend-service.md` §3 — a different category, not an exception here.)
- Any auth-credential delivery over ntfy, OTP codes included — see Scope boundary above.
- A public ntfy.sh topic — self-hosted only, so the submission doesn't depend on a third party being up during review.

### In production

Either run a self-hosted ntfy instance (private network, `NTFY_URL` pointed at it) or accept that dispute-status push stays a demo affordance — it was never a brief requirement, only an upgrade over a logged stub. `docs/production-runbook.md` §6. It must never carry auth credentials in any environment — see Scope boundary above.

## Mailpit

### What and why

Login is Better Auth email-OTP: every sign-in sends a real, working one-time code over SMTP — see `docs/backend-service.md`'s auth section. That puts outbound email on the login-critical path in every environment, dev included, so dev needs a real SMTP server to send to, not a stub that no-ops the send.

[Mailpit](https://github.com/axllent/mailpit) is a local mail-catcher: an SMTP server that accepts and stores mail instead of delivering it, with its own web UI to read what was caught. It lets the OTP flow (and the new-device login alert, and email-change approval — `docs/backend-service.md` §3) be exercised end to end — a real SMTP send, a real message to inspect — with zero external dependency: no real inbox, no provider account, code visible instantly instead of waiting on an inbox.

### How it's wired

- `compose.yml` has a `transaction-dispute-portal-mailpit` service (`axllent/mailpit`), reachable on the compose network under the alias `mailpit`, with SMTP exposed on host port `1025` and its web UI (port `8025`) reachable through the nginx proxy.
- `api/.env` points the api's SMTP client at it: `SMTP_HOST=mailpit`, `SMTP_PORT=1025`, with `SMTP_USER`/`SMTP_PASS` empty — Mailpit accepts unauthenticated mail by default, so dev needs no credentials at all.
- Every OTP code, new-device alert, and email-change approval the api sends lands in Mailpit instead of a real inbox. Open the web UI to read the caught message and copy the code out during local testing or a demo.

### In production

Mailpit doesn't exist in production — there's no environment where "catch mail instead of sending it" is right, since production login genuinely needs to deliver a real, working OTP to a real inbox. It's replaced by a real transactional SMTP provider (SES, Postmark, SendGrid, etc.) with an authenticated sending domain (SPF/DKIM/DMARC) — `docs/production-runbook.md` §5.
