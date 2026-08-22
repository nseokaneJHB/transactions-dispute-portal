# Brief & why these choices exist

## What this is

Solo submission for Nolan's internal promotion evaluation to Software Engineer II: Full Stack at Capitec. This repo is the only artifact the panel evaluates before a possible interview — build and document it like production, not a take-home toy.

- Deadline: ~1 month from receiving the brief (see maintainer note in `CLAUDE.md` for exact date)
- Submit by email: public GitHub link, language (TypeScript), track (Full Stack)
- Hard requirements: production-grade code, a runnable Dockerfile, a README with build/run/test instructions

## The brief

Front end + back end for customers to:

- View their transactions
- Dispute a transaction
- See a historic view of their past disputes

Of the three offered briefs (Appointment Booking System, Transactions Dispute Portal, Business Invoice Tracker), this one was picked because it's the most Capitec-native, gives an honest dispute-lifecycle state machine, a real pagination/filtering/indexing story via a large seeded transaction table, a natural authz-scoping + audit-trail story, and a clean non-forced excuse for an event-driven status-change notification.

## Why these choices exist (JD mapping)

The Full Stack JD grades on top of generic SE II duties (SDLC, testing, CICD, devsecops) with these specifics — every non-trivial decision in this repo exists to earn one of these honestly, not check a box:

- DB/query optimization
- RESTful API design
- Cloud awareness (AWS/Azure)
- Microservice & event-driven architecture
- Kubernetes/containerization
- Responsive/mobile-first front end
- Browser compatibility & performance
- Front-end build tooling

If a proposed feature doesn't trace to one of these lines (or to a hard submission requirement), treat it as scope creep for a one-month solo build — flag it rather than silently adding it.

**Be precise about "microservice"** when talking about this repo: it's one Fastify app with an in-process event-driven notification pattern, not multiple deployed services. Say "event-driven," not "microservices" — an interviewer probing that word will catch the gap fast if it's overclaimed.
