#!/bin/bash
# Elahe Messenger Installer v1.0 (hotfix)
# Aligns deployment with the current docker-compose.yml and production env validation.
set -euo pipefail

REPO_URL="https://github.com/ehsanking/ElaheMessenger.git"
TARGET_DIR="ElaheMessenger"

BLUE='\033[1;34m'
RED='\033[1;31m'
GREEN='\033[1;32m'
CYAN='\033[1;36m'
WHITE='\033[1;37m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${NC}    $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC}   $1"; }

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

get_sudo() {
  if command_exists sudo; then echo "sudo"; else echo ""; fi
}

run_apt() {
  if ! command_exists apt-get; then
    log_error "apt-get not found. Install dependencies manually."
    exit 1
  fi
  local S
  S=$(get_sudo)
  if [ -n "$S" ]; then
    $S apt-get "$@"
  else
    apt-get "$@"
  fi
}

ensure_dep() {
  local cmd="$1"
  local pkg="${2:-$1}"
  if command_exists "$cmd"; then
    log_success "Dependency '$cmd' already installed."
    return 0
  fi
  log_info "Installing '${pkg}'..."
  run_apt update -qq
  run_apt install -y "$pkg" -qq
  log_success "Installed '${pkg}'."
}

install_docker_if_needed() {
  if command_exists docker && docker compose version >/dev/null 2>&1; then
    log_success "Docker and Docker Compose are already available."
    return 0
  fi

  log_info "Installing Docker via official script..."
  local S
  S=$(get_sudo)
  if [ -n "$S" ]; then
    curl -fsSL https://get.docker.com | $S sh
  else
    curl -fsSL https://get.docker.com | sh
  fi

  if ! command_exists docker; then
    log_error "Docker installation failed."
    exit 1
  fi

  if ! docker compose version >/dev/null 2>&1; then
    log_info "Installing docker-compose-plugin..."
    run_apt update -qq
    run_apt install -y docker-compose-plugin -qq
  fi

  log_success "Docker tooling is ready."
}

read_tty_input() {
  local prompt="$1"
  local default_value="${2:-}"
  local result=""
  if [ -t 0 ]; then
    read -r -p "$(echo -e "$prompt")" result || true
  elif [ -r /dev/tty ]; then
    read -r -p "$(echo -e "$prompt")" result < /dev/tty || true
  else
    result="$default_value"
  fi
  if [ -z "$result" ]; then
    result="$default_value"
  fi
  printf '%s' "$result"
}

