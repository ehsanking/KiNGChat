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

# --- 3. Network Resilience & Cloning ---
log_info "Preparing network for high-latency environment..."
# Advanced Git Tuning
git config --global http.postBuffer 1048576000 # 1GB buffer
git config --global http.lowSpeedLimit 1000
git config --global http.lowSpeedTime 600
git config --global core.compression 0
git config --global http.sslVerify false # Temporary bypass for SSL handshake issues in restricted networks

if [ -d "$TARGET_DIR" ]; then
    log_warn "Directory $TARGET_DIR already exists."
    read -p "Overwrite existing installation? (y/N): " confirm
    if [[ $confirm == [yY] ]]; then
        rm -rf "$TARGET_DIR"
    else
        log_info "Aborting installation to protect existing data."
        exit 0
    fi
fi

log_info "Step 1/2: Synchronizing repository (using shallow clone for speed)..."
MAX_RETRIES=5
COUNT=0
SUCCESS=false

while [ $COUNT -lt $MAX_RETRIES ]; do
    # Use --depth 1 to minimize data transfer and avoid SSL timeout on large objects
    if git clone --depth 1 --progress "$REPO_URL" "$TARGET_DIR"; then
        SUCCESS=true
        break
    else
        COUNT=$((COUNT + 1))
        log_warn "Clone failed. Attempt $COUNT/$MAX_RETRIES. Retrying in 5 seconds..."
        # On failure, try to clear git cache/config if needed
        sleep 5
    fi
done

# Restore SSL verification after clone for security
git config --global http.sslVerify true

if [ "$SUCCESS" = false ]; then
    log_error "Failed to clone repository after $MAX_RETRIES attempts."
    log_info "Please check your internet connection or try using a VPN/Proxy."
    exit 1
fi

# --- 4. Deployment ---
cd "$TARGET_DIR"
log_success "Repository synchronized successfully."

log_info "Step 2/2: Orchestrating services..."
log_info "Pulling container images (this depends on your network speed)..."

# Try to pull with quiet flag first, fallback to standard if it fails
if docker compose pull -q 2>/dev/null; then
    log_info "Images pulled successfully."
else
    log_warn "Standard pull failed or not supported. Proceeding with inline pull..."
fi

if docker compose up -d; then
    log_success "KiNGChat services are now operational."
else
    log_error "Failed to start services. Check 'docker compose logs' for details."
    exit 1
fi

# --- 5. Final Summary ---
echo -e "\n${GOLD}================================================================${NC}"
log_success "Installation Complete!"
echo -e "${CYAN}Dashboard:${NC} http://$(curl -s ifconfig.me || echo "localhost"):3000"
echo -e "${CYAN}Documentation:${NC} https://github.com/ehsanking/KiNGChat"
echo -e "${GOLD}================================================================${NC}"
log_info "Thank you for choosing KiNGChat. Stay secure."

