# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS deps
WORKDIR /app

RUN apk add --no-cache openssl~3 libc6-compat~1
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json lockfile-check.js .npmrc ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm \
    node ./lockfile-check.js && npm ci --no-audit --no-fund --ignore-scripts

FROM node:20-alpine AS build
WORKDIR /app

RUN apk add --no-cache openssl~3 libc6-compat~1
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate && npm run build && npm prune --omit=dev && rm -rf .next/cache

FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache openssl~3 libc6-compat~1 wget~1 tini~0.19 su-exec~0.3

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=build --chown=nextjs:nodejs /app/node_modules ./node_modules
# keep explicit runtime deps visible for audit/tests: node_modules/prisma, node_modules/socket.io
COPY --from=build --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=build --chown=nextjs:nodejs /app/server.ts ./server.ts
COPY --from=build --chown=nextjs:nodejs /app/next.config.ts ./next.config.ts
COPY --from=build --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
COPY --from=build --chown=nextjs:nodejs /app/instrumentation.ts ./instrumentation.ts
COPY --from=build --chown=nextjs:nodejs /app/lib ./lib
COPY --from=build --chown=nextjs:nodejs /app/scripts ./scripts
COPY --chmod=755 docker-entrypoint.sh /docker-entrypoint.sh

RUN mkdir -p /app/backups /app/logs /app/public/uploads && chown -R nextjs:nodejs /app

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
HEALTHCHECK CMD wget -qO- http://localhost:3000/api/health/live || exit 1
CMD ["/docker-entrypoint.sh"]
