# Scaling & resilience

These exist so questions on scaling/failover/traffic/resilience have a real answer backed by code or a manifest, not just a claim.

## Build these — cheap, and each backs a real interview answer

- **Stateless API** — Better Auth sessions live in Postgres, not in-memory. No server-local state is what actually _makes_ horizontal scaling true; state this explicitly in the README rather than just asserting "it scales."
- **Rate limiting** — `@fastify/rate-limit` on write endpoints. Real answer to "how do you handle traffic spikes/abuse."
- **Idempotency / one-open-dispute-per-transaction** — see `docs/api.md` (`POST /api/disputes`).
- **Health endpoints** — `/healthz`, `/readyz` (see `docs/api.md`). Needed for k8s liveness/readiness probes anyway, and it's the hook for the failover conversation (pod dies → readiness probe fails → traffic drained → rolling replacement).
- **`k8s/` manifests with substance** — `replicas: 3`, resource requests/limits, an HPA keyed on CPU, and a PodDisruptionBudget. None of this needs to run, but a manifest with an HPA + PDB is something to point to on screen, not hand-waved.
- **One real load-test number** — run `autocannon` or `k6` once against the paginated disputes endpoint, put the measured p95 latency/RPS in the README. Highest-leverage item here: a number beats a claim, for near-zero effort.

## Document only — state the target architecture and why, don't build it

- Production DB is managed Postgres (RDS/Aurora Multi-AZ or Azure equivalent) — automated failover and backups; one line on the RTO/RPO tradeoff.
- Read replica for the historic-disputes read path once write/read ratio justifies it — ties to the indexing story above.
- ALB/API Gateway → ECS/Fargate or k8s Ingress in front of the stateless API — call out explicitly that the LB is only meaningful _because_ the API is stateless, don't list it as a bullet on its own.
- Event durability caveat: today the status-change event is in-process/simulated; production would move it to SQS/EventBridge so a notification-consumer failure can't affect the API request path.

## Cloud/K8s in the README

A short paragraph on an AWS deployment target (ECS/Fargate + RDS) is enough — no live infra required.
