#!/bin/bash
# Elahe Messenger production installer (safe install/upgrade/reinstall)

set -euo pipefail

REPO_URL="https://github.com/ehsanking/ElaheMessenger.git"
DEFAULT_BRANCH="main"
INSTALL_REF_INPUT="${INSTALL_REF:-}"
INSTALL_REF_RESOLVED=""
INSTALL_REF_TYPE=""
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
PROXY_CONFIG_ACTION="generate"
ADMIN_CREATED_FILE=""
ADMIN_AUTO_GENERATED=false
ADMIN_FORCE_PASSWORD_CHANGE=false
UPGRADE_BACKUP_DIR=""
CADDY_RUNTIME_VALIDATED=false
LOCAL_PROXY_HEALTH_VALIDATED=false

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERR]${NC} $1"; }
log_step() { echo -e "\n${PURPLE}=== $1 ===${NC}"; }

command_exists() { command -v "$1" >/dev/null 2>&1; }

on_error() {
  local exit_code=$?
  if [ "$exit_code" -ne 0 ]; then
    log_error "Installer failed (exit code: $exit_code)."
    if [ -n "$UPGRADE_BACKUP_DIR" ]; then
      log_warn "Backup available at: $UPGRADE_BACKUP_DIR"
      log_warn "Rollback: stop compose, restore files from backup, then relaunch."
    fi
  fi
}

require_root() {
  if [ "${EUID:-$(id -u)}" -ne 0 ]; then
    log_error "Installer must run as root. Re-run with: sudo bash install.sh"
    exit 1
  fi
}

compose_service_exists() {
  local service="$1"
  docker compose config --services 2>/dev/null | grep -Fxq "$service"
}

get_primary_ipv4() {
  local server_ip
  server_ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  [ -z "$server_ip" ] && server_ip="127.0.0.1"
  printf '%s' "$server_ip"
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

detect_latest_tag_ref() {
  git ls-remote --tags --refs "$REPO_URL" 2>/dev/null \
    | awk '{print $2}' \
    | sed 's#refs/tags/##' \
    | sort -V \
    | tail -n1
}

resolve_install_ref() {
  local candidate="$1"
  [ -n "$candidate" ] || return 1

  if [[ "$candidate" =~ ^[0-9a-f]{40}$ ]]; then
    INSTALL_REF_RESOLVED="$candidate"
    INSTALL_REF_TYPE="commit"
    return 0
  fi

  if git ls-remote --exit-code --tags "$REPO_URL" "refs/tags/${candidate}" >/dev/null 2>&1; then
    INSTALL_REF_RESOLVED="$candidate"
    INSTALL_REF_TYPE="tag"
    return 0
  fi

  if git ls-remote --exit-code "$REPO_URL" "refs/heads/${candidate}" >/dev/null 2>&1; then
    INSTALL_REF_RESOLVED="$candidate"
    INSTALL_REF_TYPE="branch"
    return 0
  fi

  return 1
}

choose_source_ref() {
  log_step "Source trust / git ref selection"

  if [ -n "$INSTALL_REF_INPUT" ]; then
    if resolve_install_ref "$INSTALL_REF_INPUT"; then
      log_info "Using INSTALL_REF from environment: ${INSTALL_REF_RESOLVED} (${INSTALL_REF_TYPE})"
      return 0
    fi
    log_error "INSTALL_REF '${INSTALL_REF_INPUT}' was not found (tag/branch/commit)."
    exit 1
  fi

  local latest_tag
  latest_tag="$(detect_latest_tag_ref || true)"
  if [ -n "$latest_tag" ]; then
    echo -e "${CYAN}Select source ref:${NC}"
    echo "  1) Use latest tag (${latest_tag}) [recommended]"
    echo "  2) Enter a specific tag/commit/branch"
    echo "  3) Use mutable branch head (${DEFAULT_BRANCH})"
    local choice custom_ref
    choice=$(read_tty_input "${YELLOW}Enter choice [1-3]:${NC} " "1")
    case "$choice" in
      2)
        custom_ref=$(trim_space "$(read_tty_input "${CYAN}Enter tag/commit/branch:${NC} " "")")
        if ! resolve_install_ref "$custom_ref"; then
          log_error "Ref '${custom_ref}' not found."
          exit 1
        fi
        ;;
      3)
        INSTALL_REF_RESOLVED="$DEFAULT_BRANCH"
        INSTALL_REF_TYPE="branch"
        log_warn "Using mutable branch head (${DEFAULT_BRANCH}). Prefer a pinned tag/commit for production trust."
        ;;
      *)
        INSTALL_REF_RESOLVED="$latest_tag"
        INSTALL_REF_TYPE="tag"
        ;;
    esac
  else
    log_warn "Could not detect remote tags. Falling back to branch head '${DEFAULT_BRANCH}'."
    INSTALL_REF_RESOLVED="$DEFAULT_BRANCH"
    INSTALL_REF_TYPE="branch"
  fi

  log_info "Resolved install ref: ${INSTALL_REF_RESOLVED} (${INSTALL_REF_TYPE})"
}

