#!/bin/bash
# Elahe Messenger production installer (safe install/upgrade/reinstall)

set -euo pipefail

REPO_URL="https://github.com/ehsanking/ElaheMessenger.git"
DEFAULT_BRANCH="main"
TARGET_DIR="ElaheMessenger"
MIN_RAM_MB=1024

BLUE='\033[1;34m'
RED='\033[1;31m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
PURPLE='\033[1;35m'
CYAN='\033[1;36m'
NC='\033[0m'

INSTALL_MODE=""
USE_DOMAIN=false
DOMAIN_NAME=""
SSL_EMAIL=""
RESOLVED_APP_URL=""
ADMIN_CREATED_FILE=""
ADMIN_AUTO_GENERATED=false
ADMIN_FORCE_PASSWORD_CHANGE=false

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERR]${NC} $1"; }
log_step() { echo -e "\n${PURPLE}=== $1 ===${NC}"; }

command_exists() { command -v "$1" >/dev/null 2>&1; }

compose_service_exists() {
  local service="$1"
  docker compose config --services 2>/dev/null | grep -Fxq "$service"
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

  [ -z "$result" ] && result="$default_value"
  printf '%s' "$result"
}

read_tty_secret() {
  local prompt="$1"
  local result=""

  if [ -t 0 ]; then
    read -r -s -p "$(echo -e "$prompt")" result || true
    echo ""
  elif [ -r /dev/tty ]; then
    read -r -s -p "$(echo -e "$prompt")" result < /dev/tty || true
    echo "" > /dev/tty
  fi

  printf '%s' "$result"
}

