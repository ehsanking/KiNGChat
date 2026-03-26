#!/bin/bash
# ╔══════════════════════════════════════════════════════════════════╗
# ║          KiNGChat Professional Installer v2.5                   ║
# ║        The Secure Messenger for the Private Era                 ║
# ║   Designed for Resilience, Speed & Global Connectivity          ║
# ╚══════════════════════════════════════════════════════════════════╝

# Exit on unhandled errors, but we handle docker build failures manually
set -euo pipefail

# --- Configuration ---
REPO_URL="https://github.com/ehsanking/KiNGChat.git"
TARGET_DIR="KiNGChat"
MIN_RAM_MB=1024
CADDY_RENEWAL_CRON="0 3 1 * *"   # 1st of each month at 3am

# --- Colors & UI ---
GOLD='\033[1;33m'
BLUE='\033[1;34m'
RED='\033[1;31m'
GREEN='\033[1;32m'
CYAN='\033[1;36m'
PURPLE='\033[1;35m'
WHITE='\033[1;37m'
NC='\033[0m'

# --- Helper Functions ---
print_header() {
    if [ -t 1 ] && command_exists clear; then
        clear || true
    fi
    echo -e "${GOLD}"
    echo "  ██╗  ██╗██╗███╗   ██╗ ██████╗  ██████╗██╗  ██╗ █████╗ ████████╗"
    echo "  ██║ ██╔╝██║████╗  ██║██╔════╝ ██╔════╝██║  ██║██╔══██╗╚══██╔══╝"
    echo "  █████╔╝ ██║██╔██╗ ██║██║  ███╗██║     ███████║███████║   ██║   "
    echo "  ██╔═██╗ ██║██║╚██╗██║██║   ██║██║     ██╔══██║██╔══██║   ██║   "
    echo "  ██║  ██╗██║██║ ╚████║╚██████╔╝╚██████╗██║  ██║██║  ██║   ██║   "
    echo "  ╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   "
    echo -e "             ${CYAN}The Secure Messenger for the Private Era${NC}"
    echo -e "${GOLD}================================================================${NC}"
    echo -e "${WHITE}  Installer v2.5 — DNS Control | Auto-SSL | Smart Skip         ${NC}"
    echo -e "${GOLD}================================================================${NC}"
    echo ""
}

log_info()    { echo -e "${BLUE}[INFO]${NC}    $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn()    { echo -e "${GOLD}[WARN]${NC}    $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC}   $1"; }
log_step()    { echo -e "\n${PURPLE}━━━ $1 ━━━${NC}"; }

command_exists() {
    command -v "$1" >/dev/null 2>&1
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

get_sudo() {
    if command -v sudo &>/dev/null; then echo "sudo"; else echo ""; fi
}

run_apt() {
    if ! command -v apt-get &>/dev/null; then return 1; fi
    local S; S=$(get_sudo)
    if [ -n "$S" ]; then $S apt-get "$@"; else apt-get "$@"; fi
}

# ──────────────────────────────────────────────
#  SECTION 0 — DNS Selection Menu
# ──────────────────────────────────────────────
select_dns() {
    log_step "DNS Configuration"
    echo -e "${CYAN}Please select your preferred DNS provider:${NC}"
    echo ""
    echo -e "  ${WHITE}1)${NC} ${GREEN}System Default${NC}     — Use current system DNS (no change)"
    echo -e "  ${WHITE}2)${NC} ${GREEN}Google DNS${NC}         — 8.8.8.8 / 8.8.4.4"
    echo -e "  ${WHITE}3)${NC} ${GREEN}Cloudflare DNS${NC}     — 1.1.1.1 / 1.0.0.1"
    echo -e "  ${WHITE}4)${NC} ${GREEN}Yandex DNS${NC}         — 77.88.8.8 / 77.88.8.1"
    echo -e "  ${WHITE}5)${NC} ${GREEN}Alibaba DNS${NC}        — 223.5.5.5 / 223.6.6.6"
    echo -e "  ${WHITE}6)${NC} ${GREEN}Manual DNS${NC}         — Enter your own DNS servers"
    echo ""

    local choice
    choice=$(read_tty_input "${GOLD}Enter choice [1-6]:${NC} " "1")

    case "$choice" in
        1)
            log_info "Keeping system default DNS."
            DNS_CHOICE="default"
            ;;
        2)
            DNS_PRIMARY="8.8.8.8"
            DNS_SECONDARY="8.8.4.4"
            DNS_CHOICE="google"
            ;;
        3)
            DNS_PRIMARY="1.1.1.1"
            DNS_SECONDARY="1.0.0.1"
            DNS_CHOICE="cloudflare"
            ;;
        4)
            DNS_PRIMARY="77.88.8.8"
            DNS_SECONDARY="77.88.8.1"
            DNS_CHOICE="yandex"
            ;;
        5)
            DNS_PRIMARY="223.5.5.5"
            DNS_SECONDARY="223.6.6.6"
            DNS_CHOICE="alibaba"
            ;;
        6)
            DNS_PRIMARY=$(read_tty_input "${CYAN}Primary DNS:${NC} " "")
            DNS_SECONDARY=$(read_tty_input "${CYAN}Secondary DNS (optional):${NC} " "")
            if [ -z "$DNS_PRIMARY" ]; then
                log_warn "No primary DNS entered. Keeping system default."
                DNS_CHOICE="default"
            else
                DNS_CHOICE="manual"
            fi
            ;;
        *)
            log_warn "Invalid choice. Keeping system default DNS."
            DNS_CHOICE="default"
            ;;
    esac

    apply_dns
}

