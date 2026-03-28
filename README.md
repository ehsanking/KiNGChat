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

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.fa.md">فارسی</a> |
  <a href="README.ru.md">Русский</a> |
  <a href="README.ar.md">العربية</a> |
  <a href="README.zh.md">中文</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.th.md">ไทย</a> |
  <a href="README.pt.md">Português</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.da.md">Dansk</a> |
  <a href="README.sv.md">Svenska</a> |
  <a href="README.tr.md">Türkçe</a>
</p>

---

## Overview

**Elahe Messenger** is an open-source, self-hosted, end-to-end encrypted messaging platform built for teams, communities, and individuals who demand full control over their data. It combines the power of **Next.js 15**, **React 19**, and **Socket.IO** on a **Node.js** runtime, backed by **Prisma ORM** with **PostgreSQL** (or SQLite for local development) and optionally scaled horizontally via **Redis**.

> The server never sees plaintext messages. All cryptographic operations are performed client-side using the Web Crypto API.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Manual Installation](#manual-installation)
- [Configuration](#configuration)
- [Docker Deployment](#docker-deployment)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)

---

## Features

| Category | Capabilities |
|---|---|
| 🔐 **Encryption** | Browser-side E2EE (ECDH-P256, HKDF-SHA256, AES-256-GCM), forward-secrecy ratchet |
| 💬 **Messaging** | Real-time DMs, group chats, channels, message reactions, edits, drafts |
| 👥 **Social** | Contact management, community groups, invite links, member roles |
| 🛡️ **Security** | TOTP/2FA, session binding, rate limiting, local math captcha, audit logs |
| 🧭 **Admin** | User management, ban/verify controls, settings panel, observability dashboard |
| 📦 **DevOps** | Docker Compose variants, one-line installer, Caddy auto-SSL, health checks |
| 📱 **PWA** | Installable app shell with cached static assets (chat sync still requires network) |
| 🔔 **Push** | VAPID web-push notifications, optional Firebase FCM fallback |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Browser (Client)                    │
│  Next.js 15 (App Router) · React 19 · Tailwind CSS 4   │
│  Web Crypto API · Socket.IO Client · IndexedDB (E2EE)   │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS / WSS
┌──────────────────────▼──────────────────────────────────┐
│                  Node.js Server (server.ts)              │
│  Next.js Request Handler · Socket.IO · Background Queue  │
└──────┬──────────────────────────────────────┬───────────┘
       │                                      │
┌──────▼──────┐                    ┌──────────▼──────────┐
│  PostgreSQL  │                    │  Redis (optional)   │
│  via Prisma  │                    │  Pub/Sub · Queue    │
└─────────────┘                    └─────────────────────┘
```

**Key design principles:**
- **Zero-trust server**: private keys never leave the browser
- **Stateless auth**: signed session cookies, no server-side session store required
- **Horizontal scaling**: Redis adapter for Socket.IO cluster mode
- **Graceful degradation**: SQLite fallback for development; Redis is optional

---

## Requirements

| Dependency | Minimum Version | Notes |
|---|---|---|
| Node.js | 20 LTS | Required for native crypto APIs |
| npm | 10+ | Package management |
| PostgreSQL | 15+ | Production database |
| Redis | 6+ | Optional; enables clustering |
| Docker + Compose | v2+ | Recommended for production |

---

## Quick Start

### Installer (Linux, safer flow)

```bash
# 1) Download installer
curl -fsSL -o install.sh https://raw.githubusercontent.com/ehsanking/ElaheMessenger/main/install.sh

# 2) (Optional) Inspect installer before running
less install.sh

# 3) Run explicitly as root
sudo bash install.sh
```

The installer now supports explicit modes:
1. **Fresh install** (new deployment)
2. **Upgrade** (safe in-place update, preserves `.env` secrets/data)
3. **Reinstall** (backs up existing directory first, then re-installs)

Installer safety behavior:
- Prompts for a **source ref strategy** (latest tag recommended, or explicit tag/commit); mutable `main` head is still available but warned.
- Preserves operator-managed config by default on upgrade (`.env`, `Caddyfile`, compose overrides). Regeneration happens only when explicitly selected.
- Upgrade now prompts for proxy behavior: **preserve existing proxy config** (default) or **regenerate proxy config** (for ingress/domain/IP changes).
- Preserves existing production secrets on upgrade (`POSTGRES_*`, `APP_DB_*`, `DATABASE_URL`, auth/encryption/download secrets, admin credentials) unless you explicitly change values.
- Enforces database role separation: bootstrap role (`POSTGRES_*`) for DB provisioning and least-privilege runtime role (`APP_DB_*`) for the app `DATABASE_URL`.
- Creates timestamped upgrade backups (`.env`, `Caddyfile`, compose files) before update steps.
- Aborts upgrades when git sync fails or the worktree is dirty (no implicit `rm -rf` fallback).
- Uses Caddy on `:80/:443`; in IP-only mode the generated `APP_URL` uses `http://<server-ip>` (no internal `:3000` mismatch).
- Never prints bootstrap admin password in terminal output; auto-generated credentials are written once to a local secrets file with restrictive permissions.
- Verifies post-launch health in explicit phases: container health, local reverse-proxy routing, and external DNS/TLS readiness guidance.
- Fails install when local reverse-proxy routing does not work, and only warns for external DNS/TLS propagation uncertainty.
- Source trust defaults to a pinned tag when available; mutable branch-head installs are opt-in and explicitly warned during installer prompts.
- `ADMIN_USERNAME`/`ADMIN_PASSWORD` are create-only by default; if `ADMIN_BOOTSTRAP_RESET_EXISTING=true` is used, reset is consumed once per credential set (not repeated on every restart).
- Does **not** auto-enable UFW; firewall changes remain operator-driven.

---

## Manual Installation

```bash
# 1. Clone the repository
git clone https://github.com/ehsanking/ElaheMessenger.git
cd ElaheMessenger

# 2. Copy environment template
cp .env.example .env

# 3. Edit .env — at minimum set:
#    DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, APP_URL

# 4. Install dependencies (generates Prisma client automatically)
npm install

# 5. Apply database migrations
npx prisma migrate deploy
# or for development:
npx prisma db push

# 6. Build for production
npm run build

# 7. Start
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
| `DATABASE_URL` | SQLite (dev only) | PostgreSQL connection string for production |
| `POSTGRES_USER` | *(none)* | Bootstrap/admin PostgreSQL role (provisioning only) |
| `POSTGRES_PASSWORD` | *(none)* | Bootstrap/admin PostgreSQL password |
| `POSTGRES_DB` | `elahe` | PostgreSQL database name |
| `APP_DB_USER` | *(none)* | Least-privilege runtime DB user for the app |
| `APP_DB_PASSWORD` | *(none)* | Least-privilege runtime DB password |
| `APP_URL` | `http://localhost:3000` | Public base URL of the application |
| `NODE_ENV` | `development` | Set to `production` for production builds |
| `PORT` | `3000` | HTTP server port |

### Security *(auto-generated on first run)*

| Variable | Description |
|---|---|
| `JWT_SECRET` | HMAC-SHA256 signing secret for session tokens (≥ 32 chars) |
| `ENCRYPTION_KEY` | AES encryption key for sensitive fields |
| `ADMIN_USERNAME` | Initial admin username (required; no default) |
| `ADMIN_PASSWORD` | Initial admin password — **change immediately after first login** |

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

> Security note: define production credentials explicitly via `.env.production` (or Docker secrets) before startup.

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
- `DATABASE_URL` should point to `APP_DB_USER`, not the bootstrap account.
- Installer provisions and grants runtime role permissions required for Prisma migrations (`migrate deploy`) without granting superuser-like privileges.
- Treat both bootstrap and runtime DB secrets as sensitive; rotate and store with least access (prefer secret manager or Docker secrets over plaintext files where possible).
- `SESSION_SECRET` is a dedicated session-signing secret and must not be reused as a fallback for unrelated security domains.

### Backup & Host-Compromise Notes

- Database dumps and volume backups can contain sensitive metadata and ciphertext payloads; protect backups with encryption-at-rest and strict access controls.
- If host disk/volume data (`pgdata`) is unencrypted and host is compromised, DB contents can be copied even without network DB exposure.
- Keep backup artifacts out of git and out of web-served paths.

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

## Security

Elahe Messenger is designed with a **privacy-first, zero-trust** philosophy:

- **End-to-End Encryption**: Messages are encrypted in the browser before transmission using `ECDH-P256` key agreement, `HKDF-SHA256` key derivation, and `AES-256-GCM` authenticated encryption.
- **Server Blindness**: The server stores only ciphertext. It cannot read message content.
- **Session Security**: Session tokens are HMAC-signed, HttpOnly, SameSite=Strict cookies with optional IP and User-Agent binding.
- **2FA/TOTP**: RFC 6238 compliant one-time passwords via any standard authenticator app.
- **Rate Limiting**: Per-IP limits enforced at both the HTTP and WebSocket layers, backed by Redis when available.
- **Audit Logging**: Admin actions are recorded with IP, timestamp, and actor for forensic traceability.

For vulnerability disclosures, see [SECURITY.md](./SECURITY.md).

---

## Project Structure

```
elahe-messenger/
├── app/                    # Next.js App Router pages and API routes
│   ├── actions/            # Server Actions (auth, messages, admin)
│   ├── api/                # REST API route handlers
│   ├── auth/               # Login, register, 2FA pages
│   ├── chat/               # Chat UI and profile pages
│   └── admin/              # Admin panel pages
├── components/             # Shared React components
├── lib/                    # Core server-side modules
│   ├── session.ts          # Session management
│   ├── crypto.ts           # E2EE primitives
│   ├── prisma.ts           # Database client singleton
│   ├── rate-limit.ts       # Rate limiting logic
│   └── local-captcha.ts    # Stateless math captcha
├── prisma/                 # Prisma schema and migrations
├── public/                 # Static assets (logo, manifest, SW)
├── scripts/                # Utility scripts (db-setup, backup)
├── server.ts               # Custom Node.js server (Socket.IO)
├── docker-compose.yml      # Development Compose
├── compose.prod.yaml       # Production override for docker-compose.yml
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
npm run lint         # ESLint check
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
