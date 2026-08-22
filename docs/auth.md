# Auth: verifying credentials belong to the signer-in

"How do we know the credentials being used to sign in actually belong to the person signing in?" is two separate problems, and they get different answers here.

## 1. Login credential integrity — build this

Password hashing (decision 1 in `docs/decisions.md`) only proves _someone_ knew the secret paired with the account. It doesn't prove that secret wasn't guessed, brute-forced, or reused from a breach elsewhere — that's the actual "is this really them" question, and it's answered at login, not signup:

- **Rate limiting + progressive backoff on login specifically** — tighter than the general `@fastify/rate-limit` config on other endpoints (`docs/scaling-and-resilience.md`). Repeated failed attempts against one account slow down and eventually lock, not just throttle by IP — an attacker distributing attempts across IPs still hits the per-account limit.
- **Minimum password strength** — enforced at signup/password-change, not just "must be 8 characters." Reduces the pool of guessable passwords in the first place.
- **Breach-corpus check (HaveIBeenPwned's Pwned Passwords API, k-anonymity mode)** — a password is checked against known-leaked corpora using a k-anonymity hash-prefix scheme that never sends the actual password (or its full hash) to the third party. Reject known-breached passwords at signup/change. This is the most concrete, defensible answer to "how do you know the credentials belong to them, not stolen" — a huge share of account-takeover attempts succeed purely because a password was reused from an unrelated breach.
  - **Fails open, not closed**: if the HIBP API is unreachable, signup/password-change proceeds anyway rather than blocking. A third-party outage must never be able to lock the reviewer out of creating or using an account — same principle that ruled out Google OAuth as the primary login mechanism, applied here with a much smaller blast radius (this is an advisory check on password _change_, not the login path itself, so an outage degrades one signup-time check, not the ability to sign in at all).
- **Secure session cookies** — already decided: `httpOnly`/`SameSite`, DB-backed sessions, no session token exposed to client-side JS. Stops a stolen credential's blast radius from extending past the login moment via session fixation/XSS.
- **Auth audit log** — login success/failure, timestamp, source IP, extending the same `DisputeAuditLog` pattern (`docs/domain-model.md`) to auth events. Doesn't prevent an attack, but is the concrete answer to "how would you detect one happening" — a spike of failed logins against one account is visible, not silent.

## 2. Signup identity binding — document only, don't build

Classic email verification (send a link, require it clicked before the account is trusted) needs a real outbound email channel — which is exactly the Gmail SMTP dependency decision 1 deliberately dropped to avoid a Google dependency on the login path. Building it here would reopen that exact tradeoff for a flow the demo doesn't actually exercise: the panel signs into **seeded accounts with real transaction history**, not a self-registered account (which would have nothing to dispute — see `docs/domain-model.md`'s seed data plan).

Production answer, stated but not built: gate account status at `unverified` until a link sent via a real transactional email provider (Postmark/Resend/SES — not Gmail SMTP, which isn't meant for transactional volume anyway) is clicked. Self-registration exists in this repo because Better Auth provides it for free and it's worth having the flow testable, but it isn't part of the reviewed demo path and isn't gated behind email verification.

## Explicitly rejected: CAPTCHA / third-party bot detection on login

Same reasoning that ruled out Google OAuth: a hosted CAPTCHA (hCaptcha/Turnstile/reCAPTCHA) sitting in front of the login form the reviewer has to use is an external dependency on the one flow that gates everything else, for the one review event with no do-over. Rate limiting + progressive backoff (above) covers the same automated-attack surface without that risk.

## Stretch goal, not core: TOTP-based MFA

The strongest real answer to "prove these credentials belong to them" is a second factor — Better Auth has a TOTP plugin. Worth adding in week 4 polish if time allows (`docs/definition-of-done.md`'s pace), but password + the login protections above is the floor this project commits to; MFA is upside, not a gap if it doesn't make the timeline.