write_root_file() {
    local target_path="$1"
    local content="$2"
    local S; S=$(get_sudo)

    if [ -w "$target_path" ]; then
        printf "%s\n" "$content" > "$target_path"
        return $?
    fi

    if [ -n "$S" ]; then
        printf "%s\n" "$content" | $S tee "$target_path" >/dev/null
        return $?
    fi

    return 1
}

apply_dns() {
    if [ "$DNS_CHOICE" = "default" ]; then
        log_info "No DNS changes applied."
        return
    fi

    local RESOLV_CONF_CONTENT
    RESOLV_CONF_CONTENT="# KiNGChat DNS — ${DNS_CHOICE}"
    [ -n "$DNS_PRIMARY" ] && RESOLV_CONF_CONTENT="${RESOLV_CONF_CONTENT}\nnameserver $DNS_PRIMARY"
    [ -n "$DNS_SECONDARY" ] && RESOLV_CONF_CONTENT="${RESOLV_CONF_CONTENT}\nnameserver $DNS_SECONDARY"

    local S; S=$(get_sudo)
    if [ -w "/etc/resolv.conf" ]; then
        cp /etc/resolv.conf /etc/resolv.conf.bak.kingchat 2>/dev/null || true
    elif [ -n "$S" ]; then
        $S cp /etc/resolv.conf /etc/resolv.conf.bak.kingchat 2>/dev/null || true
    fi

    if write_root_file "/etc/resolv.conf" "$(printf '%b' "$RESOLV_CONF_CONTENT")"; then
        log_success "DNS set to ${DNS_CHOICE} (${DNS_PRIMARY}${DNS_SECONDARY:+ / $DNS_SECONDARY})."
    else
        log_warn "Could not write DNS settings to /etc/resolv.conf. Skipping system DNS change."
        return
    fi

    # Also write to Docker daemon
    configure_docker_dns
}

configure_docker_dns() {
    local S; S=$(get_sudo)
    local DOCKER_DIR="/etc/docker"
    local DAEMON_JSON="${DOCKER_DIR}/daemon.json"

    if [ ! -d "$DOCKER_DIR" ]; then
        if [ -n "$S" ]; then
            $S mkdir -p "$DOCKER_DIR" || { log_warn "Could not create ${DOCKER_DIR}. Skipping Docker DNS configuration."; return; }
        else
            mkdir -p "$DOCKER_DIR" 2>/dev/null || { log_warn "Cannot create ${DOCKER_DIR} without elevated permissions. Skipping Docker DNS configuration."; return; }
        fi
    fi

    if [ ! -w "$DOCKER_DIR" ] && [ -z "$S" ]; then
        log_warn "Cannot configure Docker DNS — insufficient permissions."
        return
    fi

    # Build dns array
    local DNS_ARRAY=""
    [ -n "$DNS_PRIMARY" ]   && DNS_ARRAY="\"$DNS_PRIMARY\""
    [ -n "$DNS_SECONDARY" ] && DNS_ARRAY="${DNS_ARRAY}, \"$DNS_SECONDARY\""

    # Backup existing config
    if [ -f "$DAEMON_JSON" ]; then
        if [ -n "$S" ]; then
            $S cp "$DAEMON_JSON" "${DAEMON_JSON}.bak" || true
        else
            cp "$DAEMON_JSON" "${DAEMON_JSON}.bak" || true
        fi
    fi

    local DAEMON_JSON_CONTENT
    DAEMON_JSON_CONTENT=$(cat <<EOF
{
  "registry-mirrors": [
    "https://docker.iranserver.com",
    "https://mirror.gcr.io",
    "https://docker.arvancloud.ir",
    "https://public.ecr.aws"
  ],
  "dns": [$DNS_ARRAY]
}
EOF
)

    if ! write_root_file "$DAEMON_JSON" "$DAEMON_JSON_CONTENT"; then
        log_warn "Failed to write ${DAEMON_JSON}. Docker DNS configuration skipped."
        return
    fi

    log_success "Docker daemon DNS configured."

    log_info "Restarting Docker service..."
    if command -v systemctl &>/dev/null && systemctl is-active --quiet docker 2>/dev/null; then
        local RESTART_CMD="systemctl restart docker"
        [ -n "$S" ] && RESTART_CMD="$S $RESTART_CMD"
        if eval "$RESTART_CMD" 2>/dev/null; then
            log_success "Docker service restarted."
        else
            log_warn "Could not restart Docker automatically. Please run: sudo systemctl restart docker"
        fi
    fi
}

