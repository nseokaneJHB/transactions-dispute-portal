# Auth: verifying credentials belong to the signer-in

"How do we know the credentials being used to sign in actually belong to the person signing in?" Login is email-OTP — Better Auth's built-in email-OTP plugin (`docs/decisions.md` #21; see that decision for why username+password was rejected in favor of this). Every login sends a one-time code to the account's email; entering it correctly, within its expiry, is the only credential. There's no separate "prove you own this email" step at signup distinct from login — every login already is that proof, every time (decision 17's one-time signup-only verification gate is superseded and folded into this: OTP subsumes it).

## 1. OTP code integrity — build this

A 6-digit OTP code has a narrow search space (1,000,000 possibilities) and a short shelf life. The controls target that:

- **Rate limiting + lockout on OTP verification attempts, per account** — a handful of wrong guesses (e.g. 5) invalidates the code and requires a fresh one, rather than allowing unlimited guesses within the expiry window. Tighter than the general `@fastify/rate-limit` config on other endpoints (`docs/scaling-and-resilience.md`) — an attacker distributing guesses across IPs still hits the per-account limit.
- **Short code expiry** (e.g. 5–10 minutes) — narrows the window a leaked/intercepted code is useful for.
- **Secure session cookies** — `httpOnly`/`SameSite`, DB-backed sessions, no session token exposed to client-side JS.
- **Auth audit log** — login success/failure, timestamp, source IP, extending the same `DisputeAuditLog` pattern (`docs/domain-model.md`) to auth events. A spike of failed OTP attempts against one account is visible, not silent.

## 2. The login-critical-path dependency this creates — accepted, and resolved

Decision 1 originally rejected email-OTP specifically because it puts outbound email delivery on the path every login depends on — for the one review event with no do-over, that's a real risk, not a hypothetical. Decision 21 reverses that call by explicit instruction; this section is the honest accounting of what that costs, and how it's resolved for this project (`docs/decisions.md` #21).

**Resolved: Mailpit is accepted as sufficient for this project's dev and demo purposes.** Committed `api/.env` points `SMTP_HOST`/`SMTP_PORT` at the local Mailpit catcher; the OTP code is readable at `localhost:8025` the moment it's "sent" — no auth, no external network call, nothing secret about that config. This holds for local dev (Nolan, day to day) and for the reviewed submission itself: real SMTP is **documented as a production requirement, not built** for this submission — the same "documented, not built" pattern decision 13 originally used for signup verification, applied here to a flow this submission doesn't need to exercise for real.

**Mailpit's real limitation, and why it doesn't matter here:** Mailpit has no per-user or per-recipient mailbox isolation — confirmed against its own docs, its only auth option (`MP_UI_AUTH_FILE`) is a single shared username/password for the *entire* web UI, not per-mailbox access control. Anyone holding that one credential (or, locally, anyone who can reach `localhost:8025` at all) sees every account's OTP code in one inbox — structurally the same shared-topic problem decision 3 already flagged for ntfy, and not something Mailpit can be configured out of. This is acceptable here because Mailpit's actual audience is a single trusted operator (Nolan locally, or one reviewer running their own `docker-compose up`) intentionally reading codes for accounts *they themselves* are testing — not multiple different people sharing one running instance, which this project was never going to do (no live cloud deployment).

**Production:** real per-recipient isolation isn't something to configure into Mailpit — it's inherent to not using Mailpit at all. Swap `SMTP_HOST`/`PORT`/`USER`/`PASS` (provider-agnostic already, decisions 14/19) for a real transactional provider and every user's OTP goes to *their own* real inbox, gated by their own email login. Zero code change, an env-var swap in a real deployment's config — documented here, not built, since this submission has no production deployment to point it at.

## 3. Account-recovery & compromise alerts — build this, via outbound SMTP

Different from OTP delivery itself: this is a **notification**, not the login gate — if the mail provider is slow or briefly down, an alert arrives late, it never blocks logging in (logging in already depends on mail delivery for a different reason, per section 2 above; this is additional, non-blocking traffic on top of that).

Built:

- **New-device/new-location login alert** — sent (async, non-blocking) on a login from an unrecognized session fingerprint. The primary way a compromised account would actually get noticed, now that "compromised" means "someone else can receive your OTP codes."
- **Email-changed confirmation** — sent to the _old_ address when the account email changes, so an attacker who does get in can't quietly redirect where future OTP codes go without the real owner finding out.

There is no separate recovery credential: email access *is* the credential. If someone loses access to their email, there's no self-service recovery path — a real, accepted limitation, documented here rather than built (`docs/decisions.md` #14's narrowing note).

Provider-agnostic SMTP config (`SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` — works with a Gmail App Password or any transactional provider).

Committed `api/.env` points `SMTP_HOST`/`SMTP_PORT` at the local Mailpit catcher — mail is captured locally, no auth needed so nothing there is secret. To have OTP codes and recovery/invite emails land in a real inbox instead, fill in `SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` with a real Gmail App Password in `api/.env.local` — gitignored, never committed, README.md's "Local setup" section has the steps; see `docs/decisions.md` #20.

## Explicitly rejected: CAPTCHA / third-party bot detection on login

A hosted CAPTCHA (hCaptcha/Turnstile/reCAPTCHA) sitting in front of the login flow the reviewer has to use is an external dependency on the one flow that gates everything else, for the one review event with no do-over. Rate limiting + lockout (above) covers the same automated-attack surface without adding a second external dependency on top of the one section 2 already accepts.
