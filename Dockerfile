FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json .npmrc* ./
# Use the injected .npmrc (Taobao + Binary Mirrors) for maximum reliability
ENV NPM_CONFIG_LOGLEVEL=verbose
ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
# Critical: Set binary mirrors via ENV to ensure they are picked up
ENV SHARP_BINARY_HOST=https://npmmirror.com/mirrors/sharp
ENV SHARP_LIBVIPS_BINARY_HOST=https://npmmirror.com/mirrors/sharp-libvips
ENV PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
ENV SASS_BINARY_SITE=https://npmmirror.com/mirrors/node-sass
ENV NPM_CONFIG_MAXSOCKETS=4

# Install system dependencies for Prisma (OpenSSL + libc compatibility)
RUN apk add --no-cache openssl libc6-compat

# Remove package-lock.json to force resolution from the mirror
RUN rm -f package-lock.json
RUN npm install --no-audit --no-fund --legacy-peer-deps
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
