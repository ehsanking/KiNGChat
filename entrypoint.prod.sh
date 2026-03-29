#!/bin/sh
set -eu

fail() {
  echo "[entrypoint] ERROR: $1" >&2
  exit 1
}

export APP_ENV="${APP_ENV:-production}"
export NODE_ENV="${NODE_ENV:-production}"

node -e "require('./lib/env-security').validateProductionEnvironment()" || fail "Production environment validation failed."

PRISMA_BIN=""
if [ -x ./node_modules/.bin/prisma ]; then
  PRISMA_BIN="./node_modules/.bin/prisma"
elif [ -f ./node_modules/prisma/build/index.js ]; then
  PRISMA_BIN="node ./node_modules/prisma/build/index.js"
fi

[ -z "$PRISMA_BIN" ] && fail "Prisma CLI not found."

MIGRATE_DATABASE_URL="${MIGRATION_DATABASE_URL:-${DATABASE_URL:-}}"
[ -z "$MIGRATE_DATABASE_URL" ] && fail "DATABASE_URL (or MIGRATION_DATABASE_URL) is required."
DATABASE_URL="$MIGRATE_DATABASE_URL" $PRISMA_BIN migrate deploy --schema=./prisma/schema.prisma || fail "Prisma migrations failed."

if [ -f server.ts ] && [ -x node_modules/.bin/tsx ]; then
  # Keep runtime deterministic by using the project-pinned tsx binary only.
  exec node_modules/.bin/tsx server.ts
fi

fail "No supported server entry point found (expected server.ts + node_modules/.bin/tsx)."