# ──────────────────────────────────────────────
#  SECTION 1 — Dependency Management (Smart Skip)
# ──────────────────────────────────────────────
is_installed() {
    command -v "$1" &>/dev/null
}

is_docker_compose_available() {
    docker compose version &>/dev/null 2>&1
}

install_docker() {
    log_info "Installing Docker via official script..."
    local S; S=$(get_sudo)
    if [ -n "$S" ]; then
        curl -fsSL https://get.docker.com | $S sh
    else
        curl -fsSL https://get.docker.com | sh
    fi

    if is_installed "docker"; then
        log_success "Docker installed successfully."
        return 0
    fi

    log_error "Automatic Docker installation failed."
    echo -e "${CYAN}Tip (Iran users): curl -fsSL https://raw.githubusercontent.com/manageitir/docker/main/install-ubuntu.sh | sh${NC}"
    return 1
}

ensure_dependency() {
    local pkg="$1"
    local install_cmd="${2:-}"

    if is_installed "$pkg"; then
        log_success "Package '${pkg}' already installed — skipping."
        return 0
    fi

    log_info "Installing '${pkg}'..."
    if [ -n "$install_cmd" ]; then
        eval "$install_cmd"
    else
        run_apt update -qq && run_apt install -y "$pkg" -qq
    fi
    log_success "Package '${pkg}' installed."
}

preflight_checks() {
    log_step "Preflight Validation"

    local FREE_DISK_MB
    FREE_DISK_MB=$(df -Pm . | awk 'NR==2 {print $4}')
    if [ "${FREE_DISK_MB:-0}" -lt 3072 ]; then
        log_warn "Available disk space is below 3GB. Docker image build may fail."
    else
        log_success "Disk space check passed (${FREE_DISK_MB}MB free)."
    fi

    if command -v free &>/dev/null; then
        local TOTAL_RAM_MB
        TOTAL_RAM_MB=$(free -m | awk '/^Mem:/{print $2}')
        if [ "${TOTAL_RAM_MB:-0}" -lt "$MIN_RAM_MB" ]; then
            log_warn "Available RAM is below recommended threshold (${TOTAL_RAM_MB}MB detected)."
        else
            log_success "RAM check passed (${TOTAL_RAM_MB}MB detected)."
        fi
    fi

    for port in 80 443 3000; do
        if ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "(^|:)$port$"; then
            log_warn "Port $port is already in use. Stop conflicting services before continuing."
        fi
    done
}

configure_secure_env() {
    log_step "Runtime Environment Configuration"

    local APP_BASE_URL ALLOWED_ORIGINS_VALUE JWT_SECRET_VALUE ENCRYPTION_KEY_VALUE ADMIN_PASSWORD_VALUE EXISTING_ADMIN_PASSWORD

    if [ "$USE_DOMAIN" = true ] && [ -n "${DOMAIN_NAME:-}" ]; then
        APP_BASE_URL="https://${DOMAIN_NAME}"
        ALLOWED_ORIGINS_VALUE="https://${DOMAIN_NAME},https://www.${DOMAIN_NAME}"
    else
        local SERVER_IP
        SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
        [ -z "$SERVER_IP" ] && SERVER_IP="127.0.0.1"
        APP_BASE_URL="http://${SERVER_IP}:3000"
        ALLOWED_ORIGINS_VALUE="http://${SERVER_IP}:3000,http://localhost:3000,http://127.0.0.1:3000"
    fi

    JWT_SECRET_VALUE=$(openssl rand -hex 32)
    ENCRYPTION_KEY_VALUE=$(openssl rand -hex 16)

    if [ -f "${TARGET_DIR}/.env" ]; then
        EXISTING_ADMIN_PASSWORD=$(grep -E '^ADMIN_PASSWORD=' "${TARGET_DIR}/.env" | tail -n1 | cut -d '=' -f2- || true)
    else
        EXISTING_ADMIN_PASSWORD=""
    fi

    if [ -n "${EXISTING_ADMIN_PASSWORD:-}" ]; then
        ADMIN_PASSWORD_VALUE="$EXISTING_ADMIN_PASSWORD"
        log_info "Existing admin password detected in .env. Keeping current admin password."
    else
        ADMIN_PASSWORD_VALUE=$(openssl rand -base64 24 | tr -d '\n' | tr '/+' 'AB' | cut -c1-24)
        log_info "No existing admin password found. A new one was generated."
    fi

    cat > "${TARGET_DIR}/.env" <<EOF
POSTGRES_USER=user
POSTGRES_PASSWORD=pass
POSTGRES_DB=kingchat
DATABASE_URL=postgresql://user:pass@db:5432/kingchat
PRISMA_CONNECTION_LIMIT=10
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=admin
MINIO_SECRET_KEY=supersecret
APP_URL=${APP_BASE_URL}
ALLOWED_ORIGINS=${ALLOWED_ORIGINS_VALUE}
LOG_LEVEL=info
NODE_ENV=production
PORT=3000
JWT_SECRET=${JWT_SECRET_VALUE}
ENCRYPTION_KEY=${ENCRYPTION_KEY_VALUE}
ADMIN_USERNAME=admin
ADMIN_PASSWORD=${ADMIN_PASSWORD_VALUE}
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
SOCKET_RATE_LIMIT_WINDOW_MS=10000
SOCKET_RATE_LIMIT_MAX=30
QUEUE_CONCURRENCY=5
EOF

    if command -v chmod >/dev/null 2>&1; then
        chmod 600 "${TARGET_DIR}/.env" 2>/dev/null || true
    fi
    ADMIN_PASSWORD_GENERATED="$ADMIN_PASSWORD_VALUE"
    RESOLVED_APP_URL="$APP_BASE_URL"
    log_success "Secure runtime .env generated."
}

