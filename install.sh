#!/bin/bash
# KiNGChat Professional Installer
# 👑 The Secure Messenger for the Private Era
# Designed for Resilience and Excellence

set -e

# --- Configuration ---
REPO_URL="https://github.com/ehsanking/KiNGChat.git"
TARGET_DIR="KiNGChat"
MIN_RAM_MB=1024

# --- Colors & UI ---
GOLD='\033[1;33m'
BLUE='\033[1;34m'
RED='\033[1;31m'
GREEN='\033[1;32m'
CYAN='\033[1;36m'
NC='\033[0m' # No Color

# --- Helper Functions ---
print_header() {
    clear
    echo -e "${GOLD}"
    echo "  ██╗  ██╗██╗███╗   ██╗ ██████╗  ██████╗██╗  ██╗ █████╗ ████████╗"
    echo "  ██║ ██╔╝██║████╗  ██║██╔════╝ ██╔════╝██║  ██║██╔══██╗╚══██╔══╝"
    echo "  █████╔╝ ██║██╔██╗ ██║██║  ███╗██║     ███████║███████║   ██║   "
    echo "  ██╔═██╗ ██║██║╚██╗██║██║   ██║██║     ██╔══██║██╔══██║   ██║   "
    echo "  ██║  ██╗██║██║ ╚████║╚██████╔╝╚██████╗██║  ██║██║  ██║   ██║   "
    echo "  ╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   "
    echo -e "             ${CYAN}The Secure Messenger for the Private Era${NC}"
    echo -e "----------------------------------------------------------------"
}

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${GOLD}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# --- 0. DNS Optimization ---
optimize_dns() {
    log_info "Optimizing DNS for global connectivity..."
    if [ -w "/etc/resolv.conf" ]; then
        # Backup original resolv.conf
        cp /etc/resolv.conf /etc/resolv.conf.bak
        # Set Google and Cloudflare DNS
        echo -e "nameserver 8.8.8.8\nnameserver 1.1.1.1\nnameserver 4.2.2.4" > /etc/resolv.conf
        log_success "DNS optimized (Google & Cloudflare)."
    else
        log_warn "Insufficient permissions to modify /etc/resolv.conf. Skipping DNS optimization."
    fi
}

check_dependency() {
    if ! command -v "$1" &> /dev/null; then
        log_warn "$1 is not installed."
        return 1
    fi
    return 0
}

# --- 1. Welcome & System Check ---
print_header
log_info "Initializing KiNGChat Professional Installer..."

# Run DNS Optimization
optimize_dns

# Check RAM
TOTAL_RAM=$(free -m | awk '/^Mem:/{print $2}')
if [ "$TOTAL_RAM" -lt "$MIN_RAM_MB" ]; then
    log_warn "System has less than ${MIN_RAM_MB}MB RAM. Performance may be degraded."
fi

# --- 2. Dependency Management ---
log_info "Checking system dependencies..."

if ! check_dependency "git"; then
    log_info "Installing Git..."
    sudo apt-get update -qq && sudo apt-get install -y git -qq
fi

if ! check_dependency "docker"; then
    log_error "Docker is required but not found."
    echo -e "${CYAN}Tip: If you are in Iran, use our optimized script:${NC}"
    echo -e "curl -fsSL https://raw.githubusercontent.com/manageitir/docker/main/install-ubuntu.sh | sh"
    exit 1
fi

# --- 3. Infrastructure & Source Synchronization ---
log_info "Preparing network for high-latency environment..."

if [ -d "$TARGET_DIR" ]; then
    log_warn "Directory $TARGET_DIR already exists."
    # Read from /dev/tty to allow interaction when piped via curl
    read -p "Overwrite existing installation? (y/N): " confirm < /dev/tty || confirm="N"
    if [[ $confirm == [yY] ]]; then
        log_info "Removing existing directory..."
        rm -rf "$TARGET_DIR"
    else
        log_info "Aborting installation to protect existing data."
        exit 0
    fi
fi

mkdir -p "$TARGET_DIR"
cd "$TARGET_DIR"

# --- Step 1: Pulling Infrastructure ---
log_info "Step 1/2: Pulling Core Infrastructure Images..."
log_info "Downloading Docker manifests..."

# Download docker-compose.yml first to allow pulling
curl -sL -o docker-compose.yml "https://raw.githubusercontent.com/ehsanking/KiNGChat/main/docker-compose.yml"

# Pull images that don't require building first (db, minio, caddy)
if docker compose pull db minio caddy -q 2>/dev/null; then
    log_success "Infrastructure images pulled successfully."
else
    log_warn "Background pull failed. Will pull during orchestration."
fi

# --- Step 2: Synchronizing Source ---
log_info "Step 2/2: Synchronizing Application Source..."
SUCCESS=false

# Strategy A: Resilient Archive Stream (Primary for restricted networks)
log_info "Attempting Strategy A: Resilient Archive Stream (CURL)..."
TARBALL_URL="https://github.com/ehsanking/KiNGChat/archive/refs/heads/main.tar.gz"

if curl -L --retry 5 --retry-delay 5 -k "$TARBALL_URL" | tar -xz --strip-components=1; then
    SUCCESS=true
    log_success "Source synchronized via Archive Stream."
else
    log_warn "Strategy A failed. Attempting Strategy B (Git)..."
fi

# Strategy B: Git Clone (Fallback)
if [ "$SUCCESS" = false ]; then
    log_info "Attempting Strategy B: High-speed Git Synchronization..."
    # Advanced Git Tuning
    git config --global http.postBuffer 1048576000
    git config --global http.sslVerify false
    
    # We are already inside TARGET_DIR, so we clone to temp and move
    if git clone --depth 1 --progress "$REPO_URL" .temp_clone; then
        mv .temp_clone/* .
        mv .temp_clone/.* . 2>/dev/null || true
        rm -rf .temp_clone
        SUCCESS=true
        log_success "Source synchronized via Git."
    fi
    git config --global http.sslVerify true
fi

if [ "$SUCCESS" = false ]; then
    log_error "All synchronization strategies failed."
    log_info "Network Diagnostic: Your ISP is blocking both Git and HTTPS Archive streams."
    exit 1
fi

# --- 4. Deployment & Network Optimization ---
# (We are already in TARGET_DIR)

# --- 4.1. NPM Registry Optimization ---
log_info "Optimizing package manager for your network..."
# Always inject Iranian mirror configuration for resilience
log_warn "Injecting Iranian NPM mirror (registry.npmjs.ir) for maximum speed..."
echo "registry=https://registry.npmjs.ir" > .npmrc
echo "strict-ssl=false" >> .npmrc
echo "fetch-retry-maxtimeout=600000" >> .npmrc
echo "fetch-retry-mintimeout=100000" >> .npmrc
echo "fetch-retries=10" >> .npmrc
log_success "NPM mirror injected."

log_info "Finalizing orchestration..."
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

if docker compose up -d --build; then
    log_success "KiNGChat services are now operational."
else
    log_error "Failed to start services. Attempting recovery build..."
    docker compose build --no-cache
    docker compose up -d
fi

# --- 5. Final Summary ---
echo -e "\n${GOLD}================================================================${NC}"
log_success "Installation Complete!"
echo -e "${CYAN}Dashboard:${NC} http://$(curl -s ifconfig.me || echo "localhost"):3000"
echo -e "${CYAN}Documentation:${NC} https://github.com/ehsanking/KiNGChat"
echo -e "${GOLD}================================================================${NC}"
log_info "Thank you for choosing KiNGChat. Stay secure."

