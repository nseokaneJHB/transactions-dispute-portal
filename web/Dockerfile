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
COPY --chown=node:node web/package.json ./web/
COPY --chown=node:node shared/package.json ./shared/

USER node
ENV CI=true

RUN pnpm install --frozen-lockfile

# =========================
# BUILD
# =========================
FROM deps AS build

COPY --chown=node:node web ./web
COPY --chown=node:node shared ./shared

RUN pnpm --filter @transaction-dispute-portal/web... build

# =========================
# PROD DEPENDENCIES ONLY
# =========================
FROM base AS prod-deps

COPY --chown=node:node package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY --chown=node:node web/package.json ./web/
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

USER node

# Vite's SSR build externalizes node_modules deps (react/react-dom etc.)
# rather than bundling them, so the runtime image still needs node_modules.
COPY --chown=node:node --from=prod-deps /workspace/node_modules ./node_modules
COPY --chown=node:node --from=prod-deps /workspace/web/node_modules ./web/node_modules
COPY --chown=node:node --from=build /workspace/web/dist ./web/dist
COPY --chown=node:node web/server.mjs ./web/server.mjs

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
	CMD node -e "fetch('http://localhost:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /workspace/web
CMD ["node", "server.mjs"]