check_all_dependencies() {
    log_step "Checking System Dependencies"

    ensure_dependency "git"
    ensure_dependency "curl"
    ensure_dependency "openssl"

    if ! is_installed "docker"; then
        install_docker
    else
        log_success "Package 'docker' already installed — skipping."
    fi

    if ! is_docker_compose_available; then
        log_info "Installing Docker Compose plugin..."
        run_apt update -qq && run_apt install -y docker-compose-plugin -qq
        log_success "Docker Compose plugin installed."
    else
        log_success "Docker Compose plugin already available — skipping."
    fi

    # certbot — for standalone SSL fallback
    if ! is_installed "certbot"; then
        log_info "Installing certbot (for SSL fallback)..."
        run_apt update -qq && run_apt install -y certbot -qq 2>/dev/null && \
            log_success "Certbot installed." || \
            log_warn "Certbot installation failed — will rely on Caddy for SSL."
    else
        log_success "Package 'certbot' already installed — skipping."
    fi
}

# ──────────────────────────────────────────────
#  SECTION 2 — Domain & SSL Setup
#  Phase A: Collect input only (no file writes yet)
#  Phase B: Write Caddyfile after source is synced
# ──────────────────────────────────────────────

# Phase A — ask questions, store in globals
collect_domain_ssl_input() {
    log_step "Domain & SSL Configuration"

    echo -e "${CYAN}Would you like to configure a custom domain with automatic HTTPS/SSL?${NC}"
    echo -e "  ${WHITE}1)${NC} Yes — enter my domain name"
    echo -e "  ${WHITE}2)${NC} No  — use IP address only (HTTP only)"
    echo ""

    local choice
    choice=$(read_tty_input "${GOLD}Enter choice [1-2]:${NC} " "2")

    if [ "$choice" = "1" ]; then
        DOMAIN_NAME=$(read_tty_input "${CYAN}Enter your domain (e.g. chat.example.com):${NC} " "")
        DOMAIN_NAME="${DOMAIN_NAME#http://}"
        DOMAIN_NAME="${DOMAIN_NAME#https://}"
        DOMAIN_NAME="${DOMAIN_NAME%%/*}"
        DOMAIN_NAME="${DOMAIN_NAME,,}"

        if [ -z "$DOMAIN_NAME" ]; then
            log_warn "No domain entered. Falling back to IP-only mode."
            USE_DOMAIN=false
        elif ! [[ "$DOMAIN_NAME" =~ ^([a-z0-9-]+\.)+[a-z]{2,}$ ]]; then
            log_warn "Invalid domain format '${DOMAIN_NAME}'. Falling back to IP-only mode."
            USE_DOMAIN=false
        else
            SSL_EMAIL=$(read_tty_input "${CYAN}Enter your email for SSL notifications:${NC} " "admin@${DOMAIN_NAME}")
            [ -z "$SSL_EMAIL" ] && SSL_EMAIL="admin@${DOMAIN_NAME}"
            if ! [[ "$SSL_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; then
                log_warn "Invalid email format '${SSL_EMAIL}'. Using admin@${DOMAIN_NAME}."
                SSL_EMAIL="admin@${DOMAIN_NAME}"
            fi
            log_success "Domain set to: ${DOMAIN_NAME} (SSL email: ${SSL_EMAIL})"
            USE_DOMAIN=true
        fi
    else
        log_info "Skipping domain configuration. App will be available via IP on port 3000."
        USE_DOMAIN=false
    fi
}

# Phase B — write Caddyfile after TARGET_DIR exists
apply_domain_ssl_config() {
    if [ "$USE_DOMAIN" = true ] && [ -n "$DOMAIN_NAME" ]; then
        generate_caddyfile_with_ssl
        setup_ssl_auto_renewal
    else
        generate_caddyfile_ip_only
    fi
}

generate_caddyfile_with_ssl() {
    log_info "Generating Caddyfile with automatic HTTPS for ${DOMAIN_NAME}..."
    cat > "${TARGET_DIR}/Caddyfile" <<EOF
# KiNGChat Caddyfile — Auto-SSL via Let's Encrypt
# Generated by KiNGChat Installer v2.5
# NOTE: Do NOT add a log { ... } block — Caddy will fail if the log path
#       does not exist inside the container, causing SSL_ERROR_INTERNAL_ERROR_ALERT.

{
    # Global options
    email ${SSL_EMAIL}
    # Grace period for ACME challenges
    grace_period 10s
}

${DOMAIN_NAME} {
    # Caddy automatically obtains and renews SSL from Let's Encrypt
    tls ${SSL_EMAIL}

    reverse_proxy app:3000 {
        # WebSocket support (required for Socket.IO real-time messaging)
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up Connection {>Connection}
        header_up Upgrade {>Upgrade}
        header_up Host {host}

        # Flush immediately for Server-Sent Events / streaming
        flush_interval -1

        # Health-aware load balancing
        transport http {
            keepalive 30s
            keepalive_idle_conns 10
        }

        # Retry on connection failures
        lb_try_duration 5s
        fail_duration 10s
    }

    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        X-XSS-Protection "1; mode=block"
        Referrer-Policy strict-origin-when-cross-origin
        Permissions-Policy "camera=(), microphone=(), geolocation=()"
        -Server
    }

    encode gzip zstd
}

# Redirect www to non-www
www.${DOMAIN_NAME} {
    redir https://${DOMAIN_NAME}{uri} permanent
}
EOF
    log_success "Caddyfile generated with SSL for ${DOMAIN_NAME}."
}

generate_caddyfile_ip_only() {
    log_info "Generating Caddyfile for IP-only mode..."
    cat > "${TARGET_DIR}/Caddyfile" <<EOF
# KiNGChat Caddyfile — IP-only mode
# Generated by KiNGChat Installer v2.5
# NOTE: Do NOT add a log { ... } block with custom paths.

{
    # Disable automatic HTTPS in IP-only mode
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

        lb_try_duration 5s
        fail_duration 10s
    }
    encode gzip zstd
}
EOF
    log_success "Caddyfile generated for IP-only mode."
}