collect_domain() {
  echo -e "${CYAN}Would you like automatic HTTPS with a custom domain?${NC}"
  echo -e "  ${WHITE}1)${NC} Yes"
  echo -e "  ${WHITE}2)${NC} No (IP-only mode)"
  local choice
  choice=$(read_tty_input "${WHITE}Enter choice [1-2]:${NC} " "2")

  USE_DOMAIN=false
  DOMAIN_NAME=""
  SSL_EMAIL=""

  if [ "$choice" = "1" ]; then
    DOMAIN_NAME=$(read_tty_input "${CYAN}Enter your domain:${NC} " "")
    DOMAIN_NAME="${DOMAIN_NAME#http://}"
    DOMAIN_NAME="${DOMAIN_NAME#https://}"
    DOMAIN_NAME="${DOMAIN_NAME%%/*}"
    DOMAIN_NAME="${DOMAIN_NAME,,}"

    if [[ "$DOMAIN_NAME" =~ ^([a-z0-9-]+\.)+[a-z]{2,}$ ]]; then
      SSL_EMAIL=$(read_tty_input "${CYAN}Enter your SSL email:${NC} " "admin@${DOMAIN_NAME}")
      if ! [[ "$SSL_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; then
        SSL_EMAIL="admin@${DOMAIN_NAME}"
      fi
      USE_DOMAIN=true
      log_success "Using domain ${DOMAIN_NAME}."
    else
      log_info "Invalid domain. Falling back to IP-only mode."
    fi
  fi
}

sync_source() {
  if [ -d "$TARGET_DIR" ]; then
    log_info "Refreshing existing '${TARGET_DIR}' directory..."
    rm -rf "$TARGET_DIR"
  fi

  mkdir -p "$TARGET_DIR"
  cd "$TARGET_DIR"

  log_info "Downloading source archive..."
  if ! curl -L --retry 5 --retry-delay 5 --connect-timeout 30 \
    "https://github.com/ehsanking/ElaheMessenger/archive/refs/heads/main.tar.gz" \
    | tar -xz --strip-components=1; then
    log_error "Archive download failed."
    exit 1
  fi

  cd ..
  log_success "Source synchronized."
}

write_caddyfile() {
  if [ "$USE_DOMAIN" = true ] && [ -n "$DOMAIN_NAME" ]; then
    cat > "${TARGET_DIR}/Caddyfile" <<EOF
{
    email ${SSL_EMAIL}
    grace_period 10s
}

${DOMAIN_NAME} {
    tls ${SSL_EMAIL}

    reverse_proxy app:3000 {
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up Connection {>Connection}
        header_up Upgrade {>Upgrade}
        header_up Host {host}
        flush_interval -1
    }

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
        -Server
    }

    encode gzip zstd
}

www.${DOMAIN_NAME} {
    redir https://${DOMAIN_NAME}{uri} permanent
}
EOF
    log_success "Caddyfile generated for ${DOMAIN_NAME}."
  else
    cat > "${TARGET_DIR}/Caddyfile" <<'EOF'
{
    auto_https off
}

:80 {
    reverse_proxy app:3000 {
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up Connection {>Connection}
        header_up Upgrade {>Upgrade}
        header_up Host {host}
        flush_interval -1
    }

    encode gzip zstd
}
EOF
    log_success "Caddyfile generated for IP-only mode."
  fi
}

write_env() {
  local server_ip app_url allowed_origins
  local jwt_secret session_secret encryption_key pg_password admin_password

  server_ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  [ -z "${server_ip:-}" ] && server_ip="127.0.0.1"

  if [ "$USE_DOMAIN" = true ] && [ -n "$DOMAIN_NAME" ]; then
    app_url="https://${DOMAIN_NAME}"
    allowed_origins="https://${DOMAIN_NAME},https://www.${DOMAIN_NAME}"
  else
    app_url="http://${server_ip}:3000"
    allowed_origins="http://${server_ip}:3000,http://localhost:3000,http://127.0.0.1:3000"
  fi

  jwt_secret=$(openssl rand -hex 32)
  session_secret=$(openssl rand -hex 32)
  encryption_key=$(openssl rand -hex 16)
  pg_password=$(openssl rand -hex 24)
  admin_password=$(openssl rand -base64 24 | tr -d '\n' | tr '/+' 'AB' | cut -c1-24)

  cat > "${TARGET_DIR}/.env" <<EOF
POSTGRES_USER=user
POSTGRES_PASSWORD=${pg_password}
POSTGRES_DB=elahe
DATABASE_URL=postgresql://user:${pg_password}@db:5432/elahe
PRISMA_CONNECTION_LIMIT=10
APP_URL=${app_url}
ALLOWED_ORIGINS=${allowed_origins}
LOG_LEVEL=info
NODE_ENV=production
PORT=3000
JWT_SECRET=${jwt_secret}
SESSION_SECRET=${session_secret}
ENCRYPTION_KEY=${encryption_key}
ADMIN_USERNAME=admin
ADMIN_PASSWORD=${admin_password}
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
SOCKET_RATE_LIMIT_WINDOW_MS=10000
SOCKET_RATE_LIMIT_MAX=30
QUEUE_CONCURRENCY=5
EOF

  chmod 600 "${TARGET_DIR}/.env" 2>/dev/null || true
  ADMIN_PASSWORD_GENERATED="${admin_password}"
  RESOLVED_APP_URL="${app_url}"

  log_success "Secure runtime .env generated."
}

wait_for_health() {
  local container_name="$1"
  local attempts="${2:-45}"
  local sleep_seconds="${3:-5}"

  for _ in $(seq 1 "$attempts"); do
    local status
    status=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_name" 2>/dev/null || echo "missing")
    if [ "$status" = "healthy" ] || [ "$status" = "running" ]; then
      return 0
    fi
    sleep "$sleep_seconds"
  done

  return 1
}

launch() {
  cd "$TARGET_DIR"

  export DOCKER_BUILDKIT=1
  export COMPOSE_DOCKER_CLI_BUILD=1
  export BUILDKIT_PROGRESS=plain

  log_info "Validating docker compose..."
  docker compose config >/dev/null

  log_info "Pre-pulling infrastructure images..."
  docker compose pull db caddy >/dev/null 2>&1 || true

  log_info "Starting database..."
  docker compose up -d db

  if ! wait_for_health "elahe-db" 30 2; then
    log_error "Database did not become healthy."
    docker compose logs db --tail=80 || true
    exit 1
  fi

  log_info "Building app image..."
  if ! docker compose build app; then
    log_info "Retrying app build with --no-cache..."
    docker compose build --no-cache app
  fi

  log_info "Starting app..."
  docker compose up -d app
  if ! wait_for_health "elahe-app" 45 5; then
    log_error "App did not become healthy."
    docker compose logs app --tail=120 || true
    exit 1
  fi

  log_info "Starting caddy..."
  docker compose up -d caddy
  if ! wait_for_health "elahe-caddy" 20 3; then
    log_error "Caddy did not become ready."
    docker compose logs caddy --tail=120 || true
    exit 1
  fi

  cd ..
}

print_summary() {
  echo
  echo -e "${GREEN}Elahe Messenger installation completed.${NC}"
  echo -e "${CYAN}App URL:${NC} ${RESOLVED_APP_URL}"
  echo -e "${CYAN}Storage:${NC} Local filesystem (default)"
  echo -e "${CYAN}Admin User:${NC} admin"
  echo -e "${CYAN}Admin Password:${NC} ${ADMIN_PASSWORD_GENERATED}"
  echo
  echo "Useful commands:"
  echo "  cd ${TARGET_DIR} && docker compose ps"
  echo "  cd ${TARGET_DIR} && docker compose logs -f app"
  echo "  cd ${TARGET_DIR} && docker compose logs -f caddy"
}

main() {
  ensure_dep curl
  ensure_dep git
  ensure_dep openssl
  install_docker_if_needed
  collect_domain
  sync_source
  write_caddyfile
  write_env
  launch
  print_summary
}

main "$@"
