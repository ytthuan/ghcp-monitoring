# Pinned by digest for reproducibility. Update with:
#   docker pull node:22-alpine && docker inspect --format='{{index .RepoDigests 0}}' node:22-alpine
ARG NODE_IMAGE=node:22-alpine@sha256:8ea2348b068a9544dae7317b4f3aafcdc032df1647bb7d768a05a5cad1a7683f

# ─── builder ───────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# ─── runtime ───────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0
RUN apk add --no-cache wget
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/server.mjs ./server.mjs
COPY --from=builder --chown=node:node /app/app/server/auth.mjs ./app/server/auth.mjs
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/healthz | grep -q '"ok":true' || exit 1
CMD ["node", "server.mjs"]