setup_ssl_auto_renewal() {
    log_info "Configuring automatic SSL certificate renewal (monthly)..."

    # Caddy auto-renews automatically. We add a cron job to force-reload monthly as extra safety.
    local CRON_CMD="0 3 1 * * docker exec \$(docker ps -q -f name=kingchat-caddy) caddy reload --config /etc/caddy/Caddyfile 2>/dev/null || true"
    local CRON_COMMENT="# KiNGChat — monthly SSL reload"

    # Write to /etc/cron.d for system-wide cron
    local S; S=$(get_sudo)
    local CRON_FILE="/etc/cron.d/kingchat-ssl"

    if [ -n "$S" ]; then
        echo -e "${CRON_COMMENT}\n${CRON_CMD}" | $S tee "$CRON_FILE" > /dev/null
        $S chmod 644 "$CRON_FILE"
        log_success "Monthly SSL auto-renewal cron job installed at ${CRON_FILE}."
    else
        # Fallback: add to root crontab
        ( crontab -l 2>/dev/null | grep -v "KiNGChat — monthly SSL"; echo "${CRON_COMMENT}"; echo "${CRON_CMD}" ) | crontab -
        log_success "Monthly SSL auto-renewal added to crontab."
    fi

    log_info "Note: Caddy automatically renews certificates. This cron is an extra safety net."
}

