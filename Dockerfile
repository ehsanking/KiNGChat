FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json .npmrc* ./
# Use a highly reliable mirror and npm install instead of npm ci
# npm ci strictly uses package-lock.json URLs which are blocked in restricted networks
RUN npm config set registry https://registry.npmmirror.com && \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm install --no-audit --no-fund --legacy-peer-deps
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV production
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000
ENV PORT 3000
CMD ["npm", "run", "start"]
