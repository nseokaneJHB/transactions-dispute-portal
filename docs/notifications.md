# Notifications (ntfy)

## What and why

Dispute status changes (`submitted → under_review → resolved | rejected`) publish to a self-hosted [ntfy](https://github.com/binwiederhier/ntfy) topic instead of just logging to the console. ntfy is a single-binary, self-hostable HTTP pub/sub service — publish with a plain HTTP POST, subscribers get it instantly via the web UI, its app, or SSE. No accounts, no API keys.

This is an upgrade to the "simulated (logged/stubbed, never actually sent)" notification the brief only requires for _dispute status_, not a requirement itself — it turns a console.log into something demoable live in an interview (dispute resolves → a real push notification arrives). See `docs/brief.md` for why the event-driven line exists at all.

## Scope boundary — read before wiring this up

**ntfy is for the dispute-status notification only. It is not, and must not become, the delivery channel for anything auth-related** (OTP codes, magic links, password-reset tokens). Those are credentials, not notifications — ntfy topics are broadcast by design, and using one for a sign-in code would mean anyone who knows the topic name can read it unless every user gets an unguessable, access-controlled private topic. That's a worse security story than the thing it'd replace.

Auth is plain Better Auth email+password (see `CLAUDE.md`), not the passwordless email-OTP or Google-OAuth pattern `ubuntu-stories` uses — so there's no OTP/magic-link delivery problem to solve, and no external identity provider gating the login path. That said, this project _does_ use real outbound SMTP for account-recovery/compromise-alert email (password reset, new-device login alerts) — see `docs/auth.md` §3. That's a deliberate, separate decision from this one, not a contradiction of it: the risk decision 1 ruled on was specifically an external provider gating _login itself_; a non-blocking notification channel doesn't carry that risk, whether it's ntfy for disputes or SMTP for auth alerts.

## How it's wired

- `compose.yml` gains an `ntfy` service (official `binwiederhier/ntfy` image), alongside Postgres/api/web.
- On a dispute status change (in the `POST /internal/disputes/:id/resolve` handler — see `docs/api.md`), the api publishes to a per-user topic, e.g. `POST http://ntfy:80/dispute-updates-{userId}` with the new status as the message body.
- Per-user topics (not one shared topic) so one customer's dispute activity isn't visible to another — the same authz principle as everything else in `docs/domain-model.md`, applied to the notification channel too.
- Local dev: subscribe via `curl -s http://localhost:8080/dispute-updates-{userId}/json` or the ntfy web UI to watch events arrive while testing the dispute flow.

## Explicitly out of scope

- Real delivery of _dispute-status_ notifications specifically — that stays simulated via ntfy, not real push/SMS. (Auth email is real, via SMTP — see `docs/auth.md` §3 — that's a different notification category, not an exception to this one.)
- Any auth-credential delivery over ntfy (OTP, magic links, password-reset tokens) — see Scope boundary above.
- A public ntfy.sh topic — self-hosted only, so the submission doesn't depend on a third party being up during review.