# ──────────────────────────────────────────────
#  SECTION 3 — Source Synchronization
# ──────────────────────────────────────────────
sync_source() {
    log_step "Source Synchronization"

    # Handle existing directory
    if [ -d "$TARGET_DIR" ]; then
        log_warn "Directory '${TARGET_DIR}' already exists."
        echo -e "  ${WHITE}1)${NC} Overwrite (remove and reinstall)"
        echo -e "  ${WHITE}2)${NC} Update in-place (git pull / archive)"
        echo -e "  ${WHITE}3)${NC} Abort"
        echo ""
        local choice
        choice=$(read_tty_input "${GOLD}Enter choice [1-3]:${NC} " "3")

        case "$choice" in
            1)
                log_info "Removing existing directory..."
                rm -rf "$TARGET_DIR"
                mkdir -p "$TARGET_DIR"
                ;;
            2)
                log_info "Updating existing installation..."
                cd "$TARGET_DIR"
                if [ -d ".git" ]; then
                    git pull origin main 2>/dev/null && log_success "Updated via git pull." && return 0
                fi
                cd ..
                rm -rf "$TARGET_DIR"
                mkdir -p "$TARGET_DIR"
                ;;
            *)
                log_info "Aborting to protect existing data."
                exit 0
                ;;
        esac
    else
        mkdir -p "$TARGET_DIR"
    fi

    cd "$TARGET_DIR"

    local SUCCESS=false

    # Strategy A: Archive via CURL (primary for restricted networks)
    log_info "Attempting Strategy A: Resilient Archive Stream (CURL)..."
    TARBALL_URL="https://github.com/ehsanking/KiNGChat/archive/refs/heads/main.tar.gz"
    if curl -L --retry 5 --retry-delay 5 --connect-timeout 30 -k "$TARBALL_URL" | tar -xz --strip-components=1 2>/dev/null; then
        SUCCESS=true
        log_success "Source synchronized via Archive Stream."
    else
        log_warn "Strategy A failed. Trying Strategy B (Git)..."
    fi

    # Strategy B: Git Clone (fallback)
    if [ "$SUCCESS" = false ]; then
        log_info "Attempting Strategy B: Git Clone..."
        git config --global http.postBuffer 1048576000
        git config --global http.sslVerify false
        if git clone --depth 1 --progress "$REPO_URL" . 2>/dev/null; then
            SUCCESS=true
            log_success "Source synchronized via Git."
        fi
        git config --global http.sslVerify true
    fi

    if [ "$SUCCESS" = false ]; then
        log_error "All synchronization strategies failed."
        log_error "Check your network/firewall settings and retry."
        exit 1
    fi

    cd ..
}

# ──────────────────────────────────────────────
#  SECTION 4 — NPM & Docker Configuration
# ──────────────────────────────────────────────
configure_npm() {
    log_step "NPM Registry Configuration"

    log_info "Configuring NPM for global resilience..."
    cat > "${TARGET_DIR}/.npmrc" <<EOF
registry=https://registry.npmjs.org
strict-ssl=false
legacy-peer-deps=true
fetch-retry-maxtimeout=600000
fetch-retry-mintimeout=100000
fetch-retries=10
maxsockets=10
EOF
    log_success "NPM configured."
}

# ──────────────────────────────────────────────
#  SECTION 5 — Orchestration (Build & Launch)
# ──────────────────────────────────────────────

# Global flag to track deployment result
DEPLOY_SUCCESS=false

wait_for_app_health() {
    local ATTEMPTS=36
    local SLEEP_SECONDS=10

    log_info "Waiting for application health check to pass (up to $((ATTEMPTS * SLEEP_SECONDS))s)..."
    for i in $(seq 1 "$ATTEMPTS"); do
        # Check if container exists and is running
        local CONTAINER_STATE
        CONTAINER_STATE=$(docker inspect --format='{{.State.Status}}' kingchat-app 2>/dev/null || echo "missing")
        
        if [ "$CONTAINER_STATE" = "missing" ]; then
            log_info "Attempt ${i}/${ATTEMPTS}: Container not found yet..."
            sleep "$SLEEP_SECONDS"
            continue
        fi

        if [ "$CONTAINER_STATE" = "exited" ] || [ "$CONTAINER_STATE" = "dead" ]; then
            log_error "Application container has stopped unexpectedly."
            docker compose logs app --tail=60 || true
            return 1
        fi

        local APP_STATUS
        APP_STATUS=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' kingchat-app 2>/dev/null || echo "unknown")
        
        if [ "$APP_STATUS" = "healthy" ]; then
            log_success "Application container is healthy!"
            return 0
        fi
        
        # Try a direct HTTP health check as backup
        if docker exec kingchat-app wget -qO- http://localhost:3000/api/health 2>/dev/null | grep -q '"status"'; then
            log_success "Application is responding to health checks!"
            return 0
        fi

        log_info "Health status attempt ${i}/${ATTEMPTS}: container=${CONTAINER_STATE}, health=${APP_STATUS}"
        sleep "$SLEEP_SECONDS"
    done

    log_error "Application did not become healthy in time."
    log_info "Last 60 lines of application logs:"
    docker compose logs app --tail=60 || true
    log_info "Last 20 lines of database logs:"
    docker compose logs db --tail=20 || true
    return 1
}

