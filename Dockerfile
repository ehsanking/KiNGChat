FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json .npmrc* ./
# Use the injected .npmrc (Taobao + Binary Mirrors) for maximum reliability
ENV NPM_CONFIG_LOGLEVEL=verbose
# Remove package-lock.json to force resolution from the mirror
RUN rm -f package-lock.json
RUN npm install --registry=https://registry.npmmirror.com --no-audit --no-fund --legacy-peer-deps --maxsockets=10
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
