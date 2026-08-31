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
# DEPENDENCIES
# =========================
FROM base AS deps

COPY --chown=node:node package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json prettier.config.js ./
COPY --chown=node:node web/package.json ./web/
COPY --chown=node:node shared/package.json ./shared/

USER node
ENV CI=true

RUN pnpm install --frozen-lockfile

# =========================
# DEVELOPMENT
# =========================
FROM deps AS dev

COPY --chown=node:node web ./web
COPY --chown=node:node shared ./shared

EXPOSE 3000

CMD ["pnpm", "--filter", "@transaction-dispute-portal/web", "dev", "--host", "0.0.0.0"]
