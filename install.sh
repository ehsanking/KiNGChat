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
SUPPORTED_ARCHS=("amd64" "arm64")
APT_MAX_RETRIES=3
APT_RETRY_DELAY_SECONDS=5
APT_LOCK_TIMEOUT_SECONDS=120

BLUE='\033[1;34m'
RED='\033[1;31m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
PURPLE='\033[1;35m'
CYAN='\033[1;36m'
NC='\033[0m'

INSTALL_MODE=""
INSTALL_NONINTERACTIVE="${INSTALL_NONINTERACTIVE:-}"
NONINTERACTIVE=false
USE_DOMAIN=false
DOMAIN_NAME=""
PUBLIC_IP=""
SSL_EMAIL=""
USE_CUSTOM_SSL_CERT=false
CUSTOM_SSL_CERT_SOURCE=""
CUSTOM_SSL_KEY_SOURCE=""
CUSTOM_SSL_CERT_PATH="/etc/caddy/certs/custom-cert.pem"
CUSTOM_SSL_KEY_PATH="/etc/caddy/certs/custom-key.pem"
RESOLVED_APP_URL=""
PROXY_CONFIG_ACTION="generate"
ADMIN_CREATED_FILE=""
ADMIN_AUTO_GENERATED=false
ADMIN_FORCE_PASSWORD_CHANGE=false
ADMIN_EMAIL_VALUE=""
UPGRADE_BACKUP_DIR=""
CADDY_RUNTIME_VALIDATED=false
LOCAL_PROXY_HEALTH_VALIDATED=false
REINSTALL_ENV_REUSED=false
REINSTALL_ADMIN_SECRET_RESTORED=false
REINSTALL_DB_ENV_RESTORED=false
INSTALL_ERRORS=()

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() {
  local message="$1"
  INSTALL_ERRORS+=("$message")
  echo -e "${RED}[ERR]${NC} ${message}"
}
log_step() { echo -e "\n${PURPLE}=== $1 ===${NC}"; }

print_error_report() {
  if [ "${#INSTALL_ERRORS[@]}" -eq 0 ]; then
    return 0
  fi

  echo ""
  echo "---- install failure report ----"
  local i=1
  for err in "${INSTALL_ERRORS[@]}"; do
    printf '%d) %s\n' "$i" "$err"
    i=$((i + 1))
  done
  echo "--------------------------------"
}

command_exists() { command -v "$1" >/dev/null 2>&1; }

normalize_arch() {
  local raw_arch="$1"
  case "$raw_arch" in
    x86_64|amd64) printf 'amd64' ;;
    aarch64|arm64) printf 'arm64' ;;
    *) printf '%s' "$raw_arch" ;;
  esac
}

check_supported_architecture() {
  local raw_arch normalized
  raw_arch="$(uname -m)"
  normalized="$(normalize_arch "$raw_arch")"
  if [[ " ${SUPPORTED_ARCHS[*]} " != *" ${normalized} "* ]]; then
    log_error "Unsupported CPU architecture: ${raw_arch} (normalized: ${normalized})."
    log_error "Supported architectures: ${SUPPORTED_ARCHS[*]}."
    exit 1
  fi
  log_success "Architecture check passed (${normalized})."
}

run_apt_with_error_context() {
  local action="$1"
  shift
  local log_file attempt
  log_file="$(mktemp)"
  local apt_args=(-o "Dpkg::Lock::Timeout=${APT_LOCK_TIMEOUT_SECONDS}" -o "Acquire::Retries=3")

  attempt=1
  while [ "$attempt" -le "$APT_MAX_RETRIES" ]; do
    if DEBIAN_FRONTEND=noninteractive apt-get "${apt_args[@]}" "$@" >"$log_file" 2>&1; then
      rm -f "$log_file"
      return 0
    fi

    if [ "$attempt" -lt "$APT_MAX_RETRIES" ]; then
      log_warn "apt-get ${action} failed (attempt ${attempt}/${APT_MAX_RETRIES}). Retrying in ${APT_RETRY_DELAY_SECONDS}s."
      sleep "$APT_RETRY_DELAY_SECONDS"
    fi
    attempt=$((attempt + 1))
  done

  log_error "apt-get ${action} failed after ${APT_MAX_RETRIES} attempts. Recent apt output:"
  tail -n 40 "$log_file" >&2 || true
  rm -f "$log_file"
  return 1
}

apt_update_quiet() {
  run_apt_with_error_context "update" update -qq
}

apt_install_quiet() {
  local packages=("$@")
  run_apt_with_error_context "install (${packages[*]})" install -y -qq "${packages[@]}"
}

