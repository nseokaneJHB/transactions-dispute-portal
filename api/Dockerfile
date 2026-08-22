# =========================
# BASE
# =========================
FROM node:24-alpine AS base

ENV COREPACK_ENABLE_STRICT=0
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable || npm install -g pnpm@11.22.0 && corepack prepare pnpm@11.22.0 --activate

WORKDIR /workspace
RUN chown -R node:node /workspace

# =========================
# DEPENDENCIES (full workspace, incl. devDependencies — needed to build)
# =========================
FROM base AS deps

COPY --chown=node:node package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY --chown=node:node api/package.json ./api/
COPY --chown=node:node shared/package.json ./shared/

USER node
ENV CI=true

RUN pnpm install --frozen-lockfile

# =========================
# BUILD
# =========================
FROM deps AS build

COPY --chown=node:node api ./api
COPY --chown=node:node shared ./shared

# Builds shared first (workspace dependency), then the API — turbo resolves
# the order via ^build; --filter scopes the run to just what api needs.
RUN pnpm --filter @transaction-dispute-portal/api... build

# =========================
# PROD DEPENDENCIES ONLY
# =========================
FROM base AS prod-deps

COPY --chown=node:node package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY --chown=node:node api/package.json ./api/
COPY --chown=node:node shared/package.json ./shared/

USER node
ENV CI=true

RUN pnpm install --frozen-lockfile --prod

# =========================
# RUNTIME
# =========================
FROM node:24-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /workspace

# Runs as the built-in non-root `node` user
USER node

COPY --chown=node:node --from=prod-deps /workspace/node_modules ./node_modules
COPY --chown=node:node --from=prod-deps /workspace/api/node_modules ./api/node_modules
# shared has no runtime dependencies today, so pnpm never creates
# shared/node_modules — re-add this COPY if that changes.
COPY --chown=node:node --from=prod-deps /workspace/api/package.json ./api/package.json
COPY --chown=node:node --from=prod-deps /workspace/shared/package.json ./shared/package.json

# Compiled output only — no source, no source maps, no devDependencies
COPY --chown=node:node --from=build /workspace/api/dist ./api/dist
COPY --chown=node:node --from=build /workspace/shared/dist ./shared/dist

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
	CMD node -e "fetch('http://localhost:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /workspace/api
CMD ["node", "dist/app.js"]