wait_for_caddy_ready() {
    local ATTEMPTS=18
    local SLEEP_SECONDS=5

    log_info "Validating reverse proxy startup..."
    for i in $(seq 1 "$ATTEMPTS"); do
        local CONTAINER_STATE
        CONTAINER_STATE=$(docker inspect --format='{{.State.Status}}' kingchat-caddy 2>/dev/null || echo "missing")

        if [ "$CONTAINER_STATE" = "running" ]; then
            log_success "Caddy container is running."
            return 0
        fi

        if [ "$CONTAINER_STATE" = "exited" ] || [ "$CONTAINER_STATE" = "dead" ]; then
            log_error "Caddy container stopped unexpectedly."
            docker compose logs caddy --tail=80 || true
            return 1
        fi

        log_info "Caddy status attempt ${i}/${ATTEMPTS}: ${CONTAINER_STATE}"
        sleep "$SLEEP_SECONDS"
    done

    log_error "Caddy did not become ready in time."
    docker compose logs caddy --tail=80 || true
    return 1
}

launch_services() {
    log_step "Launching KiNGChat Services"

    cd "$TARGET_DIR"

    # Pull pre-built infrastructure images first (skip if already cached)
    log_info "Pre-pulling infrastructure images (skips if cached)..."
    if docker compose pull db minio caddy >/dev/null 2>&1; then
        log_success "Infrastructure images ready."
    else
        log_warn "Some images will be pulled during build — this is normal."
    fi

    export DOCKER_BUILDKIT=1
    export COMPOSE_DOCKER_CLI_BUILD=1
    export BUILDKIT_PROGRESS=plain

    log_info "Validating docker compose file..."
    if ! docker compose config >/dev/null; then
        log_error "docker compose configuration is invalid."
        DEPLOY_SUCCESS=false
        cd ..
        return 1
    fi

    # IMPORTANT: Start only db and minio first (NOT caddy, which depends on healthy app)
    log_info "Starting database and storage services..."
    if ! docker compose up -d db minio; then
        log_error "Failed to start database/storage services."
        DEPLOY_SUCCESS=false
        cd ..
        return 1
    fi

    # Wait for database to be healthy before building/starting app
    log_info "Waiting for database to become healthy..."
    local DB_WAIT=0
    while [ "$DB_WAIT" -lt 30 ]; do
        if docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{end}}' kingchat-db 2>/dev/null | grep -q "healthy"; then
            log_success "Database is healthy."
            break
        fi
        DB_WAIT=$((DB_WAIT + 1))
        sleep 2
    done

    log_info "Building application image (this may take several minutes)..."
    if docker compose build app; then
        log_success "Application image built successfully."
    else
        log_warn "Application build failed. Attempting recovery with --no-cache..."
        if ! docker compose build --no-cache app; then
            log_error "Application image build failed even after recovery attempt."
            log_info "To debug: cd ${TARGET_DIR} && docker compose logs --tail=50"
            DEPLOY_SUCCESS=false
            cd ..
            return 1
        fi
        log_success "Application image built after --no-cache recovery."
    fi

    log_info "Starting application container..."
    if ! docker compose up -d app; then
        log_error "Failed to start application container."
        docker compose logs app --tail=60 || true
        DEPLOY_SUCCESS=false
        cd ..
        return 1
    fi

    if wait_for_app_health; then
        # Now start caddy (it depends on app being healthy)
        log_info "Starting reverse proxy (Caddy)..."
        if docker compose up -d caddy; then
            if wait_for_caddy_ready; then
                log_success "All KiNGChat services are now operational!"
                DEPLOY_SUCCESS=true
            else
                log_error "Caddy is not healthy. HTTPS setup failed; please fix Caddy before using the domain."
                DEPLOY_SUCCESS=false
            fi
        else
            log_error "Caddy failed to start. App is running but reverse proxy needs attention."
            log_info "Run diagnostics: cd ${TARGET_DIR} && docker compose logs caddy --tail=120"
            DEPLOY_SUCCESS=false
        fi
    else
        log_warn "Application start failed. Attempting final recovery..."
        docker compose down --remove-orphans || true
        sleep 5

        log_info "Recovery: starting fresh..."
        docker compose up -d db minio
        sleep 10

        if docker compose build --no-cache app && docker compose up -d app && wait_for_app_health; then
            if docker compose up -d caddy && wait_for_caddy_ready; then
                DEPLOY_SUCCESS=true
                log_success "KiNGChat services started after recovery build!"
            else
                log_error "Recovery succeeded for app, but Caddy is still failing."
                DEPLOY_SUCCESS=false
            fi
        else
            log_error "Build failed after recovery. See logs for details."
            log_info "To debug: cd ${TARGET_DIR} && docker compose logs --tail=50"
            DEPLOY_SUCCESS=false
        fi
    fi

    cd ..
}

