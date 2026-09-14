# Infrastructure

How the system connects end to end: container topology, data model, one real request/notification flow, and the target cloud/k8s shape beyond this repo. *Why*: `docs/progress-and-decisions.md` (numbers referenced inline). User-facing flows: `docs/user-stories.md`. Request-level backend behavior (stateless API, rate limiting, idempotency, health endpoints): `docs/backend-service.md`. Production deploy: `docs/production-runbook.md`.

## Container topology

`proxy` (nginx, `docs/progress-and-decisions.md` #61) is the only service publishing its app-facing port — `web` and `api` are `expose`-only, reachable exclusively through it. `database`, `mailpit`, and `ntfy` also publish their own ports directly, for dev tooling (`psql`, Mailpit UI, ntfy UI) only.

```mermaid
flowchart LR
    Browser(["Browser<br/>customer / admin"])
    DevTools(["Dev tools<br/>psql · Mailpit UI · ntfy UI"])

    Proxy["proxy — nginx<br/>:80, the only published app port"]

    subgraph App["application tier"]
        direction TB
        Web["web<br/>TanStack Start · :3000"]
        Api["api<br/>Fastify · :8080"]
    end

    subgraph Data["data & support tier"]
        direction TB
        Db[("database<br/>Postgres · :5432")]
        Mailpit["mailpit<br/>:1025 smtp / :8025 ui"]
        Ntfy["ntfy<br/>:80 → :8090"]
    end

    Browser --> Proxy
    Proxy -->|"/"| Web
    Proxy -->|"/v1/*, /healthz, /readyz"| Api
    Proxy -.->|"/ntfy/* (SSE)"| Ntfy

    Web -.->|"SSR loaders, direct"| Api

    Api --> Db
    Api -->|"OTP / invite email"| Mailpit
    Api -.->|"publish, direct"| Ntfy

    DevTools -.- Db
    DevTools -.- Mailpit
    DevTools -.- Ntfy

    classDef proxy fill:#f6e9d3,stroke:#97600f,color:#4a3208,stroke-width:1.5px;
    classDef app fill:#dbe6f5,stroke:#31578f,color:#1c3252;
    classDef data fill:#dcefe1,stroke:#1f7a4d,color:#123f28;
    classDef client fill:#eceee9,stroke:#57655d,color:#2c332e;

    class Proxy proxy
    class Web,Api app
    class Db,Mailpit,Ntfy data
    class Browser,DevTools client
```

Two paths run through this topology twice, browser vs. server:

- **`web` → `api`.** Browser fetches go out to `http://dispute-portal` and back through the proxy (`VITE_API_URL`). `web`'s server (TanStack Start's SSR loaders, inside the `web` container) calls `api` directly over the compose network instead (`SERVER_API_URL=http://transaction-dispute-portal-api:8080`), bypassing the proxy.
- **`api` → `ntfy`.** `api` publishes dispute-status events straight to `ntfy` container-to-container (`NTFY_URL`), no proxy hop. The browser's SSE subscription goes through the proxy at `/ntfy/*` instead, since it only knows the one public origin (`docs/progress-and-decisions.md` #61). SSE needs `proxy_buffering off` and a long read timeout, so `/ntfy/` has its own `location` block in `nginx.conf`.

## Data model

