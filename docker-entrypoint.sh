#!/bin/sh
# Elahe Messenger Docker entrypoint
# Runs database migrations, validates security-sensitive env vars, then starts the server

set -eu

prepare_runtime_dirs() {
  storage_root="${OBJECT_STORAGE_ROOT:-/app/object_storage}"
  admin_state_dir="${ADMIN_BOOTSTRAP_STATE_DIR:-/app/runtime_state}"
  recursive_fix="${OBJECT_STORAGE_ENSURE_OWNERSHIP_RECURSIVE:-false}"
  ownership_marker=""
  case "$storage_root" in
    /*) ;;
    *) storage_root="/app/${storage_root}" ;;
  esac

  case "$admin_state_dir" in
    /*) ;;
    *) admin_state_dir="/app/${admin_state_dir}" ;;
  esac

  mkdir -p "$storage_root" || {
    echo "[entrypoint] ERROR: Could not create object storage root at ${storage_root}." >&2
    exit 1
  }
  mkdir -p "$admin_state_dir" || {
    echo "[entrypoint] ERROR: Could not create admin bootstrap state directory at ${admin_state_dir}." >&2
    exit 1
  }

  chown nextjs:nodejs "$storage_root" "$admin_state_dir" || {
    echo "[entrypoint] ERROR: Could not assign ownership for runtime directories." >&2
    exit 1
  }

  ownership_marker="${storage_root}/.ownership-initialized"
  if [ "$recursive_fix" = "true" ] || [ ! -f "$ownership_marker" ]; then
    find "$storage_root" \( \! -user nextjs -o \! -group nodejs \) -print0 | xargs -0 -r chown nextjs:nodejs || {
      echo "[entrypoint] ERROR: Could not enforce object storage ownership." >&2
      exit 1
    }
    touch "$ownership_marker" || true
    chown nextjs:nodejs "$ownership_marker" || true
  fi

  chmod 750 "$storage_root" || true
  chmod 700 "$admin_state_dir" || true
}

on_err() {
  line="$1"
  cmd="${2:-unknown}"
  echo "[entrypoint] ERROR: bootstrap failed near line ${line} (command: ${cmd}). Check logs above for root cause." >&2
}

if [ "${1:-}" = "--as-nextjs" ]; then
  shift
elif [ "$(id -u)" -eq 0 ]; then
  prepare_runtime_dirs
  exec su-exec nextjs:nodejs /docker-entrypoint.sh --as-nextjs "$@"
fi

# NOTE:
# Alpine's /bin/sh (BusyBox ash) does not support `trap ... ERR`.
# Unconditionally setting that trap aborts startup with:
#   trap: ERR: bad trap
# Keep startup POSIX-compatible by enabling the trap only when supported.
# shellcheck disable=SC3047 -- runtime guard ensures ERR trap is used only when shell supports it.
if (trap '' ERR) 2>/dev/null; then
  trap 'on_err $LINENO "${BASH_COMMAND:-unknown}"' ERR
fi

log() {
  echo "[entrypoint] $1"
}

warn() {
  echo "[entrypoint] WARNING: $1" >&2
}

resolve_admin_bootstrap_password() {
  if [ -n "${ADMIN_PASSWORD:-}" ]; then
    printf "%s" "$ADMIN_PASSWORD"
    return 0
  fi
  if [ -n "${ADMIN_BOOTSTRAP_PASSWORD_FILE:-}" ] && [ -r "${ADMIN_BOOTSTRAP_PASSWORD_FILE:-}" ]; then
    tr -d '\r\n' < "${ADMIN_BOOTSTRAP_PASSWORD_FILE}"
    return 0
  fi
  printf ""
}

resolve_database_password() {
  if [ -n "${APP_DB_PASSWORD:-}" ]; then
    printf "%s" "$APP_DB_PASSWORD"
    return 0
  fi

  _db_url="${DATABASE_URL:-${MIGRATION_DATABASE_URL:-}}"
  [ -z "$_db_url" ] && {
    printf ""
    return 0
  }

  # Parse password from URL userinfo: scheme://user:password@host[:port]/db
  # We intentionally keep this POSIX + BusyBox compatible.
  _userinfo=$(printf "%s" "$_db_url" | sed -n 's|^[a-zA-Z0-9+.-]*://\([^@/]*\)@.*|\1|p')
  _password=$(printf "%s" "$_userinfo" | sed -n 's|^[^:]*:\(.*\)$|\1|p')

  printf "%s" "$_password"
}

fail() {
  echo "[entrypoint] ERROR: $1" >&2
  exit 1
}

# ── Prisma binary resolution ──────────────────
# The standalone Next.js output does NOT include node_modules/.bin symlinks.
# We locate the prisma CLI explicitly to avoid "prisma: not found".
PRISMA_BIN=""
if [ -x ./node_modules/.bin/prisma ]; then
  PRISMA_BIN="./node_modules/.bin/prisma"
elif [ -f ./node_modules/prisma/build/index.js ]; then
  PRISMA_BIN="node ./node_modules/prisma/build/index.js"
fi

run_prisma() {
  if [ -z "$PRISMA_BIN" ]; then
    warn "Prisma CLI not found in image. Trying npx fallback..."
    npx prisma "$@"
  else
    $PRISMA_BIN "$@"
  fi
}

run_prisma_migrations() {
  _target_db_url="${MIGRATION_DATABASE_URL:-${DATABASE_URL:-}}"
  [ -z "$_target_db_url" ] && fail "DATABASE_URL (or MIGRATION_DATABASE_URL) is required."

  if [ "${MIGRATION_DATABASE_URL:-}" ]; then
    log "Running Prisma migrations with MIGRATION_DATABASE_URL (provisioning role)."
  else
    warn "MIGRATION_DATABASE_URL is not set; falling back to DATABASE_URL for migrations."
  fi

  DATABASE_URL="$_target_db_url" run_prisma migrate deploy --schema=./prisma/schema.prisma
}

# ── Strict production secret validation (POSIX-compatible) ──
require_strong_value() {
  _var_name="$1"
  _min_length="$2"
  _deny_list="$3"

  eval "_value=\${${_var_name}:-}"

  if [ -z "$_value" ]; then
    fail "$_var_name is required in production."
  fi

  _value_length=$(printf "%s" "$_value" | wc -c | tr -d ' ')
  if [ "$_value_length" -lt "$_min_length" ]; then
    fail "$_var_name must be at least ${_min_length} characters in production."
  fi

  _normalized=$(printf "%s" "$_value" | tr '[:upper:]' '[:lower:]')
  for _weak in $_deny_list; do
    if [ "$_normalized" = "$_weak" ]; then
      fail "$_var_name uses a weak or placeholder value in production."
    fi
  done
}

log "Validating runtime configuration..."
APP_ENV_EFFECTIVE="${APP_ENV:-${NODE_ENV:-development}}"
if [ "$APP_ENV_EFFECTIVE" = "production" ]; then
  require_strong_value JWT_SECRET 32 "changeme changeme_jwt_secret_min32chars_xxx your-super-secret-jwt-key-change-this-in-production"
  require_strong_value ENCRYPTION_KEY 32 "changeme changeme_encryption_key_32chars! your-32-character-encryption-key"
  _bootstrap_password="$(resolve_admin_bootstrap_password)"
  if [ -n "$_bootstrap_password" ]; then
    ADMIN_PASSWORD="$_bootstrap_password" require_strong_value ADMIN_PASSWORD 16 "admin changeme password change_this_admin_password"
  fi
  _resolved_db_password="$(resolve_database_password)"
  [ -z "$_resolved_db_password" ] && fail "APP_DB_PASSWORD is required in production (or include password in DATABASE_URL/MIGRATION_DATABASE_URL)."
  APP_DB_PASSWORD="$_resolved_db_password" require_strong_value APP_DB_PASSWORD 16 "postgres pass password"
  if [ "${CAPTCHA_PROVIDER:-recaptcha}" = "local" ] && [ -z "${LOCAL_CAPTCHA_SECRET:-}" ]; then
    fail "LOCAL_CAPTCHA_SECRET is required when CAPTCHA_PROVIDER=local in production."
  fi
fi

# ── Wait for database to be ready ─────────────
# Parse DATABASE_URL to extract host and port for a pure TCP connectivity check.
# We use ONLY the Node.js net.createConnection probe — NOT wget/curl to the
# PostgreSQL port. Sending HTTP to a PostgreSQL socket produces
# "invalid length of startup packet" errors in the database logs.
DB_HOST=""
DB_PORT="5432"

if [ -n "${DATABASE_URL:-}" ]; then
  # Extract host from postgresql://user:pass@HOST:PORT/db
  DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:/]*\).*|\1|p')
  _port=$(echo "$DATABASE_URL" | sed -n 's|.*@[^:]*:\([0-9]*\).*|\1|p')
  [ -n "$_port" ] && DB_PORT="$_port"
fi

if [ -n "$DB_HOST" ]; then
  log "Waiting for database at ${DB_HOST}:${DB_PORT}..."
  _db_attempts=0
  _db_max_attempts=60
  while [ "$_db_attempts" -lt "$_db_max_attempts" ]; do
    # Pure TCP check using Node.js — no HTTP overhead, no garbage packets to PostgreSQL
    if node -e "
      const s = require('net').createConnection({host:'${DB_HOST}',port:${DB_PORT}});
      s.on('connect', () => { s.end(); process.exit(0); });
      s.on('error',   () => process.exit(1));
      setTimeout(() => process.exit(1), 2000);
    " 2>/dev/null; then
      log "Database connection established at ${DB_HOST}:${DB_PORT}."
      break
    fi
    _db_attempts=$((_db_attempts + 1))
    if [ $((_db_attempts % 10)) -eq 0 ]; then
      log "Database not ready yet (attempt ${_db_attempts}/${_db_max_attempts}). Retrying in 2s..."
    fi
    sleep 2
  done

  if [ "$_db_attempts" -ge "$_db_max_attempts" ]; then
    warn "Could not connect to database after ${_db_max_attempts} attempts. Proceeding anyway..."
  fi
else
  warn "Could not parse DATABASE_URL — skipping database wait."
fi

# ── Run Prisma migrations (fail-fast) ─────────
if [ -z "$PRISMA_BIN" ]; then
  warn "Prisma CLI not available. Cannot run required migrations."
  exit 1
fi

log "Running Prisma database migrations (migrate deploy)..."
if ! run_prisma_migrations 2>&1; then
  warn "prisma migrate deploy failed. Refusing schema sync fallback in production."
  warn "Verify DATABASE_URL connectivity, migration history consistency, and Prisma schema compatibility."
  exit 1
fi
log "Prisma migrations applied successfully."

# ── Locate and start the server ───────────────
# IMPORTANT: We prefer the custom server.ts (via tsx) over the standalone
# server.js because the custom server includes Socket.IO real-time
# messaging. The standalone server.js generated by Next.js does NOT
# include Socket.IO, causing /socket.io 404 errors.

# Option 1: Custom server via tsx (preferred — includes Socket.IO)
if [ -f server.ts ]; then
  if [ -x node_modules/.bin/tsx ]; then
    log "Starting Elahe Messenger server (custom server.ts via tsx — Socket.IO enabled)..."
    exec node_modules/.bin/tsx server.ts
  fi

  # Fallback: try npx tsx
  if command -v npx >/dev/null 2>&1; then
    log "Starting Elahe Messenger server (custom server.ts via npx tsx — Socket.IO enabled)..."
    exec npx tsx server.ts
  fi
fi

# Option 2: Standalone server (fallback — NO Socket.IO)
if [ -f server.js ]; then
  warn "Falling back to standalone server.js — Socket.IO will NOT be available!"
  warn "Messages will fail to send. Please ensure tsx is available in the Docker image."
  exec node server.js
fi

if [ -f .next/standalone/server.js ]; then
  warn "Falling back to nested standalone server.js — Socket.IO will NOT be available!"
  exec node .next/standalone/server.js
fi

# Last resort
warn "No server entry point found. The container cannot start."
exit 1
