# syntax=docker/dockerfile:1
# Node 24.14+ is required by the application's node:sqlite implementation.
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM dependencies AS build
COPY . .
ENV NODE_ENV=production
RUN npm run build

# Operator-only image: admin creation, verified SQLite backups and the optional
# Workflow worker use tsx and source files, which are excluded from the web image.
FROM build AS maintenance
RUN mkdir -p /app/.data && chown node:node /app/.data
USER node
ENV COMMUNITY_DB_PATH=/app/.data/community.db
CMD ["npm", "run", "db:backup"]

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3100 \
    COMMUNITY_DB_PATH=/app/.data/community.db \
    WEBSITE_ASSET_DIR=/app/.data/website-assets \
    COMMUNITY_MEDIA_PATH=/app/.data/workflow-media
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/THIRD_PARTY_NOTICES.md ./THIRD_PARTY_NOTICES.md
COPY --from=build --chown=node:node /app/lib/vendor ./lib/vendor
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json /app/next.config.ts ./
RUN mkdir -p /app/.data && chown node:node /app/.data
USER node
EXPOSE 3100
STOPSIGNAL SIGTERM
# A liveness check; it does not certify AI providers or publishing connections.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3100/',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3100"]