Nine tables: four Better Auth's own (`user`, `account`, `session`, `verification`, plus `auth_audit_log` wrapping login events — `docs/progress-and-decisions.md` #21/#37), four the product's (`transaction`, `dispute`, `dispute_audit_log`, `admin_invite` — `docs/progress-and-decisions.md` #16/#40/#41). `dispute` has two FKs to `user`: filer (`user_id`) and closer (`resolved_by`, nullable until resolved).

```mermaid
erDiagram
    USER {
        uuid id PK
        string name
        string email UK
        boolean email_verified
        enum role
        timestamp created_at
        timestamp updated_at
    }
    ACCOUNT {
        uuid id PK
        uuid user_id FK
        string issuer
        string account_id
        string provider_id
        string password
        string access_token
        string refresh_token
        string id_token
        timestamp created_at
    }
    SESSION {
        uuid id PK
        uuid user_id FK
        string token UK
        string ip_address
        string user_agent
        timestamp expires_at
    }
    VERIFICATION {
        uuid id PK
        string identifier
        string value
        timestamp expires_at
    }
    AUTH_AUDIT_LOG {
        uuid id PK
        uuid user_id FK
        string email
        enum event
        string ip_address
        timestamp created_at
    }
    TRANSACTION {
        uuid id PK
        uuid user_id FK
        bigint amount_cents
        string merchant_name
        timestamp transacted_at
    }
    DISPUTE {
        uuid id PK
        uuid user_id FK
        uuid transaction_id FK
        uuid resolved_by FK
        enum status
        enum reason
        string description
        string resolution_note
        timestamp resolved_at
    }
    DISPUTE_AUDIT_LOG {
        uuid id PK
        uuid dispute_id FK
        uuid actor_id FK
        enum from_status
        enum to_status
        string note
        timestamp created_at
    }
    ADMIN_INVITE {
        uuid id PK
        uuid invited_by FK
        string email
        string token UK
        timestamp expires_at
        timestamp accepted_at
    }

    USER ||--o{ ACCOUNT : "logs in via"
    USER ||--o{ SESSION : "holds"
    USER ||--o{ AUTH_AUDIT_LOG : "generates"
    USER ||--o{ TRANSACTION : "owns"
    USER ||--o{ DISPUTE : "files (user_id)"
    USER ||--o{ DISPUTE : "resolves (resolved_by)"
    USER ||--o{ DISPUTE_AUDIT_LOG : "acts as (actor_id)"
    USER ||--o{ ADMIN_INVITE : "sends (invited_by)"
    TRANSACTION ||--o{ DISPUTE : "disputed by"
    DISPUTE ||--o{ DISPUTE_AUDIT_LOG : "logs"
```

`VERIFICATION` has no FK — Better Auth keys it by `identifier` (the OTP's target email), not `user_id`, since the account may not exist yet. Two constraints are partial unique indexes, not plain `UK` columns, both enforced in Postgres, not app code: `dispute` allows only one row per `transaction_id` while `status` is `SUBMITTED`/`UNDER_REVIEW` (`docs/progress-and-decisions.md` #40); `admin_invite` allows only one row per `email` while `accepted_at` is null.

## Request flow: submit → review → resolve → notify

One flow through the topology above, chosen for the parts that are easy to get wrong: the guarded writes (`docs/progress-and-decisions.md` #4/#41) and the publish-direct-but-subscribe-proxied split for `ntfy`.

```mermaid
sequenceDiagram
    participant C as Customer browser
    participant P as proxy (nginx)
    participant A as api (Fastify)
    participant D as database (Postgres)
    participant N as ntfy
    participant Ad as Admin browser

    Note over C,N: Customer's browser holds an open SSE connection to /ntfy/&lt;their-topic&gt; the whole time

    C->>P: POST /v1/disputes
    P->>A: forward
    A->>D: guarded INSERT<br/>(one open dispute per transaction, #40)
    D-->>A: 201, dispute SUBMITTED
    A-->>P: 201
    P-->>C: 201

    Ad->>P: POST /v1/admin/disputes/:id/review
    P->>A: forward
    A->>D: guarded UPDATE … WHERE status='SUBMITTED'
    D-->>A: UNDER_REVIEW
    A-->>P: 200
    P-->>Ad: 200
    A->>N: publish "under review" (direct, NTFY_URL)
    N--)P: SSE frame
    P--)C: SSE frame → toast

    Ad->>P: POST /v1/admin/disputes/:id/resolve
    P->>A: forward
    A->>D: guarded UPDATE … WHERE status='UNDER_REVIEW'
    D-->>A: RESOLVED
    A-->>P: 200
    P-->>Ad: 200
    A->>N: publish "resolved" (direct, NTFY_URL)
    N--)P: SSE frame
    P--)C: SSE frame → toast
```

The two `UPDATE … WHERE` steps are load-bearing: the "from" status sits in the `WHERE` clause, not a prior read, so a concurrent second call matches nothing and gets `409` instead of double-writing or double-publishing — verified under 5,000 simultaneous identical requests (this session's load-test artifact), not just the sequential case the integration suite covers.

## k8s manifests vs. documented-only targets

`k8s/` manifests are a planned, concrete deliverable, not just prose (`docs/progress-and-decisions.md` #10): `replicas: 3`, resource requests/limits, an HPA keyed on CPU, a PodDisruptionBudget — real enough to point to on screen, never actually deployed. Step-by-step for writing them: `docs/production-runbook.md` §8. Everything else below is target architecture, stated and justified, not built:

| Area | Target | Why |
| --- | --- | --- |
| Production DB | Managed Postgres (RDS/Aurora Multi-AZ or Azure equivalent) | Automated failover + backups; RTO/RPO tradeoff |
| Read replica | For the historic-disputes read path | Once write/read ratio justifies it — ties to the indexing story above |
| Load balancing | ALB/API Gateway → ECS/Fargate or k8s Ingress in front of the stateless API | Meaningful only *because* the API is stateless; also the stable domain the frontend is built against, so infra can move behind it without invalidating an already-built client bundle (`docs/production-runbook.md` §3) |
| Event durability | Move the status-change event to SQS/EventBridge | Today it's in-process/simulated; production shouldn't let a notification-consumer failure touch the API request path |
| Session-lookup cost | Short-TTL cache on the session read, or Better Auth's cookie-cache/JWT session mode | The load test (`docs/progress-and-decisions.md`'s Progress section) shows the DB-backed session check, not Postgres or Fastify, is the authenticated-route ceiling — mitigate the read, don't move state back into the process |

README's cloud/k8s mention: one short paragraph, AWS target (ECS/Fargate + RDS), no live infra required.