apt_upgrade_quiet() {
  local upgrade_log attempt
  upgrade_log="$(mktemp)"
  local apt_args=(-o "Dpkg::Lock::Timeout=${APT_LOCK_TIMEOUT_SECONDS}" -o "Acquire::Retries=3")

  attempt=1
  while [ "$attempt" -le "$APT_MAX_RETRIES" ]; do
    if DEBIAN_FRONTEND=noninteractive apt-get "${apt_args[@]}" upgrade -y -qq >"$upgrade_log" 2>&1; then
      rm -f "$upgrade_log"
      return 0
    fi

    if grep -Fqi "dpkg was interrupted, you must manually run 'dpkg --configure -a'" "$upgrade_log"; then
      log_warn "Detected interrupted dpkg state. Running 'dpkg --configure -a' once, then retrying apt upgrade."
      if ! DEBIAN_FRONTEND=noninteractive dpkg --configure -a >>"$upgrade_log" 2>&1; then
        log_error "dpkg --configure -a failed while recovering apt state. Recent output:"
        tail -n 40 "$upgrade_log" >&2 || true
        rm -f "$upgrade_log"
        return 1
      fi

      if DEBIAN_FRONTEND=noninteractive apt-get "${apt_args[@]}" upgrade -y -qq >>"$upgrade_log" 2>&1; then
        rm -f "$upgrade_log"
        return 0
      fi
    fi

    if [ "$attempt" -lt "$APT_MAX_RETRIES" ]; then
      log_warn "apt-get upgrade failed (attempt ${attempt}/${APT_MAX_RETRIES}). Retrying in ${APT_RETRY_DELAY_SECONDS}s."
      sleep "$APT_RETRY_DELAY_SECONDS"
    fi
    attempt=$((attempt + 1))
  done

  log_error "apt-get upgrade failed after ${APT_MAX_RETRIES} attempts. Recent apt output:"
  tail -n 40 "$upgrade_log" >&2 || true
  rm -f "$upgrade_log"
  return 1
}

detect_linux_distribution() {
  local distro_id=""
  if [ -r /etc/os-release ]; then
    # /etc/os-release is provided by the base OS.
    # shellcheck disable=SC1091
    distro_id="$(. /etc/os-release && printf '%s' "${ID:-}")"
  fi
  printf '%s' "${distro_id,,}"
}

compose_project_name() {
  basename "$TARGET_DIR" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' '_'
}

postgres_named_volume() {
  printf '%s_pgdata' "$(compose_project_name)"
}

postgres_volume_exists() {
  local volume_name
  volume_name="$(postgres_named_volume)"
  docker volume inspect "$volume_name" >/dev/null 2>&1
}

is_true() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|y|Y|on|ON) return 0 ;;
    *) return 1 ;;
  esac
}

has_prompt_tty() {
  [ -t 0 ] || [ -r /dev/tty ]
}

on_error() {
  local line="${1:-unknown}"
  local cmd="${2:-unknown}"
  local exit_code=$?
  if [ "$exit_code" -ne 0 ]; then
    log_error "Installer failed (exit code: $exit_code, line: $line, command: $cmd)."
    if [ -n "$UPGRADE_BACKUP_DIR" ]; then
      log_warn "Backup available at: $UPGRADE_BACKUP_DIR"
      log_warn "Rollback: stop compose, restore files from backup, then relaunch."
    fi
    print_error_report
  fi
}

require_root() {
  if [ "${EUID:-$(id -u)}" -ne 0 ]; then
    if command_exists sudo && [ -t 0 ] && [ -f "${BASH_SOURCE[0]:-}" ]; then
      log_info "Root privileges are required. Re-running installer with sudo..."
      exec sudo -E bash "${BASH_SOURCE[0]}" "$@"
    fi
    log_error "Installer must run as root. Re-run with: curl -fsSL https://raw.githubusercontent.com/ehsanking/ElaheMessenger/main/install.sh | ( [ \"\$(id -u)\" -eq 0 ] && bash || sudo bash )"
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

is_valid_ipv4() {
  local ip="$1"
  [[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || return 1
  awk -F'.' '{ for (i=1; i<=4; i++) if ($i < 0 || $i > 255) exit 1 }' <<<"$ip"
}

get_primary_ipv6() {
  local ipv6
  ipv6=$(hostname -I 2>/dev/null | tr ' ' '\n' | awk '/:/{print}' | grep -Ev '^(fe80:|::1$)' | head -n 1 || true)
  printf '%s' "$ipv6"
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

ensure_container_secret_permissions() {
  local target="$1"
  # App container runs as uid/gid 1001. Keep file private while making
  # mounted bootstrap secret readable to the runtime user.
  if command_exists chown; then
    chown 1001:1001 "$target" 2>/dev/null || true
  fi
  chmod 600 "$target" 2>/dev/null || true
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
  log_step "Source ref selection (main or release tag)"

  if [ -n "$INSTALL_REF_INPUT" ]; then
    if [ "$INSTALL_REF_INPUT" = "$DEFAULT_BRANCH" ]; then
      INSTALL_REF_RESOLVED="$DEFAULT_BRANCH"
      INSTALL_REF_TYPE="branch"
      log_info "Using INSTALL_REF from environment: ${INSTALL_REF_RESOLVED} (${INSTALL_REF_TYPE})"
      return 0
    fi
    if git ls-remote --exit-code --tags "$REPO_URL" "refs/tags/${INSTALL_REF_INPUT}" >/dev/null 2>&1; then
      INSTALL_REF_RESOLVED="$INSTALL_REF_INPUT"
      INSTALL_REF_TYPE="tag"
      log_info "Using INSTALL_REF from environment: ${INSTALL_REF_RESOLVED} (${INSTALL_REF_TYPE})"
      return 0
    fi
    log_error "INSTALL_REF must be '${DEFAULT_BRANCH}' or a valid release tag."
    exit 1
  fi

  if [ "$NONINTERACTIVE" = true ]; then
    INSTALL_REF_RESOLVED="$DEFAULT_BRANCH"
    INSTALL_REF_TYPE="branch"
    log_info "Non-interactive mode: using branch head ${DEFAULT_BRANCH}."
    return 0
  fi

  local choice release_tag
  echo -e "${CYAN}Select source ref:${NC}"
  echo "  1) Use mutable branch head (${DEFAULT_BRANCH}) [recommended]"
  echo "  2) Enter a release tag (for example: v1.0.0)"
  choice=$(read_tty_input "${YELLOW}Enter choice [1-2]:${NC} " "1")
  case "$choice" in
    2)
      release_tag=$(trim_space "$(read_tty_input "${CYAN}Enter release tag:${NC} " "")")
      if ! git ls-remote --exit-code --tags "$REPO_URL" "refs/tags/${release_tag}" >/dev/null 2>&1; then
        log_error "Release tag '${release_tag}' not found."
        exit 1
      fi
      INSTALL_REF_RESOLVED="$release_tag"
      INSTALL_REF_TYPE="tag"
      ;;
    *)
      INSTALL_REF_RESOLVED="$DEFAULT_BRANCH"
      INSTALL_REF_TYPE="branch"
      ;;
  esac

  log_info "Resolved install ref: ${INSTALL_REF_RESOLVED} (${INSTALL_REF_TYPE})"
}

choose_install_mode() {
  log_step "Install mode detection"

  if [ -n "${INSTALL_MODE:-}" ]; then
    case "$INSTALL_MODE" in
      fresh|upgrade|reinstall) ;;
      *)
        log_error "Invalid INSTALL_MODE='${INSTALL_MODE}'. Allowed: fresh|upgrade|reinstall."
        exit 1
        ;;
    esac
  fi

  local dir_exists=false env_exists=false compose_project=false known_containers=false known_project_files=false

  [ -d "$TARGET_DIR" ] && dir_exists=true
  [ -f "$TARGET_DIR/.env" ] && env_exists=true
  [ -f "$TARGET_DIR/docker-compose.yml" ] && known_project_files=true

  local detected_compose_project
  detected_compose_project="$(compose_project_name)"

  if command_exists docker && [ -n "$(docker ps -a --filter "label=com.docker.compose.project=${detected_compose_project}" --format '{{.Names}}' 2>/dev/null)" ]; then
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

  if [ -n "${INSTALL_MODE:-}" ]; then
    log_info "Using INSTALL_MODE from environment: $INSTALL_MODE"
  elif [ "$NONINTERACTIVE" = true ]; then
    INSTALL_MODE="upgrade"
    log_info "Non-interactive mode: defaulting to upgrade for detected existing install."
  else
    local choice
    choice=$(read_tty_input "${YELLOW}Enter choice [1-3]:${NC} " "1")
    case "$choice" in
      1) INSTALL_MODE="upgrade" ;;
      2) INSTALL_MODE="reinstall" ;;
      *) log_warn "Aborted by operator."; exit 0 ;;
    esac
  fi

  log_info "Selected mode: $INSTALL_MODE"
}