trim_space() {
  local v="$1"
  v="${v#"${v%%[![:space:]]*}"}"
  v="${v%"${v##*[![:space:]]}"}"
  printf '%s' "$v"
}

random_hex() { openssl rand -hex "$1"; }
random_base64() { openssl rand -base64 "$1" | tr -d '\n' | tr '/+' 'AB'; }

is_valid_admin_username() {
  local value="$1"
  [[ "$value" =~ ^[A-Za-z][A-Za-z0-9_]{2,31}$ ]] && [[ ! "$value" =~ ^([aA][dD][mM][iI][nN])$ ]]
}

is_valid_admin_password() {
  local value="$1"
  [ ${#value} -ge 16 ] || return 1
  [[ "$value" =~ [A-Z] ]] || return 1
  [[ "$value" =~ [a-z] ]] || return 1
  [[ "$value" =~ [0-9] ]] || return 1
  [[ "$value" =~ [^A-Za-z0-9] ]] || return 1
}

chmod_600() {
  local target="$1"
  chmod 600 "$target" 2>/dev/null || true
}

ensure_root_owned_600() {
  local target="$1"
  if command_exists chown; then
    chown root:root "$target" 2>/dev/null || true
  fi
  chmod_600 "$target"
}

# shellcheck disable=SC1090
load_env_file() {
  local file="$1"
  [ -f "$file" ] || return 0

  while IFS= read -r line || [ -n "$line" ]; do
    if [[ "$line" =~ ^[[:space:]]*# ]] || [[ -z "$(trim_space "$line")" ]]; then
      continue
    fi
    if [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
      local key="${line%%=*}"
      local val="${line#*=}"
      EXISTING_ENV["$key"]="$val"
    fi
  done < "$file"
}

env_get() {
  local key="$1"
  printf '%s' "${EXISTING_ENV[$key]-}"
}

env_set_if_missing() {
  local key="$1"
  local value="$2"
  if [ -z "${EXISTING_ENV[$key]-}" ]; then
    ENV_UPDATES["$key"]="$value"
    EXISTING_ENV["$key"]="$value"
  fi
}

env_set_explicit() {
  local key="$1"
  local value="$2"
  ENV_UPDATES["$key"]="$value"
  EXISTING_ENV["$key"]="$value"
}

apply_env_updates() {
  local env_file="$1"
  touch "$env_file"

  local key value escaped
  for key in "${!ENV_UPDATES[@]}"; do
    value="${ENV_UPDATES[$key]}"
    escaped=$(printf '%s' "$value" | sed -e 's/[\\&]/\\\\&/g')

    if grep -Eq "^[[:space:]]*${key}=" "$env_file"; then
      sed -i "s|^[[:space:]]*${key}=.*|${key}=${escaped}|" "$env_file"
    else
      printf '%s=%s\n' "$key" "$value" >> "$env_file"
    fi
  done

  chmod_600 "$env_file"
}

safe_download_file() {
  local url="$1"
  local output="$2"
  curl -fsSL --retry 3 --retry-delay 2 --connect-timeout 20 -o "$output" "$url"
  if [ ! -s "$output" ]; then
    log_error "Downloaded file is empty: $url"
    return 1
  fi
}

choose_install_mode() {
  log_step "Install mode detection"

  local dir_exists=false env_exists=false compose_project=false db_volume=false

  [ -d "$TARGET_DIR" ] && dir_exists=true
  [ -f "$TARGET_DIR/.env" ] && env_exists=true

  if command_exists docker && docker ps -a --format '{{.Names}}' 2>/dev/null | grep -Eq '^elahe-(app|db|caddy)$'; then
    compose_project=true
  fi

  if command_exists docker && docker volume inspect "${TARGET_DIR,,}_pgdata" >/dev/null 2>&1; then
    db_volume=true
  elif command_exists docker && docker volume ls --format '{{.Name}}' 2>/dev/null | grep -Eq '(^|_)pgdata$'; then
    db_volume=true
  fi

  log_info "Detected state: dir=${dir_exists}, env=${env_exists}, compose=${compose_project}, db_volume=${db_volume}"

  if [ "$dir_exists" = false ] && [ "$env_exists" = false ] && [ "$compose_project" = false ] && [ "$db_volume" = false ]; then
    INSTALL_MODE="fresh"
    log_success "No prior installation detected -> fresh install mode."
    return
  fi

  echo -e "${CYAN}Existing install artifacts detected. Choose mode:${NC}"
  echo "  1) Upgrade (safe in-place, preserve existing secrets/data)"
  echo "  2) Reinstall (replace files, keep old backup, no implicit data deletion)"
  echo "  3) Abort"

  local choice
  choice=$(read_tty_input "${YELLOW}Enter choice [1-3]:${NC} " "1")
  case "$choice" in
    1) INSTALL_MODE="upgrade" ;;
    2) INSTALL_MODE="reinstall" ;;
    *) log_warn "Aborted by operator."; exit 0 ;;
  esac

  log_info "Selected mode: $INSTALL_MODE"
}

check_ports() {
  local conflicts=()
  local port
  for port in 80 443; do
    if ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "(^|:)$port$"; then
      conflicts+=("$port")
    fi
  done

  if [ ${#conflicts[@]} -gt 0 ]; then
    log_warn "Required ports in use: ${conflicts[*]}"
    local decision
    decision=$(read_tty_input "${YELLOW}Continue anyway? [y/N]:${NC} " "N")
    case "$decision" in
      y|Y|yes|YES) log_warn "Continuing with operator override." ;;
      *) log_error "Stopping because required ports are occupied."; exit 1 ;;
    esac
  fi
}

preflight_checks() {
  log_step "Preflight checks"

  local free_disk_mb
  free_disk_mb=$(df -Pm . | awk 'NR==2 {print $4}')
  if [ "${free_disk_mb:-0}" -lt 3072 ]; then
    log_warn "Available disk below 3GB (${free_disk_mb}MB)."
  else
    log_success "Disk check passed (${free_disk_mb}MB free)."
  fi

  if command_exists free; then
    local total_ram_mb
    total_ram_mb=$(free -m | awk '/^Mem:/{print $2}')
    if [ "${total_ram_mb:-0}" -lt "$MIN_RAM_MB" ]; then
      log_warn "RAM below recommended threshold (${total_ram_mb}MB)."
    else
      log_success "RAM check passed (${total_ram_mb}MB)."
    fi
  fi

  check_ports
}

install_docker_apt() {
  if ! command_exists apt-get; then
    log_error "Docker missing and apt-get unavailable. Install Docker manually then rerun."
    exit 1
  fi

  log_info "Installing Docker from distro packages (no curl|sh)."
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker.io docker-compose-plugin

  if ! command_exists docker; then
    log_error "Docker installation failed."
    exit 1
  fi
}

check_dependencies() {
  log_step "Dependency checks"
  local deps=(git curl openssl)
  local dep
  for dep in "${deps[@]}"; do
    if command_exists "$dep"; then
      log_success "$dep installed."
    else
      if ! command_exists apt-get; then
        log_error "Missing dependency '$dep' and apt-get unavailable."
        exit 1
      fi
      apt-get update -qq
      DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$dep"
    fi
  done

  if ! command_exists docker; then
    install_docker_apt
  fi

  if ! docker compose version >/dev/null 2>&1; then
    if command_exists apt-get; then
      apt-get update -qq
      DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker-compose-plugin
    fi
  fi

  docker compose version >/dev/null 2>&1 || { log_error "docker compose not available."; exit 1; }
}

collect_domain_ssl_input() {
  log_step "Domain/IP configuration"

  echo -e "${CYAN}Choose external access mode:${NC}"
  echo "  1) Domain (Caddy TLS on :443)"
  echo "  2) IP-only (Caddy HTTP on :80)"

  local choice
  choice=$(read_tty_input "${YELLOW}Enter choice [1-2]:${NC} " "2")

  if [ "$choice" = "1" ]; then
    DOMAIN_NAME=$(read_tty_input "${CYAN}Domain (example: chat.example.com):${NC} " "")
    DOMAIN_NAME="${DOMAIN_NAME#http://}"
    DOMAIN_NAME="${DOMAIN_NAME#https://}"
    DOMAIN_NAME="${DOMAIN_NAME%%/*}"
    DOMAIN_NAME="${DOMAIN_NAME,,}"
    if [[ -z "$DOMAIN_NAME" || ! "$DOMAIN_NAME" =~ ^([a-z0-9-]+\.)+[a-z]{2,}$ ]]; then
      log_error "Invalid domain format."
      exit 1
    fi
    SSL_EMAIL=$(read_tty_input "${CYAN}TLS notification email:${NC} " "admin@${DOMAIN_NAME}")
    USE_DOMAIN=true
  else
    USE_DOMAIN=false
  fi
}

prompt_admin_credentials_fresh() {
  local generated_suffix generated_user generated_password
  generated_suffix=$(random_hex 4)
  generated_user="owner_${generated_suffix}"
  generated_password=$(random_base64 36)

  while true; do
    local input_user
    input_user=$(trim_space "$(read_tty_input "${CYAN}Admin username (blank = auto-generate):${NC} " "")")

    if [ -z "$input_user" ]; then
      ADMIN_USERNAME_VALUE="$generated_user"
      break
    fi

    if is_valid_admin_username "$input_user"; then
      ADMIN_USERNAME_VALUE="$input_user"
      break
    fi

    log_warn "Invalid username. Use 3-32 chars, letters/numbers/_ only, and not 'admin'."
  done

  while true; do
    local password_choice
    password_choice=$(read_tty_input "${CYAN}Admin password mode: [1] provide [2] auto-generate:${NC} " "1")

    if [ "$password_choice" = "2" ]; then
      ADMIN_PASSWORD_VALUE="$generated_password"
      ADMIN_AUTO_GENERATED=true
      ADMIN_FORCE_PASSWORD_CHANGE=true
      break
    fi

    local input_password input_confirm
    input_password=$(read_tty_secret "${CYAN}Admin password (min 16, upper/lower/number/symbol):${NC} ")
    input_confirm=$(read_tty_secret "${CYAN}Confirm admin password:${NC} ")

    if [ "$input_password" != "$input_confirm" ]; then
      log_warn "Passwords do not match. Try again."
      continue
    fi

    if is_valid_admin_password "$input_password"; then
      ADMIN_PASSWORD_VALUE="$input_password"
      local force_change
      force_change=$(read_tty_input "${CYAN}Force password change at first login? [y/N]:${NC} " "N")
      case "$force_change" in
        y|Y|yes|YES) ADMIN_FORCE_PASSWORD_CHANGE=true ;;
        *) ADMIN_FORCE_PASSWORD_CHANGE=false ;;
      esac
      break
    fi

    log_warn "Password does not meet policy."
  done
}

write_admin_secret_file() {
  [ "$ADMIN_AUTO_GENERATED" = true ] || return 0

  local secret_dir="$TARGET_DIR/.installer-secrets"
  mkdir -p "$secret_dir"
  chmod 700 "$secret_dir" 2>/dev/null || true

  local secret_file="$secret_dir/bootstrap-admin.txt"
  {
    echo "# Elahe Messenger bootstrap admin credentials"
    echo "# Created: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    echo "ADMIN_USERNAME=$ADMIN_USERNAME_VALUE"
    echo "ADMIN_PASSWORD=$ADMIN_PASSWORD_VALUE"
  } > "$secret_file"

  ensure_root_owned_600 "$secret_file"
  ADMIN_CREATED_FILE="$secret_file"
}

configure_caddyfile() {
  if [ "$USE_DOMAIN" = true ]; then
    cat > "$TARGET_DIR/Caddyfile" <<EOC
{
    email ${SSL_EMAIL}
    grace_period 10s
}

${DOMAIN_NAME} {
    reverse_proxy app:3000 {
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up Host {host}
    }
    encode gzip zstd
}

www.${DOMAIN_NAME} {
    redir https://${DOMAIN_NAME}{uri} permanent
}
EOC
    RESOLVED_APP_URL="https://${DOMAIN_NAME}"
  else
    cat > "$TARGET_DIR/Caddyfile" <<'EOC'
{
    auto_https off
}

:80 {
    reverse_proxy app:3000 {
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up Host {host}
    }
    encode gzip zstd
}
EOC
    local server_ip
    server_ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    [ -z "$server_ip" ] && server_ip="127.0.0.1"
    RESOLVED_APP_URL="http://${server_ip}"
  fi
}

ensure_install_directory() {
  local backup_stamp
  backup_stamp=$(date -u +"%Y%m%d-%H%M%S")

  if [ "$INSTALL_MODE" = "fresh" ]; then
    mkdir -p "$TARGET_DIR"
    return
  fi

  if [ ! -d "$TARGET_DIR" ]; then
    log_error "Mode '$INSTALL_MODE' requires existing directory '$TARGET_DIR'."
    exit 1
  fi

  if [ "$INSTALL_MODE" = "reinstall" ]; then
    local backup_dir="${TARGET_DIR}.backup.${backup_stamp}"
    log_info "Creating reinstall backup at ${backup_dir}."
    cp -a "$TARGET_DIR" "$backup_dir"
  fi
}

backup_upgrade_artifacts() {
  [ "$INSTALL_MODE" = "upgrade" ] || return 0

  local backup_dir
  backup_dir="$TARGET_DIR/.installer-backups/$(date -u +"%Y%m%d-%H%M%S")"
  mkdir -p "$backup_dir"

  [ -f "$TARGET_DIR/.env" ] && cp "$TARGET_DIR/.env" "$backup_dir/.env"
  [ -f "$TARGET_DIR/Caddyfile" ] && cp "$TARGET_DIR/Caddyfile" "$backup_dir/Caddyfile"
  [ -f "$TARGET_DIR/docker-compose.yml" ] && cp "$TARGET_DIR/docker-compose.yml" "$backup_dir/docker-compose.yml"
  [ -f "$TARGET_DIR/compose.prod.yaml" ] && cp "$TARGET_DIR/compose.prod.yaml" "$backup_dir/compose.prod.yaml"
  [ -f "$TARGET_DIR/compose_prod_full.yml" ] && cp "$TARGET_DIR/compose_prod_full.yml" "$backup_dir/compose_prod_full.yml"

  log_success "Upgrade backup created: $backup_dir"
}

sync_source_tree() {
  log_step "Source synchronization"

  if [ "$INSTALL_MODE" = "fresh" ] || [ "$INSTALL_MODE" = "reinstall" ]; then
    if [ -d "$TARGET_DIR/.git" ]; then
      rm -rf "$TARGET_DIR"
    fi
    mkdir -p "$TARGET_DIR"
    git clone --branch "$DEFAULT_BRANCH" --depth 1 "$REPO_URL" "$TARGET_DIR"
    return
  fi

  # upgrade path
  if [ ! -d "$TARGET_DIR/.git" ]; then
    log_error "Upgrade requires a git checkout in $TARGET_DIR (.git missing)."
    exit 1
  fi

  (
    cd "$TARGET_DIR"

    if [ -n "$(git status --porcelain)" ]; then
      log_error "Upgrade aborted: worktree is dirty. Commit/stash local changes first."
      exit 1
    fi

    if ! git fetch origin "$DEFAULT_BRANCH" --tags; then
      log_error "git fetch failed. Upgrade aborted safely (no deletion performed)."
      exit 1
    fi

    if ! git reset --hard "origin/$DEFAULT_BRANCH"; then
      log_error "git reset failed. Upgrade aborted safely (no deletion performed)."
      exit 1
    fi
  )
}

configure_runtime_env() {
  log_step "Runtime environment"

  declare -gA EXISTING_ENV=()
  declare -gA ENV_UPDATES=()

  local env_file="$TARGET_DIR/.env"
  load_env_file "$env_file"

  if [ "$INSTALL_MODE" = "fresh" ] || [ "$INSTALL_MODE" = "reinstall" ]; then
    prompt_admin_credentials_fresh
  fi

  if [ "$USE_DOMAIN" = true ]; then
    env_set_if_missing "APP_URL" "https://${DOMAIN_NAME}"
    env_set_if_missing "ALLOWED_ORIGINS" "https://${DOMAIN_NAME},https://www.${DOMAIN_NAME}"
    if [ "$INSTALL_MODE" = "upgrade" ]; then
      local change_origins
      change_origins=$(read_tty_input "${CYAN}Update APP_URL/ALLOWED_ORIGINS to domain values? [y/N]:${NC} " "N")
      case "$change_origins" in
        y|Y|yes|YES)
          env_set_explicit "APP_URL" "https://${DOMAIN_NAME}"
          env_set_explicit "ALLOWED_ORIGINS" "https://${DOMAIN_NAME},https://www.${DOMAIN_NAME}"
          ;;
      esac
    fi
  else
    local server_ip
    server_ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    [ -z "$server_ip" ] && server_ip="127.0.0.1"
    local ip_origin="http://${server_ip}"

    env_set_if_missing "APP_URL" "$ip_origin"
    env_set_if_missing "ALLOWED_ORIGINS" "$ip_origin,http://localhost:3000,http://127.0.0.1:3000"

    if [ "$INSTALL_MODE" = "upgrade" ]; then
      local change_ip_origins
      change_ip_origins=$(read_tty_input "${CYAN}Update APP_URL/ALLOWED_ORIGINS for IP-only mode (${ip_origin})? [y/N]:${NC} " "N")
      case "$change_ip_origins" in
        y|Y|yes|YES)
          env_set_explicit "APP_URL" "$ip_origin"
          env_set_explicit "ALLOWED_ORIGINS" "$ip_origin,http://localhost:3000,http://127.0.0.1:3000"
          ;;
      esac
    fi
  fi

  # Core values: only generate when missing
  env_set_if_missing "POSTGRES_USER" "elahe_$(random_hex 4)"
  env_set_if_missing "POSTGRES_PASSWORD" "$(random_hex 24)"
  env_set_if_missing "POSTGRES_DB" "elahe"

  local pg_user pg_pass pg_db
  pg_user="$(env_get POSTGRES_USER)"
  pg_pass="$(env_get POSTGRES_PASSWORD)"
  pg_db="$(env_get POSTGRES_DB)"
  env_set_if_missing "DATABASE_URL" "postgresql://${pg_user}:${pg_pass}@db:5432/${pg_db}"

  env_set_if_missing "PRISMA_CONNECTION_LIMIT" "10"
  env_set_if_missing "LOG_LEVEL" "info"
  env_set_if_missing "NODE_ENV" "production"
  env_set_if_missing "PORT" "3000"

  env_set_if_missing "JWT_SECRET" "$(random_hex 32)"
  env_set_if_missing "SESSION_SECRET" "$(random_hex 32)"
  env_set_if_missing "ENCRYPTION_KEY" "$(random_hex 32)"
  env_set_if_missing "DOWNLOAD_TOKEN_SECRET" "$(random_hex 32)"

  env_set_if_missing "RATE_LIMIT_WINDOW_MS" "900000"
  env_set_if_missing "RATE_LIMIT_MAX_REQUESTS" "100"
  env_set_if_missing "SOCKET_RATE_LIMIT_WINDOW_MS" "10000"
  env_set_if_missing "SOCKET_RATE_LIMIT_MAX" "30"
  env_set_if_missing "QUEUE_CONCURRENCY" "5"
  env_set_if_missing "OBJECT_STORAGE_DRIVER" "local"
  env_set_if_missing "OBJECT_STORAGE_ROOT" "/app/object_storage"

  if [ "$INSTALL_MODE" = "fresh" ] || [ "$INSTALL_MODE" = "reinstall" ]; then
    env_set_if_missing "ADMIN_USERNAME" "$ADMIN_USERNAME_VALUE"
    env_set_if_missing "ADMIN_PASSWORD" "$ADMIN_PASSWORD_VALUE"
    if [ "$ADMIN_FORCE_PASSWORD_CHANGE" = true ]; then
      env_set_if_missing "ADMIN_BOOTSTRAP_FORCE_PASSWORD_CHANGE" "true"
    else
      env_set_if_missing "ADMIN_BOOTSTRAP_FORCE_PASSWORD_CHANGE" "false"
    fi
  else
    env_set_if_missing "ADMIN_BOOTSTRAP_FORCE_PASSWORD_CHANGE" "false"
  fi

  apply_env_updates "$env_file"
  RESOLVED_APP_URL="$(env_get APP_URL)"

  write_admin_secret_file
  log_success "Environment updated safely (minimal key updates)."
}

