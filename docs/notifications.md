# Notifications (ntfy)

## What and why

Dispute status changes (`submitted → under_review → resolved | rejected`) publish to a self-hosted [ntfy](https://github.com/binwiederhier/ntfy) topic instead of just logging to the console. ntfy is a single-binary, self-hostable HTTP pub/sub service — publish with a plain HTTP POST, subscribers get it instantly via the web UI, its app, or SSE. No accounts, no API keys.

This is an upgrade to the "simulated (logged/stubbed, never actually sent)" notification the brief only requires, not a requirement itself — it turns a console.log into something demoable live in an interview (dispute resolves → a real push notification arrives), while staying honest that it's not real email/SMS delivery. See `docs/brief.md` for why the event-driven line exists at all.

## Scope boundary — read before wiring this up

**ntfy is for the dispute-status notification only. It is not, and must not become, the delivery channel for anything auth-related** (OTP codes, magic links, password resets). Those are credentials, not notifications — ntfy topics are broadcast by design, and using one for a sign-in code would mean anyone who knows the topic name can read it unless every user gets an unguessable, access-controlled private topic. That's a worse security story than the thing it'd replace.

This is moot for this project anyway: auth is plain Better Auth email+password (see `CLAUDE.md`), not the passwordless email-OTP pattern `ubuntu-stories` uses. Email+password needs no outbound delivery of anything, so there's no OTP/magic-link delivery problem to solve, and no Gmail SMTP or Google OAuth dependency to carry over — deliberately simpler than `ubuntu-stories`' auth setup because the brief never asked for passwordless or social login.

## How it's wired

- `compose.yml` gains an `ntfy` service (official `binwiederhier/ntfy` image), alongside Postgres/api/web.
- On a dispute status change (in the `POST /internal/disputes/:id/resolve` handler — see `docs/api.md`), the api publishes to a per-user topic, e.g. `POST http://ntfy:80/dispute-updates-{userId}` with the new status as the message body.
- Per-user topics (not one shared topic) so one customer's dispute activity isn't visible to another — the same authz principle as everything else in `docs/domain-model.md`, applied to the notification channel too.
- Local dev: subscribe via `curl -s http://localhost:8080/dispute-updates-{userId}/json` or the ntfy web UI to watch events arrive while testing the dispute flow.

## Explicitly out of scope

- Real email/SMS/push delivery of any kind — ntfy is the same "simulated, not really sent" tier as before, just a more tangible simulation.
- Any auth-credential delivery (OTP, magic links, password resets) — see Scope boundary above.
- A public ntfy.sh topic — self-hosted only, so the submission doesn't depend on a third party being up during review.