check_ports() {
  if ! command_exists ss; then
    log_error "Required command 'ss' is unavailable. Install iproute2 package and rerun installer."
    exit 1
  fi

  local conflicts=()
  local tcp_port
  local udp_port
  local tcp_ports=(80 443)
  local udp_ports=(443)

  for tcp_port in "${tcp_ports[@]}"; do
    if ss -ltnH 2>/dev/null | awk '{print $4}' | grep -Eq "(^|:)$tcp_port$"; then
      conflicts+=("tcp/$tcp_port")
    fi
  done

  for udp_port in "${udp_ports[@]}"; do
    if ss -lunH 2>/dev/null | awk '{print $5}' | grep -Eq "(^|:)$udp_port$"; then
      conflicts+=("udp/$udp_port")
    fi
  done

  if [ ${#conflicts[@]} -gt 0 ]; then
    log_warn "Required listener ports are in use: ${conflicts[*]}"
    if [ "$NONINTERACTIVE" = true ]; then
      log_error "Non-interactive mode refuses to continue with occupied ports. Free tcp/80 tcp/443 udp/443 or rerun interactively."
      exit 1
    fi
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

ensure_system_up_to_date() {
  log_step "System update check"
  local distro_id
  distro_id="$(detect_linux_distribution)"

  case "$distro_id" in
    ubuntu|debian)
      log_info "Detected Linux distribution: ${distro_id}. Running apt package index update."
      apt_update_quiet
      log_info "Applying available package upgrades."
      apt_upgrade_quiet
      log_success "System packages updated."
      ;;
    *)
      log_warn "Detected Linux distribution: ${distro_id:-unknown}. Automatic system upgrade is not configured for this distro."
      log_warn "Please update system packages manually before proceeding."
      ;;
  esac
}

install_docker_apt() {
  if ! command_exists apt-get; then
    log_error "Docker missing and apt-get unavailable. Install Docker manually then rerun."
    exit 1
  fi

  log_info "Installing Docker from distro packages (no curl|sh)."
  apt_update_quiet
  apt_install_quiet docker.io

  if ! command_exists docker; then
    log_error "Docker installation failed."
    exit 1
  fi
}

install_docker_compose_plugin_apt() {
  if ! command_exists apt-get; then
    return 1
  fi

  local candidates=("docker-compose-plugin" "docker-compose-v2")
  local pkg
  for pkg in "${candidates[@]}"; do
    if ! apt-cache show "$pkg" >/dev/null 2>&1; then
      continue
    fi
    if apt_install_quiet "$pkg"; then
      return 0
    fi
  done

  return 1
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
      apt_update_quiet
      apt_install_quiet "$dep"
    fi
  done

  if ! command_exists docker; then
    install_docker_apt
  fi

  if ! docker compose version >/dev/null 2>&1; then
    if command_exists apt-get; then
      apt_update_quiet
    fi
    install_docker_compose_plugin_apt || true
  fi

  docker compose version >/dev/null 2>&1 || {
    log_error "docker compose not available. Install package 'docker-compose-plugin' or 'docker-compose-v2' and re-run installer."
    exit 1
  }
}

collect_domain_ssl_input() {
  log_step "Domain/IP configuration"
  local detected_ipv4 detected_ipv6
  detected_ipv4="$(get_primary_ipv4)"
  detected_ipv6="$(get_primary_ipv6)"

  log_info "Detected server IPv4: ${detected_ipv4}"
  if [ -n "$detected_ipv6" ]; then
    log_info "Detected server IPv6: ${detected_ipv6}"
  else
    log_info "Detected server IPv6: not found"
  fi
  log_info "If you use a domain, point DNS records to this server (A -> IPv4, AAAA -> IPv6 when available)."

  if [ "$NONINTERACTIVE" = true ]; then
    if is_true "${INSTALL_USE_DOMAIN:-false}"; then
      DOMAIN_NAME="${DOMAIN_NAME:-${INSTALL_DOMAIN_NAME:-}}"
      DOMAIN_NAME="${DOMAIN_NAME#http://}"
      DOMAIN_NAME="${DOMAIN_NAME#https://}"
      DOMAIN_NAME="${DOMAIN_NAME%%/*}"
      DOMAIN_NAME="${DOMAIN_NAME,,}"
      if [[ -z "$DOMAIN_NAME" || ! "$DOMAIN_NAME" =~ ^([a-z0-9-]+\.)+[a-z]{2,}$ ]]; then
        log_error "INSTALL_USE_DOMAIN=true requires valid INSTALL_DOMAIN_NAME in non-interactive mode."
        exit 1
      fi
      SSL_EMAIL="${SSL_EMAIL:-${INSTALL_SSL_EMAIL:-admin@${DOMAIN_NAME}}}"
      if is_true "${INSTALL_USE_CUSTOM_SSL_CERT:-false}"; then
        CUSTOM_SSL_CERT_SOURCE="${INSTALL_SSL_CERT_PATH:-}"
        CUSTOM_SSL_KEY_SOURCE="${INSTALL_SSL_KEY_PATH:-}"
        if [ -z "$CUSTOM_SSL_CERT_SOURCE" ] || [ -z "$CUSTOM_SSL_KEY_SOURCE" ]; then
          log_error "INSTALL_USE_CUSTOM_SSL_CERT=true requires INSTALL_SSL_CERT_PATH and INSTALL_SSL_KEY_PATH."
          exit 1
        fi
        if [ ! -f "$CUSTOM_SSL_CERT_SOURCE" ] || [ ! -r "$CUSTOM_SSL_CERT_SOURCE" ]; then
          log_error "Custom certificate file is missing or unreadable: $CUSTOM_SSL_CERT_SOURCE"
          exit 1
        fi
        if [ ! -f "$CUSTOM_SSL_KEY_SOURCE" ] || [ ! -r "$CUSTOM_SSL_KEY_SOURCE" ]; then
          log_error "Custom certificate key is missing or unreadable: $CUSTOM_SSL_KEY_SOURCE"
          exit 1
        fi
        USE_CUSTOM_SSL_CERT=true
      else
        USE_CUSTOM_SSL_CERT=false
      fi
      USE_DOMAIN=true
      return
    fi
    PUBLIC_IP="${INSTALL_PUBLIC_IP:-$(get_primary_ipv4)}"
    if ! is_valid_ipv4 "$PUBLIC_IP"; then
      log_error "INSTALL_PUBLIC_IP must be a valid IPv4 address in non-interactive mode."
      exit 1
    fi
    USE_DOMAIN=false
    return
  fi

  echo -e "${CYAN}Choose external access mode:${NC}"
  echo "  1) Domain (Caddy TLS on :443)"
  echo "  2) IP-only (Caddy HTTP on :80)"

  local choice
  while true; do
    choice=$(read_tty_input "${YELLOW}Enter choice [1-2]:${NC} " "")
    case "$choice" in
      1|2) break ;;
      *) log_warn "Please enter 1 (Domain) or 2 (IP-only)." ;;
    esac
  done

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
    local has_custom_cert
    has_custom_cert=$(read_tty_input "${CYAN}Do you already have a personal SSL certificate? [y/N]:${NC} " "N")
    case "$has_custom_cert" in
      y|Y|yes|YES)
        USE_CUSTOM_SSL_CERT=true
        CUSTOM_SSL_CERT_SOURCE=$(read_tty_input "${CYAN}Full path to certificate file (.crt/.pem):${NC} " "")
        CUSTOM_SSL_KEY_SOURCE=$(read_tty_input "${CYAN}Full path to private key file (.key/.pem):${NC} " "")
        if [ -z "$CUSTOM_SSL_CERT_SOURCE" ] || [ -z "$CUSTOM_SSL_KEY_SOURCE" ]; then
          log_error "Certificate and key paths are required when using personal SSL certificates."
          exit 1
        fi
        if [ ! -f "$CUSTOM_SSL_CERT_SOURCE" ] || [ ! -r "$CUSTOM_SSL_CERT_SOURCE" ]; then
          log_error "Certificate file is missing or unreadable: $CUSTOM_SSL_CERT_SOURCE"
          exit 1
        fi
        if [ ! -f "$CUSTOM_SSL_KEY_SOURCE" ] || [ ! -r "$CUSTOM_SSL_KEY_SOURCE" ]; then
          log_error "Private key file is missing or unreadable: $CUSTOM_SSL_KEY_SOURCE"
          exit 1
        fi
        ;;
      *)
        USE_CUSTOM_SSL_CERT=false
        ;;
    esac
    USE_DOMAIN=true
  else
    while true; do
      PUBLIC_IP=$(read_tty_input "${CYAN}Public IPv4 for APP_URL (required, detected: ${detected_ipv4}):${NC} " "")
      if is_valid_ipv4 "$PUBLIC_IP"; then
        break
      fi
      log_warn "A valid IPv4 address is required to continue."
    done
    USE_DOMAIN=false
  fi
}