# ──────────────────────────────────────────────
#  SECTION 6 — Final Summary
# ──────────────────────────────────────────────
print_summary() {
    local SERVER_IP
    SERVER_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}' || echo "localhost")

    echo ""

    if [ "$DEPLOY_SUCCESS" = true ]; then
        log_step "Installation Complete ✓"
        echo -e "${GOLD}╔══════════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${GOLD}║          🎉  KiNGChat Installation Complete!  🎉               ║${NC}"
        echo -e "${GOLD}╠══════════════════════════════════════════════════════════════════╣${NC}"

        if [ "$USE_DOMAIN" = true ] && [ -n "$DOMAIN_NAME" ]; then
            echo -e "${GOLD}║${NC}  ${CYAN}App URL:${NC}       https://${DOMAIN_NAME}"
            echo -e "${GOLD}║${NC}  ${CYAN}SSL:${NC}           Auto-managed by Caddy (Let's Encrypt)"
            echo -e "${GOLD}║${NC}  ${CYAN}Auto-Renewal:${NC}  Monthly (1st of each month at 03:00)"
        else
            echo -e "${GOLD}║${NC}  ${CYAN}App URL:${NC}       ${RESOLVED_APP_URL:-http://${SERVER_IP}:3000}"
            echo -e "${GOLD}║${NC}  ${CYAN}SSL:${NC}           Not configured (IP mode)"
        fi

        echo -e "${GOLD}║${NC}  ${CYAN}DNS:${NC}           ${DNS_CHOICE:-system default}"
        echo -e "${GOLD}║${NC}  ${CYAN}Database:${NC}      PostgreSQL (container: kingchat-db)"
        echo -e "${GOLD}║${NC}  ${CYAN}Storage:${NC}       MinIO (container: kingchat-minio)"
        echo -e "${GOLD}║${NC}  ${CYAN}Admin User:${NC}    admin"
        echo -e "${GOLD}║${NC}  ${CYAN}Admin Password:${NC} ${ADMIN_PASSWORD_GENERATED:-generated-in-.env}"
        echo -e "${GOLD}║${NC}"
        echo -e "${GOLD}║${NC}  ${WHITE}Useful commands:${NC}"
        echo -e "${GOLD}║${NC}    cd ${TARGET_DIR} && docker compose ps"
        echo -e "${GOLD}║${NC}    cd ${TARGET_DIR} && docker compose logs -f app"
        echo -e "${GOLD}║${NC}    cd ${TARGET_DIR} && docker compose restart"
        echo -e "${GOLD}║${NC}"
        echo -e "${GOLD}║${NC}  ${CYAN}Documentation:${NC} https://github.com/ehsanking/KiNGChat"
        echo -e "${GOLD}╚══════════════════════════════════════════════════════════════════╝${NC}"
        echo ""
        log_info "Thank you for choosing KiNGChat. Stay secure. 👑"
    else
        log_step "Installation Failed ✗"
        echo -e "${RED}╔══════════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${RED}║          ⚠  KiNGChat Build/Start Failed  ⚠                     ║${NC}"
        echo -e "${RED}╠══════════════════════════════════════════════════════════════════╣${NC}"
        echo -e "${RED}║${NC}  The Docker build or service startup did not complete."
        echo -e "${RED}║${NC}"
        echo -e "${RED}║${NC}  ${WHITE}Diagnostic commands:${NC}"
        echo -e "${RED}║${NC}    cd ${TARGET_DIR} && docker compose logs --tail=80"
        echo -e "${RED}║${NC}    cd ${TARGET_DIR} && docker compose logs app"
        echo -e "${RED}║${NC}    cd ${TARGET_DIR} && docker compose build app"
        echo -e "${RED}║${NC}    docker system df"
        echo -e "${RED}║${NC}"
        echo -e "${RED}║${NC}  ${WHITE}Common causes:${NC}"
        echo -e "${RED}║${NC}    - Insufficient disk space (need ≥ 2GB free)"
        echo -e "${RED}║${NC}    - Insufficient RAM (need ≥ 512MB free)"
        echo -e "${RED}║${NC}    - Network issues downloading npm packages"
        echo -e "${RED}║${NC}    - Port 80/443/3000 already in use"
        echo -e "${RED}║${NC}"
        echo -e "${RED}║${NC}  ${CYAN}Support:${NC} https://github.com/ehsanking/KiNGChat/issues"
        echo -e "${RED}╚══════════════════════════════════════════════════════════════════╝${NC}"
        echo ""
        exit 1
    fi
}

# ══════════════════════════════════════════════
#   MAIN EXECUTION FLOW
# ══════════════════════════════════════════════
main() {
    print_header

    log_info "Initializing KiNGChat Professional Installer v2.5..."

    # Step 0: DNS Selection
    select_dns

    # Step 1: Preflight validation
    preflight_checks

    # Step 2: Dependencies (smart skip)
    check_all_dependencies

    # Step 3: Collect domain/SSL input (no file writes yet)
    collect_domain_ssl_input

    # Step 4: Source Sync (creates TARGET_DIR)
    sync_source

    # Step 5: Write Caddyfile now that TARGET_DIR exists
    apply_domain_ssl_config

    # Step 6: Secure env + NPM config
    configure_secure_env
    configure_npm

    # Step 7: Launch
    launch_services

    # Step 8: Summary
    print_summary
}

main "$@"
