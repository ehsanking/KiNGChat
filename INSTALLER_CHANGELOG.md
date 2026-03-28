# Installer hardening changelog

## Security and safety fixes

- Added explicit install modes (`fresh`, `upgrade`, `reinstall`) with state detection for install directory, `.env`, docker containers, and DB volume.
- Upgrade flow is now non-destructive and idempotent:
  - existing secrets and credentials are preserved,
  - only missing environment keys are generated,
  - `.env` updates are key-level (no full-file rewrite).
- Removed destructive update fallback that could delete the install directory after failed sync.
- Upgrade now aborts on dirty git worktree and on git fetch/reset failures.
- Added timestamped backup creation before upgrade (`.env`, `Caddyfile`, compose files).
- Fixed admin bootstrap handling:
  - installer never prints admin passwords,
  - invalid admin input is re-prompted,
  - auto-generated bootstrap credentials are written to `.installer-secrets/bootstrap-admin.txt` with restrictive permissions,
  - `ADMIN_BOOTSTRAP_FORCE_PASSWORD_CHANGE` is set based on how credentials are provisioned.
- Fixed IP-only mode origin consistency (`APP_URL=http://<server-ip>`), aligned with Caddy listening on port 80.
- Added dedicated `DOWNLOAD_TOKEN_SECRET` generation and compose wiring.
- Added persistent named volume for local object storage (`object_storage_data` -> `/app/object_storage`).
- Removed host-wide DNS/daemon mutation behavior from default flow (no `/etc/resolv.conf` or `/etc/docker/daemon.json` overwrite path).
- Removed extra SSL cron injection; rely on Caddy built-in certificate renewal.
- Reduced supply-chain risk by removing `curl|sh` and `curl|tar` execution paths from installer logic.