persist_custom_ssl_certificates() {
  [ "$USE_DOMAIN" = true ] || return 0
  [ "$USE_CUSTOM_SSL_CERT" = true ] || return 0

  local cert_dir="$TARGET_DIR/certs"
  mkdir -p "$cert_dir"
  install -m 600 "$CUSTOM_SSL_CERT_SOURCE" "$TARGET_DIR/certs/custom-cert.pem"
  install -m 600 "$CUSTOM_SSL_KEY_SOURCE" "$TARGET_DIR/certs/custom-key.pem"
  if command_exists chown; then
    chown root:root "$TARGET_DIR/certs/custom-cert.pem" "$TARGET_DIR/certs/custom-key.pem" 2>/dev/null || true
  fi
}

choose_proxy_config_action_upgrade() {
  log_step "Proxy configuration on upgrade"
  if [ "$NONINTERACTIVE" = true ]; then
    if [ "${PROXY_CONFIG_ACTION:-}" = "regenerate" ]; then
      log_info "Non-interactive mode: regenerating proxy config due to PROXY_CONFIG_ACTION=regenerate."
      return
    fi
    PROXY_CONFIG_ACTION="preserve"
    log_info "Non-interactive mode: preserving existing proxy config."
    return
  fi
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

  if [ "$NONINTERACTIVE" = true ]; then
    local configured_user configured_password
    configured_user="${ADMIN_USERNAME:-}"
    configured_password="${ADMIN_PASSWORD:-}"
    if [ -n "$configured_user" ]; then
      if ! is_valid_admin_username "$configured_user"; then
        log_error "ADMIN_USERNAME is invalid for non-interactive install."
        exit 1
      fi
      ADMIN_USERNAME_VALUE="$configured_user"
    else
      ADMIN_USERNAME_VALUE="$generated_user"
    fi

    if [ -n "$configured_password" ]; then
      if ! is_valid_admin_password "$configured_password"; then
        log_error "ADMIN_PASSWORD does not satisfy policy for non-interactive install."
        exit 1
      fi
      ADMIN_PASSWORD_VALUE="$configured_password"
      ADMIN_AUTO_GENERATED=false
      ADMIN_FORCE_PASSWORD_CHANGE=false
    else
      ADMIN_PASSWORD_VALUE="$generated_password"
      ADMIN_AUTO_GENERATED=true
      ADMIN_FORCE_PASSWORD_CHANGE=true
    fi
    ADMIN_EMAIL_VALUE="${ADMIN_EMAIL:-}"
    return
  fi

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
    if ! has_prompt_tty; then
      log_error "Interactive admin password prompt is unavailable (no TTY)."
      log_error "Set INSTALL_NONINTERACTIVE=true, or provide ADMIN_PASSWORD env var."
      exit 1
    fi
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

  # Prompt for optional admin email (used for password recovery and email verification)
  local input_email
  input_email=$(trim_space "$(read_tty_input "${CYAN}Admin email address (optional, used for password recovery):${NC} " "")")
  ADMIN_EMAIL_VALUE="$input_email"
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
    local tls_directive=""
    if [ "$USE_CUSTOM_SSL_CERT" = true ]; then
      tls_directive="    tls ${CUSTOM_SSL_CERT_PATH} ${CUSTOM_SSL_KEY_PATH}"
    fi
    cat > "$TARGET_DIR/Caddyfile" <<EOC
{
    email ${SSL_EMAIL}
    grace_period 10s
}

${DOMAIN_NAME} {
${tls_directive}
    reverse_proxy app:3000 {
        header_up X-Real-IP {remote_host}
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
        header_up Host {host}
    }
    encode gzip zstd
}
EOC
    RESOLVED_APP_URL="http://${PUBLIC_IP:-$(get_primary_ipv4)}"
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

sync_preserved_proxy_context() {
  [ "$INSTALL_MODE" = "upgrade" ] || return 0
  [ "$PROXY_CONFIG_ACTION" = "preserve" ] || return 0

  local app_url host
  app_url="$(trim_space "$(env_get APP_URL)")"
  if [ -z "$app_url" ]; then
    app_url="$(infer_origin_from_caddyfile "$TARGET_DIR/Caddyfile" || true)"
  fi
  [ -n "$app_url" ] || return 0

  RESOLVED_APP_URL="$app_url"
  host="${app_url#http://}"
  host="${host#https://}"
  host="${host%%/*}"
  host="${host%%:*}"

  if [[ "$host" =~ ^([a-z0-9-]+\.)+[a-z]{2,}$ ]]; then
    USE_DOMAIN=true
    DOMAIN_NAME="$host"
    return 0
  fi

  if is_valid_ipv4 "$host"; then
    USE_DOMAIN=false
    PUBLIC_IP="$host"
  fi
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
  if [ -f "$TARGET_DIR/runtime/admin-bootstrap-password" ]; then
    mkdir -p "$backup_dir/runtime"
    cp "$TARGET_DIR/runtime/admin-bootstrap-password" "$backup_dir/runtime/admin-bootstrap-password"
  fi

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

    if ! git diff --quiet --ignore-submodules -- || ! git diff --cached --quiet --ignore-submodules --; then
      log_error "Upgrade aborted: tracked local changes detected. Commit/stash them first."
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

seed_reinstall_env_from_backup() {
  [ "$INSTALL_MODE" = "reinstall" ] || return 0
  [ -n "$UPGRADE_BACKUP_DIR" ] || return 0

  local backup_env_file
  backup_env_file="$UPGRADE_BACKUP_DIR/.env"
  [ -f "$backup_env_file" ] || return 0

  declare -A backup_env=()
  while IFS= read -r line || [ -n "$line" ]; do
    if [[ "$line" =~ ^[[:space:]]*# ]] || [[ -z "$(trim_space "$line")" ]]; then
      continue
    fi
    if [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
      backup_env["${line%%=*}"]="${line#*=}"
    fi
  done < "$backup_env_file"

  local key db_keys required_db_keys
  db_keys=(POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB APP_DB_USER APP_DB_PASSWORD APP_DB_SSLMODE DATABASE_URL MIGRATION_DATABASE_URL)
  required_db_keys=(POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB APP_DB_USER APP_DB_PASSWORD)

  for key in "${db_keys[@]}"; do
    if [ -n "${backup_env[$key]-}" ]; then
      env_set_explicit "$key" "${backup_env[$key]}"
    fi
  done

  local all_required_present=true
  for key in "${required_db_keys[@]}"; do
    if [ -z "${backup_env[$key]-}" ]; then
      all_required_present=false
      break
    fi
  done
  if [ "$all_required_present" = true ]; then
    REINSTALL_DB_ENV_RESTORED=true
  fi

  local admin_keys
  admin_keys=(ADMIN_USERNAME ADMIN_BOOTSTRAP_PASSWORD_FILE ADMIN_BOOTSTRAP_STRICT ADMIN_BOOTSTRAP_FORCE_PASSWORD_CHANGE ADMIN_BOOTSTRAP_RESET_EXISTING)
  for key in "${admin_keys[@]}"; do
    if [ -n "${backup_env[$key]-}" ]; then
      env_set_explicit "$key" "${backup_env[$key]}"
      REINSTALL_ENV_REUSED=true
    fi
  done

  if [ "$REINSTALL_DB_ENV_RESTORED" = true ]; then
    REINSTALL_ENV_REUSED=true
    log_info "Reinstall mode: reusing preserved database credentials from backup .env."
  else
    log_warn "Reinstall mode: backup .env is missing one or more required database credentials."
  fi
}

restore_reinstall_admin_secret() {
  [ "$INSTALL_MODE" = "reinstall" ] || return 0
  [ -n "$UPGRADE_BACKUP_DIR" ] || return 0

  local source_secret target_secret
  source_secret="$UPGRADE_BACKUP_DIR/runtime/admin-bootstrap-password"
  target_secret="$TARGET_DIR/runtime/admin-bootstrap-password"
  [ -f "$source_secret" ] || return 0

  mkdir -p "$TARGET_DIR/runtime"
  cp "$source_secret" "$target_secret"
  ensure_container_secret_permissions "$target_secret"
  REINSTALL_ADMIN_SECRET_RESTORED=true
  log_info "Reinstall mode: restored preserved runtime admin bootstrap secret."
}

guard_reinstall_db_state() {
  [ "$INSTALL_MODE" = "reinstall" ] || return 0

  if ! postgres_volume_exists; then
    return 0
  fi

  if [ "$REINSTALL_DB_ENV_RESTORED" = true ]; then
    return 0
  fi

  log_error "Reinstall refused: persistent PostgreSQL volume '$(postgres_named_volume)' exists, but compatible credentials were not restored from backup .env."
  log_error "Action required: restore the previous .env (with POSTGRES_USER/POSTGRES_PASSWORD/APP_DB_USER/APP_DB_PASSWORD) into ${UPGRADE_BACKUP_DIR:-<backup-dir>}/.env, or use upgrade mode."
  exit 1
}

configure_runtime_env() {
  log_step "Runtime environment"

  declare -gA EXISTING_ENV=()
  declare -gA ENV_UPDATES=()

  local env_file="$TARGET_DIR/.env"
  load_env_file "$env_file"
  seed_reinstall_env_from_backup
  restore_reinstall_admin_secret
  guard_reinstall_db_state

  local should_prompt_admin=false
  if [ "$INSTALL_MODE" = "fresh" ]; then
    should_prompt_admin=true
  elif [ "$INSTALL_MODE" = "reinstall" ] && ! postgres_volume_exists; then
    should_prompt_admin=true
  fi

  if [ "$should_prompt_admin" = true ]; then
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
    ip_origin="http://${PUBLIC_IP:-$(get_primary_ipv4)}"

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
    local bootstrap_admin_username
    bootstrap_admin_username="${ADMIN_USERNAME_VALUE:-$(env_get ADMIN_USERNAME)}"
    if [ -z "$bootstrap_admin_username" ]; then
      log_error "ADMIN_USERNAME is missing for ${INSTALL_MODE} mode."
      exit 1
    fi
    env_set_if_missing "ADMIN_USERNAME" "$bootstrap_admin_username"
    # Persist admin email if provided
    if [ -n "${ADMIN_EMAIL_VALUE:-}" ]; then
      env_set_if_missing "ADMIN_EMAIL" "$ADMIN_EMAIL_VALUE"
    fi
    local bootstrap_password_file_host="$TARGET_DIR/runtime/admin-bootstrap-password"
    mkdir -p "$TARGET_DIR/runtime"
    if [ ! -f "$bootstrap_password_file_host" ]; then
      if [ -z "${ADMIN_PASSWORD_VALUE:-}" ]; then
        log_error "Missing admin bootstrap password for reinstall. Restore runtime/admin-bootstrap-password from backup or reinstall without persistent state."
        exit 1
      fi
      printf '%s\n' "$ADMIN_PASSWORD_VALUE" > "$bootstrap_password_file_host"
      ensure_container_secret_permissions "$bootstrap_password_file_host"
    fi
    ensure_container_secret_permissions "$bootstrap_password_file_host"
    env_set_if_missing "ADMIN_BOOTSTRAP_PASSWORD_FILE" "/run/secrets/admin-bootstrap-password"
    if [ "$INSTALL_MODE" = "reinstall" ] && postgres_volume_exists; then
      env_set_if_missing "ADMIN_BOOTSTRAP_STRICT" "false"
      env_set_if_missing "ADMIN_BOOTSTRAP_FORCE_PASSWORD_CHANGE" "false"
      env_set_if_missing "ADMIN_BOOTSTRAP_RESET_EXISTING" "false"
    else
      env_set_if_missing "ADMIN_BOOTSTRAP_STRICT" "true"
      if [ "$ADMIN_FORCE_PASSWORD_CHANGE" = true ]; then
        env_set_if_missing "ADMIN_BOOTSTRAP_FORCE_PASSWORD_CHANGE" "true"
      else
        env_set_if_missing "ADMIN_BOOTSTRAP_FORCE_PASSWORD_CHANGE" "false"
      fi
      env_set_if_missing "ADMIN_BOOTSTRAP_RESET_EXISTING" "false"
    fi
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
SELECT
  CASE
    WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_db_user') THEN
      format('ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT', :'app_db_user', :'app_db_password')
    ELSE
      format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT', :'app_db_user', :'app_db_password')
  END AS sql
\gexec
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
    COMPOSE_BAKE=false docker compose build app
  )

  (
    cd "$TARGET_DIR"
    if ! docker compose up -d app; then
      log_error "Failed to start app service."
      print_failure_diagnostics
      exit 1
    fi
  )

  if ! wait_for_container_health "app" 300; then
    print_failure_diagnostics
    exit 1
  fi

  (
    cd "$TARGET_DIR"
    if ! docker compose up -d caddy; then
      log_error "Failed to start caddy service."
      print_failure_diagnostics
      exit 1
    fi
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

wait_for_http_status_with_host_override() {
  local domain="$1"
  local timeout="${2:-300}"
  local elapsed=0
  local status=""

  while [ "$elapsed" -lt "$timeout" ]; do
    status="$(curl -sS --max-time 12 --resolve "${domain}:443:127.0.0.1" -o /dev/null -w '%{http_code}' "https://${domain}/api/health/live" || true)"
    case "$status" in
      200|301|302|307|308)
        printf '%s' "$status"
        return 0
        ;;
    esac
    sleep 5
    elapsed=$((elapsed + 5))
  done

  printf '%s' "${status:-none}"
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

  if [ "$USE_DOMAIN" = true ]; then
    local http_status https_status
    http_status="$(curl -sS --max-time 8 --resolve "${DOMAIN_NAME}:80:127.0.0.1" -o /dev/null -w '%{http_code}' "http://${DOMAIN_NAME}/api/health/live" || true)"
    case "$http_status" in
      200|301|302|307|308)
        log_success "Local Caddy domain routing probe passed via Host=${DOMAIN_NAME} (HTTP status ${http_status})."
        ;;
      *)
        log_error "Local Caddy domain routing probe failed for host ${DOMAIN_NAME} (status: ${http_status:-none})."
        print_failure_diagnostics
        exit 1
        ;;
    esac
    log_info "Waiting for Caddy TLS certificate provisioning for ${DOMAIN_NAME} (up to 10 minutes)."
    if https_status="$(wait_for_http_status_with_host_override "$DOMAIN_NAME" 600)"; then
      LOCAL_PROXY_HEALTH_VALIDATED=true
      log_success "Local Caddy TLS probe passed via Host=${DOMAIN_NAME} (HTTPS status ${https_status})."
    else
      log_error "Local Caddy TLS probe failed for host ${DOMAIN_NAME} after waiting (last status: ${https_status:-none})."
      log_error "Check DNS A/AAAA records for ${DOMAIN_NAME}, ensure ports 80/443 are reachable, then inspect Caddy logs for ACME/TLS issues."
      print_failure_diagnostics
      exit 1
    fi
  else
    if curl -fsS --max-time 8 "http://127.0.0.1/api/health/live" >/dev/null 2>&1; then
      LOCAL_PROXY_HEALTH_VALIDATED=true
      log_success "Local Caddy HTTP routing probe passed."
    else
      log_error "Local Caddy HTTP routing probe failed (http://127.0.0.1/api/health/live)."
      print_failure_diagnostics
      exit 1
    fi
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
  local summary_admin_username
  local summary_db_host summary_db_port summary_db_name summary_db_app_user summary_db_admin_user
  summary_admin_username="${ADMIN_USERNAME_VALUE:-$(env_get ADMIN_USERNAME)}"
  summary_db_host="db"
  summary_db_port="5432"
  summary_db_name="$(env_get APP_DB_NAME)"
  summary_db_app_user="$(env_get APP_DB_USER)"
  summary_db_admin_user="$(env_get POSTGRES_USER)"
  [ -n "$summary_db_name" ] || summary_db_name="$(env_get POSTGRES_DB)"
  [ -n "$summary_db_app_user" ] || summary_db_app_user="$(env_get POSTGRES_USER)"

  echo "Mode: $INSTALL_MODE"
  echo "Source ref: ${INSTALL_REF_RESOLVED:-unknown} (${INSTALL_REF_TYPE:-unknown})"
  echo "App URL: ${RESOLVED_APP_URL}"
  echo "Project dir: $TARGET_DIR"
  echo "Config policy: preserve .env/Caddyfile/operator overrides by default; regenerate only when explicitly selected."
  if [ -n "$ADMIN_CREATED_FILE" ]; then
    echo "Bootstrap admin credentials saved to: $ADMIN_CREATED_FILE"
  fi
  if [ -n "$summary_admin_username" ]; then
    echo "Admin login username: ${summary_admin_username}"
  fi
  if [ "$ADMIN_AUTO_GENERATED" = true ] && [ -n "${ADMIN_PASSWORD_VALUE:-}" ]; then
    echo "Admin login password: ${ADMIN_PASSWORD_VALUE}"
  elif [ "$INSTALL_MODE" = "fresh" ] && [ "$ADMIN_AUTO_GENERATED" != true ]; then
    echo "Admin login password: entered interactively (not printed)."
  fi
  if [ "$INSTALL_MODE" = "upgrade" ]; then
    echo "Admin bootstrap env vars are create-only by default and do not overwrite an existing admin user."
    echo "To reset an existing admin via env, set ADMIN_BOOTSTRAP_RESET_EXISTING=true for a one-time reset."
  fi
  if [ "$INSTALL_MODE" = "reinstall" ] && [ "$REINSTALL_ENV_REUSED" = true ]; then
    echo "Reinstall reused preserved .env credentials/settings from installer backup."
  fi
  if [ "$INSTALL_MODE" = "reinstall" ] && [ "$REINSTALL_ADMIN_SECRET_RESTORED" = true ]; then
    echo "Reinstall restored runtime/admin-bootstrap-password from installer backup."
  fi
  if [ "$USE_DOMAIN" = true ] && [ "$USE_CUSTOM_SSL_CERT" = true ]; then
    echo "TLS mode: using operator-provided certificate/key stored under $TARGET_DIR/certs."
  elif [ "$USE_DOMAIN" = true ]; then
    echo "TLS mode: automatic certificate issuance/renewal via Caddy."
  fi
  if [ "$USE_DOMAIN" = true ]; then
    local summary_ipv4 summary_ipv6
    summary_ipv4="$(get_primary_ipv4)"
    summary_ipv6="$(get_primary_ipv6)"
    echo "Server IPv4: ${summary_ipv4}"
    if [ -n "$summary_ipv6" ]; then
      echo "Server IPv6: ${summary_ipv6}"
    fi
    echo "DNS guidance: set domain A record to IPv4 and AAAA record to IPv6 (if available)."
  fi
  if [ "$CADDY_RUNTIME_VALIDATED" = true ]; then
    echo "Caddy runtime config validated inside container."
  fi
  if [ "$LOCAL_PROXY_HEALTH_VALIDATED" = true ]; then
    echo "Local reverse-proxy route validated via http://127.0.0.1/api/health/live."
  fi
  echo "Database host (internal Docker network): ${summary_db_host}"
  echo "Database port (internal Docker network): ${summary_db_port}"
  if [ -n "$summary_db_name" ]; then
    echo "Database name: ${summary_db_name}"
  fi
  if [ -n "$summary_db_app_user" ]; then
    echo "Database app user: ${summary_db_app_user}"
  fi
  if [ -n "$summary_db_admin_user" ]; then
    echo "Database admin user: ${summary_db_admin_user}"
  fi
  echo "Rotate bootstrap/admin/database secrets after initial verification per policy."
  echo "PostgreSQL remains internal to Docker network by default (no host 5432 publish)."
  echo "Firewall (UFW) is operator-managed and was not auto-enabled by installer."
  echo "Caddy handles TLS renewals internally; no extra cron entry was installed."
}


main() {
  local os_name
  os_name="$(uname -s)"
  if [ "$os_name" != "Linux" ]; then
    log_error "Linux is required."
    exit 1
  fi

  log_info "Detected operating system: $os_name"
  check_supported_architecture
  require_root "$@"
  ensure_system_up_to_date
  if is_true "$INSTALL_NONINTERACTIVE"; then
    NONINTERACTIVE=true
  elif ! has_prompt_tty; then
    NONINTERACTIVE=true
  fi
  if [ "$NONINTERACTIVE" = true ]; then
    log_info "Installer running in non-interactive mode."
  fi
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
  persist_custom_ssl_certificates
  configure_caddyfile
  configure_runtime_env
  sync_preserved_proxy_context
  configure_npmrc
  validate_caddy_config
  launch_services
  verify_post_launch_health
  print_summary
}

trap 'on_error $LINENO "${BASH_COMMAND:-unknown}"' ERR
main "$@"
