#!/bin/bash
set -euo pipefail

RAW_INSTALLER_URL="https://raw.githubusercontent.com/ehsanking/ElaheMessenger/main/install.sh"
TMP_DIR="$(mktemp -d)"
PATCHED_INSTALLER="${TMP_DIR}/install.patched.sh"
ORIGINAL_INSTALLER="${TMP_DIR}/install.original.sh"

cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

choose_storage_mode() {
  echo ""
  echo "━━━ Storage Backend Selection ━━━"
  echo "Choose how the installer should handle object storage:"
  echo ""
  echo "  1) Auto detect     — Use MinIO only if docker-compose defines a minio service"
  echo "  2) Local storage   — Ignore MinIO and use filesystem storage"
  echo "  3) Force MinIO     — Require a minio service in docker-compose"
  echo ""

  local choice
  read -r -p "Enter choice [1-3]: " choice

  case "${choice:-1}" in
    1) KINGCHAT_STORAGE_MODE="auto" ;;
    2) KINGCHAT_STORAGE_MODE="force-local" ;;
    3) KINGCHAT_STORAGE_MODE="force-minio" ;;
    *)
      echo "[WARN] Invalid choice. Falling back to auto detection."
      KINGCHAT_STORAGE_MODE="auto"
      ;;
  esac

  export KINGCHAT_STORAGE_MODE
  echo "[INFO] Using storage mode: ${KINGCHAT_STORAGE_MODE}"
}

download_installer() {
  echo "[INFO] Downloading installer from ${RAW_INSTALLER_URL} ..."
  curl -fsSL "${RAW_INSTALLER_URL}" -o "${ORIGINAL_INSTALLER}"
  cp "${ORIGINAL_INSTALLER}" "${PATCHED_INSTALLER}"
}

patch_installer() {
  python3 - "${PATCHED_INSTALLER}" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text(encoding='utf-8')

replacements = [
    (
        'DEPLOY_SUCCESS=false\n',
        'DEPLOY_SUCCESS=false\nSTORAGE_MODE="${KINGCHAT_STORAGE_MODE:-auto}"\nSTORAGE_BACKEND_SUMMARY="Local filesystem (no MinIO container)"\n\ncompose_service_exists() {\n    local service_name="$1"\n    docker compose config --services 2>/dev/null | grep -Fxq "$service_name"\n}\n\n',
    ),
    (
        '''    # Pull pre-built infrastructure images first (skip if already cached)\n    log_info "Pre-pulling infrastructure images (skips if cached)..."\n    if docker compose pull db minio caddy >/dev/null 2>&1; then\n        log_success "Infrastructure images ready."\n    else\n        log_warn "Some images will be pulled during build — this is normal."\n    fi\n''',
        '''    # Pull pre-built infrastructure images first (skip if already cached)\n    local -a PREPULL_SERVICES=("db")\n    local -a BOOTSTRAP_SERVICES=("db")\n\n    case "$STORAGE_MODE" in\n        force-local)\n            STORAGE_BACKEND_SUMMARY="Local filesystem (no MinIO container)"\n            log_info "Storage mode: local filesystem (forced)."\n            ;;\n        force-minio)\n            if compose_service_exists "minio"; then\n                PREPULL_SERVICES+=("minio")\n                BOOTSTRAP_SERVICES+=("minio")\n                STORAGE_BACKEND_SUMMARY="MinIO (container: elahe-minio)"\n                log_info "Storage mode: compose-defined MinIO (forced)."\n            else\n                log_error "You selected MinIO, but docker compose does not define a 'minio' service."\n                DEPLOY_SUCCESS=false\n                cd ..\n                return 1\n            fi\n            ;;\n        auto|*)\n            if compose_service_exists "minio"; then\n                PREPULL_SERVICES+=("minio")\n                BOOTSTRAP_SERVICES+=("minio")\n                STORAGE_BACKEND_SUMMARY="MinIO (container: elahe-minio)"\n                log_info "Storage mode: auto-detected MinIO service from docker compose."\n            else\n                STORAGE_BACKEND_SUMMARY="Local filesystem (no MinIO container)"\n                log_info "Storage mode: local filesystem (no MinIO service defined in docker compose)."\n            fi\n            ;;\n    esac\n\n    if compose_service_exists "caddy"; then\n        PREPULL_SERVICES+=("caddy")\n    fi\n\n    log_info "Pre-pulling infrastructure images (skips if cached)..."\n    if docker compose pull "${PREPULL_SERVICES[@]}" >/dev/null 2>&1; then\n        log_success "Infrastructure images ready."\n    else\n        log_warn "Some images will be pulled during build — this is normal."\n    fi\n''',
    ),
    (
        '''    # IMPORTANT: Start only db and minio first (NOT caddy, which depends on healthy app)\n    log_info "Starting database and storage services..."\n    if ! docker compose up -d db minio; then\n        log_error "Failed to start database/storage services."\n        DEPLOY_SUCCESS=false\n        cd ..\n        return 1\n    fi\n''',
        '''    # IMPORTANT: Start only bootstrap services first (NOT caddy, which depends on healthy app)\n    log_info "Starting bootstrap services: ${BOOTSTRAP_SERVICES[*]}..."\n    if ! docker compose up -d "${BOOTSTRAP_SERVICES[@]}"; then\n        log_error "Failed to start bootstrap services (${BOOTSTRAP_SERVICES[*]})."\n        DEPLOY_SUCCESS=false\n        cd ..\n        return 1\n    fi\n''',
    ),
    (
        '        docker compose up -d db minio\n',
        '        docker compose up -d "${BOOTSTRAP_SERVICES[@]}"\n',
    ),
    (
        '        echo -e "${GOLD}║${NC}  ${CYAN}Storage:${NC}       MinIO (container: elahe-minio)"\n',
        '        echo -e "${GOLD}║${NC}  ${CYAN}Storage:${NC}       ${STORAGE_BACKEND_SUMMARY:-Local filesystem}"\n',
    ),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f"Patch anchor not found in installer: {old[:80]!r}")
    text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
PY
}

run_installer() {
  echo "[INFO] Running patched installer..."
  bash "${PATCHED_INSTALLER}" "$@"
}

main() {
  choose_storage_mode
  download_installer
  patch_installer
  run_installer "$@"
}

main "$@"