choose_install_mode() {
  log_step "Install mode detection"

  local dir_exists=false env_exists=false compose_project=false known_containers=false known_project_files=false

  [ -d "$TARGET_DIR" ] && dir_exists=true
  [ -f "$TARGET_DIR/.env" ] && env_exists=true
  [ -f "$TARGET_DIR/docker-compose.yml" ] && known_project_files=true

  local compose_project_name
  compose_project_name="$(basename "$TARGET_DIR" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' '_')"

  if command_exists docker && [ -n "$(docker ps -a --filter "label=com.docker.compose.project=${compose_project_name}" --format '{{.Names}}' 2>/dev/null)" ]; then
    compose_project=true
  fi

  if command_exists docker && docker ps -a --format '{{.Names}}' 2>/dev/null | grep -Eq '^elahe-(app|db|caddy)$'; then
    known_containers=true
  fi

  log_info "Detected state: dir=${dir_exists}, env=${env_exists}, compose_project=${compose_project}, known_containers=${known_containers}, project_files=${known_project_files}"

  if [ "$dir_exists" = false ] && [ "$env_exists" = false ] && [ "$compose_project" = false ] && [ "$known_containers" = false ] && [ "$known_project_files" = false ]; then
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

ensure_docker_ready() {
  log_step "Docker daemon readiness"

  if docker info >/dev/null 2>&1; then
    log_success "Docker daemon is reachable."
    return
  fi

  if command_exists systemctl; then
    log_warn "Docker daemon not ready. Trying to enable/start docker service."
    systemctl enable docker >/dev/null 2>&1 || true
    systemctl start docker >/dev/null 2>&1 || true
  fi

  local attempts=20
  while [ "$attempts" -gt 0 ]; do
    if docker info >/dev/null 2>&1; then
      log_success "Docker daemon is reachable."
      return
    fi
    sleep 2
    attempts=$((attempts - 1))
  done

  log_error "Docker daemon is not ready. Ensure docker service is running, then re-run installer."
  exit 1
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

choose_proxy_config_action_upgrade() {
  log_step "Proxy configuration on upgrade"
  echo -e "${CYAN}Upgrade proxy handling:${NC}"
  echo "  1) Preserve existing proxy config (recommended)"
  echo "  2) Regenerate proxy config (change ingress/domain/IP mode)"
  local choice
  choice=$(read_tty_input "${YELLOW}Enter choice [1-2]:${NC} " "1")
  case "$choice" in
    2) PROXY_CONFIG_ACTION="regenerate" ;;
    *) PROXY_CONFIG_ACTION="preserve" ;;
  esac
  log_info "Proxy config action: $PROXY_CONFIG_ACTION"
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
  if [ "$INSTALL_MODE" = "upgrade" ] && [ "$PROXY_CONFIG_ACTION" = "preserve" ]; then
    if [ ! -f "$TARGET_DIR/Caddyfile" ]; then
      log_error "Cannot preserve Caddyfile: $TARGET_DIR/Caddyfile not found."
      exit 1
    fi
    log_info "Keeping existing Caddyfile unchanged."
    return
  fi

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
    RESOLVED_APP_URL="http://$(get_primary_ipv4)"
  fi
}

