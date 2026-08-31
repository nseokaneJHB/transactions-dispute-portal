# Notifications (ntfy)

## What and why

Dispute status changes (`submitted → under_review → resolved | rejected`) publish to a self-hosted [ntfy](https://github.com/binwiederhier/ntfy) topic instead of just logging to the console. ntfy is a single-binary, self-hostable HTTP pub/sub service — publish with a plain HTTP POST, subscribers get it instantly via the web UI, its app, or SSE. No accounts, no API keys.

This is an upgrade to the "simulated (logged/stubbed, never actually sent)" notification the brief only requires for _dispute status_, not a requirement itself — it turns a console.log into something demoable live in an interview (dispute resolves → a real push notification arrives). See `docs/brief.md` for why the event-driven line exists at all.

## Scope boundary — read before wiring this up

**ntfy is for the dispute-status notification only. It is not, and must not become, the delivery channel for the OTP code itself, or for any other auth-related credential.** OTP codes are credentials, not notifications — ntfy topics are broadcast by design, and using one for a sign-in code would mean anyone who knows the topic name can read it unless every user gets an unguessable, access-controlled private topic. That's a worse security story than the thing it'd replace, and this project already has the right tool for credential delivery: outbound SMTP.

Auth is Better Auth email-OTP (`docs/decisions.md` #21 — see `docs/auth.md`) — so unlike when this scope boundary was first written, there genuinely is now an OTP delivery problem to solve on every login, not zero. It's solved via SMTP, not ntfy, which is exactly why this boundary matters more now than it did before: OTP codes, account-recovery/compromise-alert email (`docs/auth.md` §3), and admin invites all go out over SMTP; ntfy stays scoped to the one thing it's actually suited for — a broadcast-shaped, non-credential status update.

## How it's wired

- `compose.yml` has an `ntfy` service (`binwiederhier/ntfy`), alongside Postgres/api/web/Mailpit. Web UI on `http://localhost:8090`; the api reaches it at `http://ntfy` (`env.NTFY_URL`).
- On a dispute status change (the `POST /v1/admin/disputes/:id/review` **and** `.../resolve` handlers — see `docs/api.md`), `lib/notifier.ts`'s `publishDisputeUpdate` does a fire-and-forget `POST ${NTFY_URL}/dispute-updates-{userId}` with the new status (`UNDER_REVIEW` / `RESOLVED` / `REJECTED`) as the body. Failures are logged, never block or fail the request.
- Per-user topics (not one shared topic) so one customer's dispute activity isn't visible to another — the same authz principle as everything else in `docs/domain-model.md`, applied to the notification channel too.
- Local dev: subscribe via `curl -s http://localhost:8090/dispute-updates-{userId}/json` or the ntfy web UI to watch events arrive while testing the dispute flow.

## Explicitly out of scope

- Real delivery of _dispute-status_ notifications specifically — that stays simulated via ntfy, not real push/SMS. (OTP codes and account-recovery email are real, via SMTP — see `docs/auth.md` — that's a different category, not an exception to this one.)
- Any auth-credential delivery over ntfy (OTP codes included) — see Scope boundary above.
- A public ntfy.sh topic — self-hosted only, so the submission doesn't depend on a third party being up during review.