configure_npmrc() {
  local npmrc="$TARGET_DIR/.npmrc"
  cat > "$npmrc" <<'EON'
registry=https://registry.npmjs.org
legacy-peer-deps=true
fetch-retry-maxtimeout=600000
fetch-retry-mintimeout=100000
fetch-retries=10
maxsockets=10
EON
}

validate_caddy_config() {
  log_step "Validating Caddy config"
  (
    cd "$TARGET_DIR"
    if ! docker run --rm -v "$PWD/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile >/dev/null; then
      log_error "Caddyfile validation failed."
      exit 1
    fi
  )
  log_success "Caddyfile is valid."
}

launch_services() {
  log_step "Launching services"
  (
    cd "$TARGET_DIR"

    docker compose config >/dev/null

    if [ "$INSTALL_MODE" = "upgrade" ]; then
      docker compose pull db caddy || true
      docker compose up -d db
      docker compose build app
      docker compose up -d app caddy
    else
      docker compose up -d db
      docker compose build app
      docker compose up -d app caddy
    fi
  )

  log_success "Compose services started."
}

print_summary() {
  log_step "Complete"
  echo "Mode: $INSTALL_MODE"
  echo "App URL: ${RESOLVED_APP_URL}"
  echo "Project dir: $TARGET_DIR"
  if [ -n "$ADMIN_CREATED_FILE" ]; then
    echo "Bootstrap admin credentials saved to: $ADMIN_CREATED_FILE"
  fi
  echo "No admin password was printed to terminal output."
  echo "Caddy handles TLS renewals internally; no extra cron entry was installed."
}

main() {
  if [ "$(uname -s)" != "Linux" ]; then
    log_error "Linux is required."
    exit 1
  fi

  choose_install_mode
  preflight_checks
  check_dependencies
  ensure_install_directory
  backup_upgrade_artifacts
  sync_source_tree
  collect_domain_ssl_input
  configure_caddyfile
  configure_runtime_env
  configure_npmrc
  validate_caddy_config
  launch_services
  print_summary
}

main "$@"