infer_origin_from_caddyfile() {
  local caddy_file="$1"
  local site_block raw candidate
  [ -f "$caddy_file" ] || return 1

  site_block="$(awk '
    /^[[:space:]]*($|#|\{|\})/ { next }
    /\{$/ {
      line=$0
      sub(/[[:space:]]*\{$/, "", line)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
      if (line != "" && line != ":80" && line !~ /^www\./) {
        print line
        exit
      }
    }
  ' "$caddy_file")"

  [ -n "$site_block" ] || return 1
  raw="${site_block%%,*}"
  candidate="$(trim_space "$raw")"
  [ -n "$candidate" ] || return 1
  case "$candidate" in
    http://*|https://*)
      printf '%s' "$candidate"
      return 0
      ;;
    :80|*:80)
      printf 'http://%s' "$(get_primary_ipv4)"
      return 0
      ;;
  esac

  if [[ "$candidate" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+(:[0-9]+)?$ ]]; then
    printf 'http://%s' "$candidate"
    return 0
  fi

  if [[ "$candidate" =~ ^([a-z0-9-]+\.)+[a-z]{2,}(:[0-9]+)?$ ]]; then
    printf 'https://%s' "$candidate"
    return 0
  fi

  return 1
}

stop_existing_stack_if_needed() {
  [ "$INSTALL_MODE" = "reinstall" ] || return 0

  log_step "Stopping existing services before reinstall cleanup"
  if [ -f "$TARGET_DIR/docker-compose.yml" ]; then
    (
      cd "$TARGET_DIR"
      if docker compose ps >/dev/null 2>&1; then
        docker compose down --remove-orphans || true
      fi
    )
    log_success "Existing compose stack stopped."
    return 0
  fi

  log_warn "No compose file found in existing target directory; skipping compose down."
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
    UPGRADE_BACKUP_DIR="$backup_dir"
  fi
}

backup_upgrade_artifacts() {
  [ "$INSTALL_MODE" = "upgrade" ] || [ "$INSTALL_MODE" = "reinstall" ] || return 0

  local backup_dir base_dir
  base_dir="$TARGET_DIR"
  [ "$INSTALL_MODE" = "reinstall" ] && base_dir="."
  backup_dir="$base_dir/.installer-backups/$(date -u +"%Y%m%d-%H%M%S")"
  mkdir -p "$backup_dir"

  [ -f "$TARGET_DIR/.env" ] && cp "$TARGET_DIR/.env" "$backup_dir/.env"
  [ -f "$TARGET_DIR/Caddyfile" ] && cp "$TARGET_DIR/Caddyfile" "$backup_dir/Caddyfile"
  [ -f "$TARGET_DIR/docker-compose.yml" ] && cp "$TARGET_DIR/docker-compose.yml" "$backup_dir/docker-compose.yml"
  [ -f "$TARGET_DIR/compose.prod.yaml" ] && cp "$TARGET_DIR/compose.prod.yaml" "$backup_dir/compose.prod.yaml"
  [ -f "$TARGET_DIR/compose_prod_full.yml" ] && cp "$TARGET_DIR/compose_prod_full.yml" "$backup_dir/compose_prod_full.yml"

  UPGRADE_BACKUP_DIR="$backup_dir"
  log_success "Backup created: $backup_dir"
}

sync_source_tree() {
  log_step "Source synchronization"

  if [ "$INSTALL_MODE" = "fresh" ] || [ "$INSTALL_MODE" = "reinstall" ]; then
    if [ -e "$TARGET_DIR" ]; then
      rm -rf "$TARGET_DIR"
    fi
    if [ "$INSTALL_REF_TYPE" = "tag" ] || [ "$INSTALL_REF_TYPE" = "branch" ]; then
      git clone --branch "$INSTALL_REF_RESOLVED" --depth 1 "$REPO_URL" "$TARGET_DIR"
    else
      git clone "$REPO_URL" "$TARGET_DIR"
      (
        cd "$TARGET_DIR"
        git checkout --detach "$INSTALL_REF_RESOLVED"
      )
    fi
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

    if ! git fetch origin --tags; then
      log_error "git fetch failed. Upgrade aborted safely (no deletion performed)."
      exit 1
    fi

    if [ "$INSTALL_REF_TYPE" = "branch" ] && [ "$INSTALL_REF_RESOLVED" = "$DEFAULT_BRANCH" ]; then
      if ! git reset --hard "origin/$DEFAULT_BRANCH"; then
        log_error "git reset failed. Upgrade aborted safely (no deletion performed)."
        exit 1
      fi
    else
      if ! git checkout --force "$INSTALL_REF_RESOLVED"; then
        log_error "git checkout of target ref failed. Upgrade aborted safely."
        exit 1
      fi
      if [ "$INSTALL_REF_TYPE" = "commit" ]; then
        git checkout --detach "$INSTALL_REF_RESOLVED"
      fi
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

  local should_update_ingress_env=false
  local inferred_origin=""
  if [ "$INSTALL_MODE" != "upgrade" ] || [ "$PROXY_CONFIG_ACTION" = "regenerate" ]; then
    should_update_ingress_env=true
  fi

  if [ "$INSTALL_MODE" = "upgrade" ] && [ "$PROXY_CONFIG_ACTION" = "preserve" ]; then
    local existing_app_url existing_allowed
    existing_app_url="$(trim_space "$(env_get APP_URL)")"
    existing_allowed="$(trim_space "$(env_get ALLOWED_ORIGINS)")"

    if [ -z "$existing_app_url" ] || [ -z "$existing_allowed" ]; then
      inferred_origin="$(infer_origin_from_caddyfile "$TARGET_DIR/Caddyfile" || true)"
      if [ -z "$inferred_origin" ]; then
        log_error "Preserve mode requires APP_URL and ALLOWED_ORIGINS or an inferable Caddyfile origin."
        log_error "Set APP_URL/ALLOWED_ORIGINS in .env or choose proxy regeneration."
        exit 1
      fi
      log_warn "Preserve mode had incomplete origin env; inferred public origin from Caddyfile: ${inferred_origin}"
      [ -z "$existing_app_url" ] && env_set_explicit "APP_URL" "$inferred_origin"
      [ -z "$existing_allowed" ] && env_set_explicit "ALLOWED_ORIGINS" "$inferred_origin"
    fi
  fi

  if [ "$USE_DOMAIN" = true ]; then
    env_set_if_missing "APP_URL" "https://${DOMAIN_NAME}"
    env_set_if_missing "ALLOWED_ORIGINS" "https://${DOMAIN_NAME},https://www.${DOMAIN_NAME}"
    if [ "$should_update_ingress_env" = true ]; then
      env_set_explicit "APP_URL" "https://${DOMAIN_NAME}"
      env_set_explicit "ALLOWED_ORIGINS" "https://${DOMAIN_NAME},https://www.${DOMAIN_NAME}"
    fi
  else
    local ip_origin
    ip_origin="http://$(get_primary_ipv4)"

    env_set_if_missing "APP_URL" "$ip_origin"
    env_set_if_missing "ALLOWED_ORIGINS" "$ip_origin,http://localhost:3000,http://127.0.0.1:3000"

    if [ "$should_update_ingress_env" = true ]; then
      env_set_explicit "APP_URL" "$ip_origin"
      env_set_explicit "ALLOWED_ORIGINS" "$ip_origin,http://localhost:3000,http://127.0.0.1:3000"
    fi
  fi

  # Core values: only generate when missing
  env_set_if_missing "POSTGRES_USER" "elahe_bootstrap_$(random_hex 4)"
  env_set_if_missing "POSTGRES_PASSWORD" "$(random_hex 24)"
  env_set_if_missing "POSTGRES_DB" "elahe"
  env_set_if_missing "APP_DB_USER" "elahe_app_$(random_hex 4)"
  env_set_if_missing "APP_DB_PASSWORD" "$(random_hex 24)"
  env_set_if_missing "APP_DB_SSLMODE" "disable"

  local pg_user pg_pass pg_db app_db_user app_db_pass app_db_sslmode
  pg_user="$(env_get POSTGRES_USER)"
  pg_pass="$(env_get POSTGRES_PASSWORD)"
  pg_db="$(env_get POSTGRES_DB)"
  app_db_user="$(env_get APP_DB_USER)"
  app_db_pass="$(env_get APP_DB_PASSWORD)"
  app_db_sslmode="$(env_get APP_DB_SSLMODE)"
  env_set_if_missing "DATABASE_URL" "postgresql://${app_db_user}:${app_db_pass}@db:5432/${pg_db}?schema=public&sslmode=${app_db_sslmode}"
  env_set_if_missing "MIGRATION_DATABASE_URL" "postgresql://${pg_user}:${pg_pass}@db:5432/${pg_db}?schema=public&sslmode=${app_db_sslmode}"

  # Upgrade hardening: stop using bootstrap/superuser-style DB role for runtime app DATABASE_URL.
  local existing_database_url existing_migration_database_url bootstrap_db_prefix app_db_prefix
  existing_database_url="$(env_get DATABASE_URL)"
  existing_migration_database_url="$(env_get MIGRATION_DATABASE_URL)"
  bootstrap_db_prefix="postgresql://${pg_user}:${pg_pass}@db:5432/${pg_db}"
  app_db_prefix="postgresql://${app_db_user}:${app_db_pass}@db:5432/${pg_db}"
  if [[ "$existing_database_url" == "${bootstrap_db_prefix}"* ]]; then
    env_set_explicit "DATABASE_URL" "${existing_database_url/$bootstrap_db_prefix/$app_db_prefix}"
    log_warn "DATABASE_URL was upgraded from bootstrap DB role to least-privilege runtime role."
  fi
  if [ -n "$existing_migration_database_url" ] && [[ "$existing_migration_database_url" == "${app_db_prefix}"* ]]; then
    env_set_explicit "MIGRATION_DATABASE_URL" "${existing_migration_database_url/$app_db_prefix/$bootstrap_db_prefix}"
    log_warn "MIGRATION_DATABASE_URL was upgraded to use the bootstrap provisioning role."
  fi

  env_set_if_missing "PRISMA_CONNECTION_LIMIT" "10"
  env_set_if_missing "LOG_LEVEL" "info"
  env_set_if_missing "NODE_ENV" "production"
  env_set_if_missing "PORT" "3000"

  env_set_if_missing "JWT_SECRET" "$(random_hex 32)"
  env_set_if_missing "SESSION_SECRET" "$(random_hex 32)"
  env_set_if_missing "ENCRYPTION_KEY" "$(random_hex 32)"
  env_set_if_missing "DOWNLOAD_TOKEN_SECRET" "$(random_hex 32)"
  env_set_if_missing "LOCAL_CAPTCHA_SECRET" "$(random_hex 32)"
  env_set_if_missing "CAPTCHA_PROVIDER" "recaptcha"

  env_set_if_missing "RATE_LIMIT_WINDOW_MS" "900000"
  env_set_if_missing "RATE_LIMIT_MAX_REQUESTS" "100"
  env_set_if_missing "SOCKET_RATE_LIMIT_WINDOW_MS" "10000"
  env_set_if_missing "SOCKET_RATE_LIMIT_MAX" "30"
  env_set_if_missing "QUEUE_CONCURRENCY" "5"
  env_set_if_missing "OBJECT_STORAGE_DRIVER" "local"
  env_set_if_missing "OBJECT_STORAGE_ROOT" "/app/object_storage"
  env_set_if_missing "ADMIN_BOOTSTRAP_STATE_DIR" "/app/runtime_state"

  if [ "$INSTALL_MODE" = "fresh" ] || [ "$INSTALL_MODE" = "reinstall" ]; then
    env_set_if_missing "ADMIN_USERNAME" "$ADMIN_USERNAME_VALUE"
    local bootstrap_password_file_host="$TARGET_DIR/runtime/admin-bootstrap-password"
    mkdir -p "$TARGET_DIR/runtime"
    if [ ! -f "$bootstrap_password_file_host" ]; then
      printf '%s\n' "$ADMIN_PASSWORD_VALUE" > "$bootstrap_password_file_host"
      ensure_root_owned_600 "$bootstrap_password_file_host"
    fi
    env_set_if_missing "ADMIN_BOOTSTRAP_PASSWORD_FILE" "/run/secrets/admin-bootstrap-password"
    env_set_if_missing "ADMIN_BOOTSTRAP_STRICT" "true"
    if [ "$ADMIN_FORCE_PASSWORD_CHANGE" = true ]; then
      env_set_if_missing "ADMIN_BOOTSTRAP_FORCE_PASSWORD_CHANGE" "true"
    else
      env_set_if_missing "ADMIN_BOOTSTRAP_FORCE_PASSWORD_CHANGE" "false"
    fi
    env_set_if_missing "ADMIN_BOOTSTRAP_RESET_EXISTING" "false"
  else
    env_set_if_missing "ADMIN_BOOTSTRAP_STRICT" "false"
    env_set_if_missing "ADMIN_BOOTSTRAP_FORCE_PASSWORD_CHANGE" "false"
    env_set_if_missing "ADMIN_BOOTSTRAP_RESET_EXISTING" "false"
  fi

  apply_env_updates "$env_file"
  RESOLVED_APP_URL="$(env_get APP_URL)"

  write_admin_secret_file
  log_success "Environment updated safely (minimal key updates)."
}

configure_npmrc() {
  local npmrc="$TARGET_DIR/.npmrc"
  if [ -f "$npmrc" ]; then
    log_info "Existing .npmrc detected; preserving operator npm configuration."
    return
  fi
  cat > "$npmrc" <<'EON'
registry=https://registry.npmjs.org
fetch-retry-maxtimeout=600000
fetch-retry-mintimeout=100000
fetch-retries=10
maxsockets=10
EON
  log_success "Created default .npmrc (operator can override as needed)."
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

validate_caddy_runtime_config() {
  log_step "Validating runtime Caddy container config"
  (
    cd "$TARGET_DIR"
    local caddy_cid
    caddy_cid="$(docker compose ps -q caddy 2>/dev/null | head -n1)"
    [ -n "$caddy_cid" ] || { log_error "Caddy container ID not found."; exit 1; }
    docker exec "$caddy_cid" caddy validate --config /etc/caddy/Caddyfile >/dev/null
  )
  CADDY_RUNTIME_VALIDATED=true
  log_success "Caddy runtime config validation passed."
}

provision_runtime_db_role() {
  log_step "Provisioning least-privilege runtime DB role"
  (
    cd "$TARGET_DIR"
    local db_cid db_user db_password db_name app_db_user app_db_password sql_file
    db_cid="$(docker compose ps -q db 2>/dev/null | head -n1)"
    [ -n "$db_cid" ] || { log_error "DB container ID not found for runtime role provisioning."; exit 1; }

    db_user="$(env_get POSTGRES_USER)"
    db_password="$(env_get POSTGRES_PASSWORD)"
    db_name="$(env_get POSTGRES_DB)"
    app_db_user="$(env_get APP_DB_USER)"
    app_db_password="$(env_get APP_DB_PASSWORD)"

    sql_file="$(mktemp)"
    cat > "$sql_file" <<'EOSQL'
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_db_user') THEN
    EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT', :'app_db_user', :'app_db_password');
  ELSE
    EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT', :'app_db_user', :'app_db_password');
  END IF;
END
\$\$;
SELECT format('GRANT CONNECT, TEMP ON DATABASE %I TO %I', :'db_name', :'app_db_user') AS sql \gexec
\c :db_name
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'app_db_user') AS sql \gexec
SELECT format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', :'app_db_user') AS sql \gexec
SELECT format('GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO %I', :'app_db_user') AS sql \gexec
SELECT format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO %I', :'app_db_user') AS sql \gexec
SELECT format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', :'app_db_user') AS sql \gexec
SELECT format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO %I', :'app_db_user') AS sql \gexec
SELECT format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO %I', :'app_db_user') AS sql \gexec
EOSQL

    docker exec -e PGPASSWORD="$db_password" -i "$db_cid" \
      psql -v ON_ERROR_STOP=1 \
      -v app_db_user="$app_db_user" \
      -v app_db_password="$app_db_password" \
      -v db_name="$db_name" \
      -U "$db_user" -d postgres -f - < "$sql_file"
    rm -f "$sql_file"
  )
  log_success "Runtime DB role provisioning complete."
}

launch_services() {
  log_step "Launching services"
  (
    cd "$TARGET_DIR"

    docker compose config >/dev/null

    if [ "$INSTALL_MODE" = "upgrade" ]; then
      docker compose pull db caddy || true
      docker compose up -d db
    else
      docker compose up -d db
    fi
  )

  if ! wait_for_container_health "db" 180; then
    print_failure_diagnostics
    exit 1
  fi
  provision_runtime_db_role

  (
    cd "$TARGET_DIR"
    docker compose build app
    docker compose up -d app caddy
  )

  log_success "Compose services started."
}

get_service_container_id() {
  local service="$1"
  (
    cd "$TARGET_DIR"
    docker compose ps -q "$service" 2>/dev/null | head -n1
  )
}

wait_for_container_state() {
  local service="$1"
  local expected="$2"
  local timeout="${3:-180}"
  local elapsed=0
  local container_id state

  while [ "$elapsed" -lt "$timeout" ]; do
    container_id="$(get_service_container_id "$service")"
    if [ -n "$container_id" ]; then
      state="$(docker inspect -f '{{.State.Status}}' "$container_id" 2>/dev/null || true)"
      [ "$state" = "$expected" ] && return 0
    fi
    sleep 3
    elapsed=$((elapsed + 3))
  done
  return 1
}

wait_for_container_health() {
  local service="$1"
  local timeout="${2:-240}"
  local elapsed=0
  local container_id health state

  while [ "$elapsed" -lt "$timeout" ]; do
    container_id="$(get_service_container_id "$service")"
    if [ -n "$container_id" ]; then
      health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id" 2>/dev/null || true)"
      state="$(docker inspect -f '{{.State.Status}}' "$container_id" 2>/dev/null || true)"
      if [ "$health" = "healthy" ]; then
        return 0
      fi
      if [ "$state" = "exited" ] || [ "$health" = "unhealthy" ]; then
        return 1
      fi
    fi
    sleep 4
    elapsed=$((elapsed + 4))
  done

  return 1
}

print_failure_diagnostics() {
  log_error "Startup verification failed. Collecting diagnostics."
  (
    cd "$TARGET_DIR"
    docker compose ps || true
    for svc in db app caddy; do
      local cid
      cid="$(docker compose ps -q "$svc" 2>/dev/null | head -n1)"
      if [ -n "$cid" ]; then
        echo "--- logs: $svc ---"
        docker logs --tail 120 "$cid" || true
      fi
    done
  )
  if [ -n "$UPGRADE_BACKUP_DIR" ]; then
    log_warn "Rollback guidance: restore from backup at $UPGRADE_BACKUP_DIR"
  fi
}

verify_post_launch_health() {
  log_step "Post-launch health verification"

  log_info "Phase 1/3: local container health"
  if ! wait_for_container_health "db" 180; then
    print_failure_diagnostics
    exit 1
  fi
  log_success "Database container is healthy."

  if ! wait_for_container_health "app" 300; then
    print_failure_diagnostics
    exit 1
  fi
  log_success "App container is healthy."

  if ! wait_for_container_state "caddy" "running" 120; then
    print_failure_diagnostics
    exit 1
  fi
  log_success "Caddy container is running."

  log_info "Phase 2/3: local reverse proxy health"
  if ! validate_caddy_runtime_config; then
    print_failure_diagnostics
    exit 1
  fi

  if curl -fsS --max-time 8 "http://127.0.0.1/api/health/live" >/dev/null 2>&1; then
    LOCAL_PROXY_HEALTH_VALIDATED=true
    log_success "Local Caddy HTTP routing probe passed."
  else
    log_error "Local Caddy HTTP routing probe failed (http://127.0.0.1/api/health/live)."
    print_failure_diagnostics
    exit 1
  fi

  log_info "Phase 3/4: bootstrap admin verification"
  (
    cd "$TARGET_DIR"
    local admin_username admin_count
    admin_username="$(env_get ADMIN_USERNAME)"
    [ -n "$admin_username" ] || { log_error "ADMIN_USERNAME is not set; cannot verify bootstrap admin."; exit 1; }
    admin_count="$(docker compose exec -T db sh -lc "PGPASSWORD=\"\$POSTGRES_PASSWORD\" psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -tAc \"SELECT COUNT(*) FROM \\\"User\\\" WHERE username = '${admin_username}' AND role = 'ADMIN';\"" 2>/dev/null | tr -d '[:space:]')"
    [ -n "$admin_count" ] || admin_count="0"
    if [ "$admin_count" != "1" ]; then
      log_error "Bootstrap admin verification failed. Expected one admin user '${admin_username}', found ${admin_count}."
      print_failure_diagnostics
      exit 1
    fi
  )
  log_success "Bootstrap admin user verified."

  log_info "Phase 4/4: external readiness checks"
  if [ "$USE_DOMAIN" = true ]; then
    log_warn "Container/proxy checks passed. External DNS/TLS issuance is NOT guaranteed yet."
    log_warn "Verify DNS A/AAAA records, then run: curl -Iv https://${DOMAIN_NAME}"
  fi
}

print_summary() {
  log_step "Complete"
  echo "Mode: $INSTALL_MODE"
  echo "Source ref: ${INSTALL_REF_RESOLVED:-unknown} (${INSTALL_REF_TYPE:-unknown})"
  echo "App URL: ${RESOLVED_APP_URL}"
  echo "Project dir: $TARGET_DIR"
  echo "Config policy: preserve .env/Caddyfile/operator overrides by default; regenerate only when explicitly selected."
  if [ -n "$ADMIN_CREATED_FILE" ]; then
    echo "Bootstrap admin credentials saved to: $ADMIN_CREATED_FILE"
  fi
  if [ "$INSTALL_MODE" = "upgrade" ]; then
    echo "Admin bootstrap env vars are create-only by default and do not overwrite an existing admin user."
    echo "To reset an existing admin via env, set ADMIN_BOOTSTRAP_RESET_EXISTING=true for a one-time reset."
  fi
  echo "No admin password was printed to terminal output."
  if [ "$CADDY_RUNTIME_VALIDATED" = true ]; then
    echo "Caddy runtime config validated inside container."
  fi
  if [ "$LOCAL_PROXY_HEALTH_VALIDATED" = true ]; then
    echo "Local reverse-proxy route validated via http://127.0.0.1/api/health/live."
  fi
  echo "PostgreSQL remains internal to Docker network by default (no host 5432 publish)."
  echo "Firewall (UFW) is operator-managed and was not auto-enabled by installer."
  echo "Caddy handles TLS renewals internally; no extra cron entry was installed."
}

main() {
  if [ "$(uname -s)" != "Linux" ]; then
    log_error "Linux is required."
    exit 1
  fi

  require_root
  choose_install_mode
  preflight_checks
  check_dependencies
  ensure_docker_ready
  ensure_install_directory
  backup_upgrade_artifacts
  stop_existing_stack_if_needed
  choose_source_ref
  sync_source_tree
  if [ "$INSTALL_MODE" = "upgrade" ]; then
    choose_proxy_config_action_upgrade
  fi
  if [ "$INSTALL_MODE" != "upgrade" ] || [ "$PROXY_CONFIG_ACTION" = "regenerate" ]; then
    collect_domain_ssl_input
  fi
  configure_caddyfile
  configure_runtime_env
  configure_npmrc
  validate_caddy_config
  launch_services
  verify_post_launch_health
  print_summary
}

trap on_error ERR
main "$@"
