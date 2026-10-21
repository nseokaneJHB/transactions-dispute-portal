# Infrastructure

How the system connects end to end: container topology, data model, one real request/notification flow, and the target cloud/k8s shape beyond this repo. *Why*: `docs/progress-and-decisions.md` (numbers referenced inline). User-facing flows: `docs/user-stories.md`. Request-level backend behavior (stateless API, rate limiting, idempotency, health endpoints): `docs/backend-service.md`. Production deploy: `docs/production-runbook.md`.

## Container topology

`docker compose up -d` starts five containers in one compose project (`transaction-dispute-portal`). Each publishes its own `localhost` port; there is no reverse proxy (`docs/progress-and-decisions.md` #65).

```mermaid
flowchart LR
    Browser(["Browser<br/>customer / admin"])
    DevTools(["Dev tools<br/>psql · Mailpit UI · ntfy UI"])

    subgraph App["application tier"]
        direction TB
        Web["web<br/>TanStack Start · localhost:3000"]
        Api["api<br/>Fastify · localhost:8080"]
    end

    subgraph Data["data & support tier"]
        direction TB
        Db[("database<br/>Postgres · localhost:5432")]
        Mailpit["mailpit<br/>smtp :1025 · UI localhost:8025"]
        Ntfy["ntfy<br/>localhost:8090"]
    end

    Browser -->|"pages"| Web
    Browser -->|"/v1/* (XHR, cookie)"| Api
    Browser -.->|"SSE subscribe"| Ntfy
    Web -.->|"SSR loaders, http://api:8080"| Api

    Api --> Db
    Api -->|"OTP / invite email"| Mailpit
    Api -.->|"publish, http://ntfy"| Ntfy

    DevTools -.- Db
    DevTools -.- Mailpit
    DevTools -.- Ntfy

    classDef app fill:#dbe6f5,stroke:#31578f,color:#1c3252;
    classDef data fill:#dcefe1,stroke:#1f7a4d,color:#123f28;
    classDef client fill:#eceee9,stroke:#57655d,color:#2c332e;

    class Web,Api app
    class Db,Mailpit,Ntfy data
    class Browser,DevTools client
```

Two paths reach `api`/`ntfy` two different ways:

- **`web` → `api`.** The browser calls `http://localhost:8080` (`VITE_API_URL`). The session cookie travels because `localhost:3000` and `localhost:8080` are same-site, and CORS allows `http://localhost:3000`. TanStack Start's SSR loaders inside the `web` container call `http://api:8080` (`SERVER_API_URL`) over the compose network instead, forwarding the caller's cookie.
- **`api` → `ntfy`.** `api` publishes container-to-container (`NTFY_URL=http://ntfy`). The browser subscribes over SSE at `http://localhost:8090` (`VITE_NTFY_URL`).

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

One flow through the topology above, chosen for the parts that are easy to get wrong: the guarded writes (`docs/progress-and-decisions.md` #4/#41) and the publish/subscribe split for `ntfy`.

```mermaid
sequenceDiagram
    participant C as Customer browser
    participant A as api (Fastify)
    participant D as database (Postgres)
    participant N as ntfy
    participant Ad as Admin browser

    Note over C,N: Customer's browser holds an open SSE connection to ntfy's dispute-updates-&lt;userId&gt; topic

    C->>A: POST /v1/disputes
    A->>D: INSERT (partial unique index: one open dispute per transaction, #40)
    A-->>C: 201, dispute SUBMITTED

    Ad->>A: POST /v1/admin/disputes/:id/review
    A->>D: UPDATE … WHERE status='SUBMITTED'
    A-->>Ad: 200, UNDER_REVIEW
    A->>N: publish "under review"
    N--)C: SSE frame → toast

    Ad->>A: POST /v1/admin/disputes/:id/resolve
    A->>D: UPDATE … WHERE status='UNDER_REVIEW'
    A-->>Ad: 200, RESOLVED
    A->>N: publish "resolved"
    N--)C: SSE frame → toast
```

The two `UPDATE … WHERE` steps are load-bearing: the "from" status sits in the `WHERE` clause, not a prior read, so a concurrent second call matches nothing and gets `409` instead of double-writing or double-publishing.

## Production target (documented, not built)

Nothing below is deployed; the step-by-step, including k8s manifests, is `docs/production-runbook.md`.

| Area | Target | Why |
| --- | --- | --- |
| Production DB | Managed Postgres (RDS/Aurora Multi-AZ or Azure equivalent) | Automated failover + backups; RTO/RPO tradeoff |
| Read replica | For the historic-disputes read path | Once write/read ratio justifies it — ties to the indexing story above |
| Load balancing | ALB/API Gateway → ECS/Fargate or k8s Ingress in front of the stateless API | Meaningful only *because* the API is stateless; also the stable domain the frontend is built against, so infra can move behind it without invalidating an already-built client bundle (`docs/production-runbook.md` §3) |
| Event durability | Move the status-change event to SQS/EventBridge | Today it's in-process/simulated; production shouldn't let a notification-consumer failure touch the API request path |
| Session-lookup cost | Short-TTL cache on the session read, or Better Auth's cookie-cache/JWT session mode | The load test (`docs/progress-and-decisions.md` #48) shows the DB-backed session check, not Postgres or Fastify, is the authenticated-route ceiling — mitigate the read, don't move state back into the process |
