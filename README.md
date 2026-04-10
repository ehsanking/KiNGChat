<p align="center">
  <img src="./public/readme-banner.png" alt="Elahe Messenger" width="800" />
</p>

<p align="center">
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <img alt="Version" src="https://img.shields.io/badge/version-1.0.0-gold">
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D20-brightgreen">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-15-black">
  <img alt="Stack" src="https://img.shields.io/badge/stack-Next.js%2015%20%7C%20Prisma%20%7C%20PostgreSQL-111827">
  <img alt="PRs Welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg">
</p>

---

## Overview

**Elahe Messenger** is an open-source, self-hosted, end-to-end encrypted messaging platform built for teams, communities, and individuals who demand full control over their data. It combines the power of **Next.js 15**, **React 19**, and **Socket.IO** on a **Node.js** runtime, backed by **Prisma ORM** with **PostgreSQL** (or SQLite for local development) and optionally scaled horizontally via **Redis**.

> Client apps encrypt direct-message content before transmission. The server primarily handles ciphertext payloads, while still processing operational metadata (membership, timestamps, audit/security events).

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Manual Installation](#manual-installation)
- [Configuration](#configuration)
- [Docker Deployment](#docker-deployment)
- [Usage Guide](#usage-guide)
- [API & Integrations](#api--integrations)
- [Observability](#observability)
- [Testing](#testing)
- [Security](#security)
- [Capability Maturity](#capability-maturity)
- [Crypto Status](#crypto-status)
- [Runtime Topology](#runtime-topology)
- [Threat Model](#threat-model)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

---

## Features

| Category | Capabilities |
|---|---|
| 🔐 **Encryption** | Browser-side E2EE for direct messages (ECDH-P256, HKDF-SHA256, AES-256-GCM); device-bound key bundles; pre-key rotation; safety-number verification; advanced ratcheting remains transitional |
| 💬 **Messaging** | Real-time DMs, group chats, channels, message reactions, edits, replies/threads, server-side search, drafts, disappearing messages, read receipts |
| 📎 **Attachments** | Encrypted secure upload/download with MIME/extension allowlist; pluggable object storage (local filesystem or S3/MinIO) |
| 🎙️ **Voice & Video** | WebRTC 1:1 calls with TURN/STUN support and media manager |
| 👥 **Social** | Contact management, community groups, invite links, member roles |
| 🛡️ **Security** | TOTP/2FA (RFC 6238), session binding (IP/User-Agent), CSRF/origin checks, rate limiting (HTTP + WebSocket), local math captcha or reCAPTCHA, audit logs, password policy enforcement |
| 🔑 **Authentication** | Username/password, OAuth/SSO (Google, GitHub, generic OIDC), password recovery with recovery questions, bootstrap admin workflow |
| 🤖 **Bot Platform** | Built-in bot framework with webhook registration, programmatic message sending, and per-bot auth tokens |
| 🧭 **Admin** | User management, ban/verify controls, moderation workflows, settings panel, reports/KPI dashboard, scheduled backups |
| 📊 **Observability** | OpenTelemetry tracing, structured Pino JSON logs, Prometheus-style metrics endpoint, liveness/readiness probes |
| 📦 **DevOps** | Docker Compose (base + prod override + split runtime), one-line installer, Caddy auto-SSL, health checks, PgBouncer auto-detection |
| 🗄️ **Database** | Prisma ORM, PostgreSQL 16 (prod), SQLite (dev), migration deploy fail-fast, bootstrap vs least-privilege runtime roles |
| 📱 **PWA** | Installable app shell with Workbox service worker, cached static assets, offline draft queue |
| 🔔 **Push** | VAPID web-push notifications, optional Firebase FCM fallback |
| 🌐 **i18n** | Localized UI strings with right-to-left support |
| 🧪 **Testing** | Vitest unit + integration projects, Playwright e2e, CodeQL + Trivy + Gitleaks in CI |

---

## Architecture

### End-to-End message flow algorithm

1. **Authenticate and bind session**: user signs in; secure cookie session remains guarded by CSRF/origin checks.
2. **Load client key material**: E2EE keys are generated/loaded in-browser (Web Crypto + IndexedDB).
3. **Encrypt on client**: message content is encrypted before transmission; server should not require plaintext.
4. **Send in real-time**: ciphertext is sent over HTTPS/WSS to `server.ts` and Socket.IO.
5. **Apply server-side guards**: membership, authorization, rate limits, anti-abuse rules, and audit logging are enforced.
6. **Persist and distribute**: encrypted payload is stored via Prisma in PostgreSQL; optional Redis supports pub/sub scaling.
7. **Deliver to recipient devices**: authorized recipient sessions receive ciphertext in real-time.
8. **Decrypt only on recipient client**: browser decrypts locally and updates delivery/read state.

### Visual runtime chart

```mermaid
flowchart TD
  A[User login + secure session] --> B[Load E2EE keys in browser]
  B --> C[Compose message]
  C --> D[Client-side encryption]
  D --> E[Send ciphertext over HTTPS/WSS]
  E --> F[server.ts + Next.js + Socket.IO]
  F --> G{Security checks: membership/rate/authz}
  G -->|Allowed| H[(PostgreSQL via Prisma)]
  G -->|Allowed| I[(Redis optional: Pub/Sub)]
  H --> J[Real-time delivery to recipient]
  I --> J
  J --> K[Recipient browser decrypts]
  K --> L[Update delivered/read state]
```

---

## Requirements

| Dependency | Minimum Version | Notes |
|---|---|---|
| Node.js | 20 LTS | Required for native crypto APIs |
| npm | 10+ | Package management |
| PostgreSQL | 15+ | Production database |
| Redis | 6+ | Optional; enables clustering |
| Docker + Compose | v2+ | Recommended for production |

Supported installer platform: **Linux (amd64/x86_64, arm64/aarch64)**.

---

## Quick Start

### Installer (Linux, production-safe flow)

```bash
# 1) One-line install (works for root and non-root users)
curl -fsSL https://raw.githubusercontent.com/ehsanking/ElaheMessenger/main/install.sh | ( [ "$(id -u)" -eq 0 ] && bash || sudo bash )

# 2) Optional: Download from a pinned tag for reproducible installs
TAG="<release-tag>"
curl -fsSLo install.sh "https://raw.githubusercontent.com/ehsanking/ElaheMessenger/${TAG}/install.sh"

# 3) Verify checksum (recommended)
# Replace with the checksum published for the chosen release/tag.
echo "<sha256>  install.sh" | sha256sum -c -

# 4) Inspect installer before running
less install.sh

# 5) Run (installer auto-elevates with sudo when possible)
sudo bash install.sh
```

The one-line installer performs the full production lifecycle (preflight checks, environment configuration, and service launch). There is no separate `setup` command for production installs in this repository.

Reproducible alternatives:

```bash
# Pinned tag
sudo INSTALL_REF=<release-tag> bash install.sh

# Pinned commit
sudo INSTALL_REF=<40-char-commit-sha> bash install.sh
```

Non-interactive automation (CI/provisioning-safe):
```bash
sudo INSTALL_NONINTERACTIVE=true \
     INSTALL_MODE=fresh \
     INSTALL_USE_DOMAIN=false \
     INSTALL_REF=<release-tag> \
     bash install.sh
```

Optional non-interactive domain mode:
```bash
sudo INSTALL_NONINTERACTIVE=true \
     INSTALL_MODE=fresh \
     INSTALL_USE_DOMAIN=true \
     INSTALL_DOMAIN_NAME=chat.example.com \
     INSTALL_SSL_EMAIL=admin@example.com \
     INSTALL_REF=<release-tag> \
     bash install.sh
```
Unsafe/dev-only (mutable branch head):
```bash
curl -fsSLo install.sh https://raw.githubusercontent.com/ehsanking/ElaheMessenger/main/install.sh
sudo INSTALL_REF=main bash install.sh
```
1. **Fresh install** (new deployment)
2. **Upgrade** (safe in-place update, preserves `.env` secrets/data)
3. **Reinstall** (backs up existing directory first, then re-installs)

Installer safety behavior:
- Prompts for a **source ref strategy** (latest tag recommended, or explicit tag/commit); mutable `main` head is still available but warned.
- Preserves operator-managed config by default on upgrade (`.env`, `Caddyfile`, compose overrides). Regeneration happens only when explicitly selected.
- Preserves existing `.npmrc` and registry/mirror settings; creates a default `.npmrc` only when missing.
- Upgrade now prompts for proxy behavior: **preserve existing proxy config** (default) or **regenerate proxy config** (for ingress/domain/IP changes).
- Preserves existing production secrets on upgrade (`POSTGRES_*`, `APP_DB_*`, `DATABASE_URL`, auth/encryption/download secrets, admin credentials) unless you explicitly change values.
- Enforces database role separation: bootstrap role (`POSTGRES_*`) for DB provisioning and least-privilege runtime role (`APP_DB_*`) for the app `DATABASE_URL`.
- Creates timestamped upgrade backups (`.env`, `Caddyfile`, compose files) before update steps.
- Aborts upgrades when git sync fails or the worktree is dirty (no implicit `rm -rf` fallback).
- Uses Caddy on `:80/:443`; in IP-only mode the generated `APP_URL` uses `http://<server-ip>` (no internal `:3000` mismatch).
- Preflight checks validate listener availability on `tcp/80`, `tcp/443`, and `udp/443` before launch (non-interactive mode fails closed on conflicts).
- Never prints bootstrap admin password in terminal output; auto-generated credentials are written once to a local secrets file with restrictive permissions.
- Non-interactive installs are first-class: no hidden interactive dependency; install choices are deterministic and env-driven.
- Verifies post-launch health in explicit phases: container health, local reverse-proxy routing, and external DNS/TLS readiness guidance.
- Fails install when local reverse-proxy routing does not work, and only warns for external DNS/TLS propagation uncertainty.
- Source trust defaults to a pinned tag when available; mutable branch-head installs are opt-in and explicitly warned during installer prompts.
- Fresh/reinstall writes bootstrap admin password to a one-time file (`./runtime/admin-bootstrap-password`) and passes it via `ADMIN_BOOTSTRAP_PASSWORD_FILE`.
- `ADMIN_USERNAME`/`ADMIN_PASSWORD` are create-only by default; if `ADMIN_BOOTSTRAP_RESET_EXISTING=true` is used, reset is consumed once per credential set (not repeated on every restart).
- Does **not** auto-enable UFW; firewall changes remain operator-driven.

### Installer troubleshooting

- **Installer hangs in piped mode**: run with `INSTALL_NONINTERACTIVE=true` (and optionally `INSTALL_MODE`, `INSTALL_USE_DOMAIN`, `INSTALL_DOMAIN_NAME`).  
- **Ports 80/443 are already used**: stop conflicting services; non-interactive installs fail fast on conflicts by design.
- **Domain install fails local probe**: verify `INSTALL_DOMAIN_NAME`/domain prompt value is correct and resolves publicly; installer now validates host-routed proxy behavior locally with `--resolve`.
- **Docker Compose missing on Debian/Ubuntu**: installer attempts distro compose plugin packages (`docker-compose-plugin` / `docker-compose-v2`) and exits with actionable guidance if unavailable.
- **Need strict reproducibility**: pin `INSTALL_REF` to a release tag or commit, not `main`.

Detailed runbook: `docs/installer-verification-checklist.md`.

---

## Manual Installation

```bash
# 1. Clone the repository
git clone https://github.com/ehsanking/ElaheMessenger.git
cd ElaheMessenger

# 2. Choose environment template
cp .env.example .env

# For production, use:
# cp production.env.example .env

# 3. Edit .env and set all required production values.
# Required for production:
#   APP_ENV=production
#   DATABASE_URL (PostgreSQL)
#   APP_DB_USER / APP_DB_PASSWORD
#   APP_URL / ALLOWED_ORIGINS
#   JWT_SECRET / SESSION_SECRET / ENCRYPTION_KEY / DOWNLOAD_TOKEN_SECRET
#   ADMIN_USERNAME and (ADMIN_PASSWORD or ADMIN_BOOTSTRAP_PASSWORD_FILE)
#   LOCAL_CAPTCHA_SECRET when CAPTCHA_PROVIDER=local

# 4. Install dependencies (generates Prisma client automatically)
npm install

# 5. Validate environment before first start
npm run validate:env -- --mode=production

# 6. Apply database migrations
npm run db:migrate:prod

# 7. Build for production
npm run build

# 8. Start
npm start
```

> **First run:** `npm install` is side-effect free for database state (client generation only). Run DB setup explicitly with `npm run db:init:dev` (SQLite/dev) or `npm run db:migrate:prod` (PostgreSQL/prod).

### Install/First-Run Diagnostics

- Docker startup now logs explicit bootstrap stages (env validation, DB wait, migration deploy, server handoff) in `docker-entrypoint.sh`.
- Migration failures are fail-fast and include actionable guidance (`DATABASE_URL` reachability, migration history, schema compatibility).
- Runtime/API failures return structured safe error payloads with:
  - `error` (safe message),
  - `errorCode` (machine-readable classification),
  - `requestId` (for correlation in server logs),
  - optional `action` (next step for operators/clients).
- For authentication/bootstrap failures, use the emitted `requestId` to correlate with JSON logs from `lib/logger.ts`.

---

## Configuration

All configuration is done through environment variables. Copy `.env.example` to `.env` and set the values below.

Environment loading policy:
- **Local development**: load `.env`, then `.env.local` (if present)
- **Docker/production**: load only injected env values / `.env` (ignore `.env.local`)

### Core

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | SQLite in `.env.example` | PostgreSQL connection string for production |
| `POSTGRES_USER` | *(none)* | Bootstrap/admin PostgreSQL role (provisioning only) |
| `POSTGRES_PASSWORD` | *(none)* | Bootstrap/admin PostgreSQL password |
| `POSTGRES_DB` | `elahe` | PostgreSQL database name |
| `APP_DB_USER` | *(none)* | Least-privilege runtime DB user for the app |
| `APP_DB_PASSWORD` | *(none)* | Least-privilege runtime DB password |
| `MIGRATION_DATABASE_URL` | *(none)* | PostgreSQL URL for migration/provisioning role (recommended: bootstrap role) |
| `APP_URL` | `http://localhost:3000` | Public base URL of the application |
| `NODE_ENV` | `development` | Set to `production` for production builds |
| `PORT` | `3000` | HTTP server port |

### Security *(auto-generated on first run)*

| Variable | Description |
|---|---|
| `JWT_SECRET` | HMAC-SHA256 signing secret for session tokens (≥ 32 chars) |
| `SESSION_SECRET` | Dedicated session-cookie signing secret (≥ 32 chars, no cross-domain reuse) |
| `ENCRYPTION_KEY` | AES encryption key for sensitive fields |
| `DOWNLOAD_TOKEN_SECRET` | Attachment/token signing secret (independent from session secret) |
| `LOCAL_CAPTCHA_SECRET` | HMAC key for local captcha challenge signing in production |
| `CAPTCHA_PROVIDER` | `recaptcha` (default) or `local` |
| `ADMIN_USERNAME` | Initial admin username (required; no default) |
| `ADMIN_PASSWORD` | Optional inline bootstrap password (legacy-compatible) |
| `ADMIN_BOOTSTRAP_PASSWORD_FILE` | Optional bootstrap password file path (preferred in production) |
| `ADMIN_BOOTSTRAP_STRICT` | Fail startup when bootstrap cannot complete (`true` on fresh installs) |

### Push Notifications *(optional)*

| Variable | Description |
|---|---|
| `VAPID_PUBLIC_KEY` | Web Push VAPID public key |
| `VAPID_PRIVATE_KEY` | Web Push VAPID private key |
| `VAPID_EMAIL` | Contact email for VAPID |

### Redis *(optional)*

| Variable | Description |
|---|---|
| `REDIS_URL` | e.g. `redis://localhost:6379` — enables Socket.IO clustering |

### Rate Limiting

| Variable | Default | Description |
|---|---|---|
| `RATE_LIMIT_WINDOW_MS` | `900000` | Rate limit window in milliseconds (15 min) |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per window per IP |
| `SOCKET_RATE_LIMIT_WINDOW_MS` | `10000` | Socket rate limit window (10 s) |
| `SOCKET_RATE_LIMIT_MAX` | `30` | Max socket events per window |

---
### CI Security Automation

- Dependabot is configured for npm, Docker, and GitHub Actions (`.github/dependabot.yml`).
- Container image scanning runs with Trivy and uploads SARIF to GitHub Security tab (`.github/workflows/container-security.yml`).
- Repository secret scanning runs with Gitleaks on push/PR (`.github/workflows/secret-scan.yml`).

---


## Docker Deployment

### Development

```bash
docker compose up -d
```

### Production (with auto-SSL via Caddy)

```bash
# 1) Copy production env template and set strong values
cp production.env.example .env.production

# 2) Start using base + production override compose files
docker compose -f docker-compose.yml -f compose.prod.yaml --env-file .env.production up -d --build
```

`compose.prod.yaml` is an override file for `docker-compose.yml` (not a standalone compose file).
`--env-file .env.production` is required so Compose can interpolate `${VAR}` values in the compose model (while `env_file:` only affects container runtime environment).

> Security note: define production credentials explicitly via `.env.production` (or Docker secrets) before startup.

### Split runtime mode (optional)

Use split mode only when you need independent scaling for API/socket and background workers.

```bash
# API + worker split using explicit topology override
docker compose \
  -f docker-compose.yml \
  -f compose.prod.yaml \
  -f compose.split.yaml \
  --env-file .env.production \
  up -d --build
```

In split mode, `api` handles HTTP/Socket.IO only and `worker` handles background jobs only.
Caddy targets `api` in this topology, and the base `app` service is disabled to avoid duplicate schedulers.

Container names and services:

| Service | Container | Description |
|---|---|---|
| App | `elahe-app` | Next.js + Socket.IO server |
| Database | `elahe-db` | PostgreSQL 16 |
| Reverse proxy | `elahe-caddy` | Caddy with automatic Let's Encrypt SSL |

### Production Networking Policy (default compose)

| Port | Exposure | Why |
|---|---|---|
| `80/tcp` | **Public** | HTTP challenge + redirect / non-TLS IP mode |
| `443/tcp` | **Public** | HTTPS ingress |
| `443/udp` | Optional Public | HTTP/3 (QUIC) |
| `5432/tcp` | **Private only** | PostgreSQL (Docker-internal by default) |
| `3000/tcp` | **Private only** | App container behind Caddy |
| `6379/tcp` | **Private only** | Redis (if used) |

> The provided compose files keep PostgreSQL internal-only by default (no `ports:` publish for `db`). Do **not** expose `5432` unless you intentionally need remote database access.

### Database Hardening (bootstrap vs runtime role)

- `POSTGRES_USER` / `POSTGRES_PASSWORD`: bootstrap/admin database role used for first-time PostgreSQL provisioning.
- `APP_DB_USER` / `APP_DB_PASSWORD`: runtime least-privilege role used by Prisma/app in `DATABASE_URL`.
- `MIGRATION_DATABASE_URL`: role used for schema migrations (`prisma migrate deploy`); should remain bootstrap/provisioning-scoped.
- `DATABASE_URL` should point to `APP_DB_USER`, not the bootstrap account.
- Runtime role grants are intentionally limited to application DML/sequence/function access; schema-changing privileges stay in the migration/bootstrap role.
- Treat both bootstrap and runtime DB secrets as sensitive; rotate and store with least access (prefer secret manager or Docker secrets over plaintext files where possible).
- `SESSION_SECRET` is a dedicated session-signing secret and must not be reused as a fallback for unrelated security domains.

#### Connection pooling (PgBouncer)

- Elahe Messenger auto-detects PgBouncer and appends `pgbouncer=true` to Prisma's runtime URL when:
  - `PGBOUNCER_ENABLED=true`, or
  - `DATABASE_URL` host contains `pgbouncer`, or
  - `DATABASE_URL` uses port `6432`.
- Keep `PRISMA_CONNECTION_LIMIT` conservative when pooling is active to avoid queue buildup in transaction mode.
- Practical starting points:
  - app instances: 2 → set `PRISMA_CONNECTION_LIMIT=10` each
  - app instances: 4 → set `PRISMA_CONNECTION_LIMIT=5-8` each
  - reserve at least 20% of PostgreSQL `max_connections` for migrations, maintenance, and admin sessions.

### Backup & Host-Compromise Notes

- Database dumps and volume backups can contain sensitive metadata and ciphertext payloads; protect backups with encryption-at-rest and strict access controls.
- If host disk/volume data (`pgdata`) is unencrypted and host is compromised, DB contents can be copied even without network DB exposure.
- Keep backup artifacts out of git and out of web-served paths.
- Automated backups are scheduled by the worker runtime (`scheduled_backup` job). Do not run an additional backup container in parallel.

### UFW (manual, opt-in, operator-aware)

> The installer intentionally does **not** enable UFW automatically.

Recommended sequence on Ubuntu/Debian hosts:

```bash
# 1) Allow SSH FIRST (use your actual SSH port if not 22)
sudo ufw allow 22/tcp

# 2) Allow web ingress
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# 3) Optional HTTP/3/QUIC
sudo ufw allow 443/udp

# 4) Enable firewall
sudo ufw enable

# 5) Verify
sudo ufw status verbose
sudo ufw status numbered
```

Do **not** open these publicly unless intentionally required:
- `5432/tcp` (PostgreSQL)
- `3000/tcp` (app internal port)
- `6379/tcp` (Redis)

Operational safety:
- Docker and host firewalls can interact in non-obvious ways (NAT/forward chains). Validate effective exposure with external scans after changes.
- If locked out, regain console/KVM access and rollback rules with `sudo ufw disable` (or delete problematic numbered rules).
- Inspect logs via `sudo journalctl -u ufw --since "1 hour ago"` and `sudo dmesg | rg -i ufw`.

Health endpoints:
- Liveness: `GET /api/health/live`
- Readiness: `GET /api/health/ready` (legacy `GET /api/health` remains as readiness)

---


### PWA / Installed App Shell Behavior

- Web visitors opening `/` get the public marketing shell.
- Auth flows are isolated under `/auth/*`.
- The installed PWA starts at `/chat?source=pwa` (manifest `start_url`) so users land directly in the app shell.
- `/chat` is server-guarded: authenticated users see chat; unauthenticated users are redirected to `/auth/login?next=/chat`.
- Login and 2FA completion honor the `next` parameter and return users directly to chat.
- Registration redirects smoothly into login with `next=/chat` to avoid landing-page bounce loops.
- Installed PWA sessions that are not authenticated are routed server-side to `/auth/login?next=/chat` (not the public landing page).

---

## Usage Guide

### First-time bootstrap (production)

1. Complete `Quick Start` or `Manual Installation` (above) and wait for the container health checks to report `healthy`.
2. Open the public URL (`APP_URL`) in a browser — you will land on the marketing page.
3. Navigate to `/auth/login` and sign in with the bootstrap admin credentials:
   - Username: value of `ADMIN_USERNAME`
   - Password: value of `ADMIN_PASSWORD`, **or** the one-time password stored at `./runtime/admin-bootstrap-password` (produced by fresh/reinstall flows)
4. On first login, `ADMIN_BOOTSTRAP_FORCE_PASSWORD_CHANGE=true` will require you to set a new password.
5. Enable TOTP/2FA from **Settings → Security Center** and scan the QR code with any RFC 6238 authenticator (Aegis, Authy, Google Authenticator, etc.).

### Registering end users

- Open **Admin → Users** to invite users, send invite links, or enable self-registration.
- To allow open registration, toggle it in **Admin → Settings → Registration**.
- Invite links are single-use and expire after the configured TTL.

### Sending encrypted messages

1. Open `/chat` after signing in. The browser will generate E2EE key material and store it in IndexedDB on first load.
2. Pick a contact from the sidebar and start a 1:1 conversation — each message is encrypted client-side before it leaves the browser.
3. To create a group, click **New Group**, choose members, and publish. Group E2EE is still transitional (see [Capability Maturity](#capability-maturity)).
4. Attachments are encrypted through the secure upload flow (`/api/upload-secure`) and served via tokenized download URLs.

### Admin operations

- **Moderation**: ban, verify, or demote users from **Admin → Users**.
- **Audit log**: every admin action is recorded with IP, timestamp, and actor.
- **Backups**: the worker runtime schedules a `scheduled_backup` job. Manual backups via `npm run backup` produce a timestamped archive under `BACKUP_OUTPUT_DIR`.
- **Reports / KPIs**: dashboards available at `/admin/reports`.

### Upgrading

```bash
# Re-run the installer in upgrade mode (preserves .env, Caddyfile, compose overrides)
sudo INSTALL_MODE=upgrade INSTALL_REF=<new-release-tag> bash install.sh
```

Or, for a manual upgrade:

```bash
git fetch --tags origin
git checkout <new-release-tag>
npm ci --no-fund --ignore-scripts
npx prisma generate
npm run db:migrate:prod
npm run build
# restart the service (systemd / docker compose / PM2)
```

---

## API & Integrations

### REST API overview

Elahe Messenger ships with a first-class REST API. The full machine-readable spec is served at:

- **OpenAPI JSON**: `GET /api/docs/openapi.json`
- **Interactive docs**: `GET /api/docs`

Key routes:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/login` | Start a username/password login flow |
| `POST` | `/api/2fa` | Verify the TOTP challenge |
| `GET`  | `/api/session` | Introspect the current session |
| `POST` | `/api/password-recovery` | Initiate recovery with recovery questions |
| `GET`  | `/api/messages/search` | Full-text search over accessible conversations |
| `GET`  | `/api/messages/sync` | Delta sync for the chat UI |
| `GET`  | `/api/messages/thread/[messageId]` | Fetch replies in a thread |
| `POST` | `/api/drafts` | Persist encrypted drafts |
| `POST` | `/api/upload-secure` | Encrypted attachment upload |
| `GET`  | `/api/upload-secure/[fileId]` | Tokenized download |
| `POST` | `/api/push/subscribe` | Register a VAPID push subscription |
| `GET`  | `/api/health/live` | Liveness probe |
| `GET`  | `/api/health/ready` | Readiness probe |
| `GET`  | `/api/metrics` | Prometheus-style metrics (requires internal scrape auth) |

### E2EE endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/e2ee/register` | Register identity keys |
| `POST` | `/api/e2ee/register-bundle` | Upload a pre-key bundle |
| `GET`  | `/api/e2ee/prekey-bundle/[userId]` | Fetch a peer's bundle |
| `GET`  | `/api/e2ee/public-keys/[userId]` | Fetch peer public keys |
| `POST` | `/api/e2ee/devices/register` | Register a new device |
| `GET`  | `/api/e2ee/devices` | List registered devices |
| `POST` | `/api/e2ee/sessions/bootstrap` | Bootstrap an E2EE session |
| `GET`  | `/api/e2ee/group-keys` | Fetch group keys |
| `POST` | `/api/e2ee/group-keys/rotate` | Rotate group keys |
| `GET`  | `/api/e2ee/migration-readiness` | Check readiness for E2EE migration |
| `GET`  | `/api/e2ee/runtime-status` | Report runtime E2EE status |

### OAuth / SSO

Elahe Messenger supports optional third-party sign-in through `@auth/core`. Configure any subset of the following providers via environment variables:

```env
# Google
OAUTH_GOOGLE_CLIENT_ID=
OAUTH_GOOGLE_CLIENT_SECRET=

# GitHub
OAUTH_GITHUB_CLIENT_ID=
OAUTH_GITHUB_CLIENT_SECRET=

# Generic OIDC
OAUTH_OIDC_ISSUER=
OAUTH_OIDC_CLIENT_ID=
OAUTH_OIDC_CLIENT_SECRET=
```

The OAuth finalization endpoint is `POST /api/auth/oauth/finalize`. Only configured providers are exposed on the login page.

### Bot platform

Elahe Messenger ships with a built-in bot framework:

```bash
# Register a bot (admin only)
curl -X POST https://chat.example.com/api/bots/register \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-bot","webhookUrl":"https://bot.example.com/hook"}'

# Send a message from a bot
curl -X POST https://chat.example.com/api/bots/<botId>/send \
  -H "Authorization: Bearer <bot-token>" \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"...","content":"Hello from my bot"}'
```

Incoming events are delivered to the bot's webhook (`POST /api/bots/[botId]/webhook`).

### WebRTC calls

Voice and video use WebRTC with optional TURN/STUN relays. Configure:

```env
TURN_URL=turn:turn.example.com:3478
TURN_USERNAME=<turn-user>
TURN_CREDENTIAL=<turn-credential>

NEXT_PUBLIC_TURN_URL=turn:turn.example.com:3478
NEXT_PUBLIC_TURN_USERNAME=<public-turn-user>
NEXT_PUBLIC_TURN_CREDENTIAL=<public-turn-credential>
```

Only the `NEXT_PUBLIC_*` variants are exposed to the browser bundle.

### Object storage

By default, encrypted attachments are stored on the local filesystem at `OBJECT_STORAGE_ROOT`. Swap to an S3-compatible store (AWS S3, MinIO, Wasabi, Cloudflare R2) by implementing/enabling the S3 driver and providing AWS credentials through `@aws-sdk/client-s3` environment variables.

---

## Observability

Elahe Messenger ships instrumentation out of the box.

### Structured logs (Pino)

- JSON logs emitted to stdout (captured by Docker / systemd).
- Log level controlled by `LOG_LEVEL` (default `info`).
- Every error response carries a `requestId` — grep for it to correlate across logs.

### OpenTelemetry tracing

Enable OTLP export with any of these:

```env
OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-collector.example.com
OTEL_SERVICE_NAME=elahe-messenger
OTEL_RESOURCE_ATTRIBUTES=deployment.environment=production
```

Tracing is wired via `@opentelemetry/sdk-node` and instruments HTTP, Prisma, and outbound fetches.

### Metrics

- Prometheus-style metrics endpoint: `GET /api/metrics`
- Health endpoints:
  - Liveness: `GET /api/health/live`
  - Readiness: `GET /api/health/ready` (also exposed as the legacy `GET /api/health`)

### Log rotation

- When running via Docker, configure the host's log driver (`json-file` with `max-size` + `max-file`, or switch to `journald`/`fluentd`).
- When running bare-metal under systemd, rely on `journalctl --vacuum-time=`.

---

## Testing

Elahe Messenger uses Vitest for unit/integration tests and Playwright for end-to-end tests.

```bash
# Run the full Vitest suite (unit + integration)
npm test

# Run only the "unit" project
npm run test -- --project unit

# Run only the "integration" project
npm run test -- --project integration

# Watch mode for development
npm run test:watch

# Playwright end-to-end (requires Playwright browsers installed)
npx playwright install --with-deps
npx playwright test
```

Test projects are declared in `vitest.config.ts`:

- **unit** — default test files under `tests/**/*.test.ts` (excluding `tests/e2e/**`).
- **integration** — installation / deployment smoke tests that validate installer guardrails and compose topology.

The CI pipeline runs both Vitest projects plus a full `npm run build`, Docker image build, `shellcheck` on `install.sh` and `docker-entrypoint.sh`, and deployment smoke tests.

### Security checks in CI

- **CodeQL** static analysis (`.github/workflows/codeql.yml`).
- **Trivy** container image scanning with SARIF upload (`.github/workflows/container-security.yml`).
- **Gitleaks** secret scanning on push/PR (`.github/workflows/secret-scan.yml`).
- **Hadolint** Dockerfile linting (`.github/workflows/hadolint.yml`).
- **Dependabot** for npm, Docker, and GitHub Actions (`.github/dependabot.yml`).

---

## Security

Elahe Messenger is designed with a privacy-first model and explicit trust boundaries:

- **Implemented now**: Direct-message E2EE uses browser-side `ECDH-P256` + `HKDF-SHA256` + `AES-256-GCM`.
- **Not yet shipped**: Do not assume full X3DH/Double Ratchet parity for all paths; group/channel E2EE and advanced ratcheting remain transitional.
- **Server visibility**: Operators can access service metadata (accounts, membership, delivery/audit timestamps, network/session security signals) even when message bodies are ciphertext.
- **Session Security**: Session tokens are HMAC-signed, HttpOnly, SameSite=Strict cookies with optional IP and User-Agent binding; cookie `Secure` is derived from `APP_URL` scheme (or explicit `COOKIE_SECURE` override).
- **2FA/TOTP**: Password step now creates a short-lived pending-login challenge; TOTP verification requires that one-time challenge.
- **Rate Limiting**: Per-IP limits enforced at both the HTTP and WebSocket layers, backed by Redis when available.
- **Draft Privacy**: Server-side draft persistence stores encrypted draft fields only; plaintext `clientDraft` content is not persisted.
- **File Upload Policy**: Secure uploads enforce server allowlist checks by extension + MIME (case-insensitive) and reject MIME mismatches.
- **Audit Logging**: Admin actions are recorded with IP, timestamp, and actor for forensic traceability.

See detailed docs:
- [`docs/crypto-status.md`](./docs/crypto-status.md)
- [`docs/threat-model.md`](./docs/threat-model.md)
- [`docs/runtime-topology.md`](./docs/runtime-topology.md)

For vulnerability disclosures, see [SECURITY.md](./SECURITY.md).

---

## Capability Maturity

| Capability | Status | Notes |
|---|---|---|
| Direct messaging | **Stable** | Core 1:1 messaging path is operational and covered by existing authz checks. |
| Group messaging | **Beta** | Functional, but not E2EE-complete yet. |
| Encrypted attachments | **Beta** | Secure attachment route exists; keep using protected upload/download flows only. |
| Admin tooling | **Stable** | Includes moderation and audit workflows. |
| Push notifications | **Beta** | Production-capable with environment/provider dependencies. |
| Multi-device support | **Experimental** | Device bundle/session model is present but still evolving. |
| Ratcheting / advanced E2EE | **Experimental** | Transitional runtime support exists; do not market as fully completed protocol guarantees. |
| Crypto verification UX | **Planned** | Operator/user-facing verification flows need stronger UX and guidance. |
| Offline reliability | **Beta** | PWA shell and draft/offline queue support exist with network-dependent sync behavior. |

## Crypto Status

See [`docs/crypto-status.md`](./docs/crypto-status.md) for implementation-accurate cryptographic guarantees and known gaps.

## Runtime Topology

See [`docs/runtime-topology.md`](./docs/runtime-topology.md) for runtime separation, startup flow, and future split points.

## Threat Model

See [`docs/threat-model.md`](./docs/threat-model.md) for trust assumptions, metadata visibility, and hardening opportunities.

---

## Project Structure

```
elahe-messenger/
├── app/                    # Next.js App Router pages and API routes
│   ├── actions/            # Server Actions (auth, messages, admin)
│   ├── api/                # REST API route handlers (auth, e2ee, bots, health, metrics, ...)
│   ├── auth/               # Login, register, 2FA, recovery pages
│   ├── chat/               # Chat UI, profile, security center
│   └── admin/              # Admin panel pages
├── components/             # Shared React components
├── lib/                    # Core server-side modules
│   ├── session.ts          # Session management
│   ├── crypto.ts           # E2EE primitives
│   ├── prisma.ts           # Database client singleton
│   ├── rate-limit.ts       # Rate limiting logic
│   ├── local-captcha.ts    # Stateless math captcha
│   ├── logger.ts           # Pino structured logger
│   └── telemetry.ts        # OpenTelemetry setup
├── prisma/                 # Prisma schema and migrations
├── public/                 # Static assets (logo, manifest, service worker)
├── scripts/                # Utility scripts (db-setup, backup, validate-env)
├── tests/                  # Vitest unit + integration tests
│   └── e2e/                # Playwright end-to-end specs
├── docs/                   # Design docs (crypto status, threat model, topology)
├── .github/                # GitHub Actions workflows and Dependabot config
├── server.ts               # Custom Node.js server (Socket.IO)
├── instrumentation.ts      # Next.js instrumentation hook (OpenTelemetry)
├── next.config.ts          # Next.js config (Workbox, standalone output)
├── docker-compose.yml      # Development Compose
├── compose.prod.yaml       # Production override for docker-compose.yml
├── compose.split.yaml      # Optional split-runtime topology override
├── Dockerfile              # Multi-stage production image
├── docker-entrypoint.sh    # Runtime bootstrap (env validation, migrations, server)
└── install.sh              # One-line production installer
```

---

## Contributing

Contributions are welcome. Please follow these steps:

1. Fork the repository and create a feature branch: `git checkout -b feat/my-feature`
2. Follow the existing code style — run `npm run format` and `npm run lint` before committing
3. Write or update tests where applicable: `npm test`
4. Commit using [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, etc.
5. Open a Pull Request against `main` with a clear description of changes

### Development Commands

```bash
npm run dev          # Start dev server with hot-reload
npm run build        # Production build
npm run lint         # ESLint check (warnings fail the command)
npm run format       # Prettier auto-format
npm test             # Run Vitest test suite
npm run db:init:dev   # SQLite/dev bootstrap
npm run db:migrate:prod # PostgreSQL/prod migrations (fail-fast)
npm run backup       # Create database backup archive
```

---

## License

Released under the [MIT License](./LICENSE).

Copyright © 2026 Elahe Messenger Contributors.

---

<p align="center">
  Built with ❤️ by <a href="https://github.com/ehsanking">@ehsanking</a> and contributors.
  <br/>
  <a href="https://t.me/kingithub">t.me/kingithub</a>
</p>

---

## Donate

If this project helps you, you can support its maintenance:

- **USDT (TRC20 / Tether):** `TKPswLQqd2e73UTGJ5prxVXBVo7MTsWedU`
- **TRON (TRX):** `TKPswLQqd2e73UTGJ5prxVXBVo7MTsWedU`
