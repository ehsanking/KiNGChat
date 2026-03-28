# Changelog

## Unreleased

### Security and runtime hardening
- Removed startup secret-generation side effects from `server.ts`; production startup now validates required secrets and placeholders fail fast.
- Hardened installer network behavior by removing global git SSL verification disable and insecure `curl -k` usage.
- Made DNS and Docker daemon mutation in `install.sh` opt-in and declared installer Linux-only.
- Removed seeded placeholder E2EE key material for bootstrap admin; account now starts with empty keys and must register client keys after login.

### Stability and operations
- Added shared environment loader policy (`.env` for production, `.env` + `.env.local` for development) and reused it in runtime/scripts.
- Split health endpoints into liveness (`/api/health/live`) and readiness (`/api/health/ready`), and kept `/api/health` as readiness compatibility route.
- Updated Docker and Compose health checks to use liveness endpoint.
- Replaced Unix-only npm start/dev env assignment with cross-platform launcher scripts and replaced `next clean` with a reliable cleanup script.
