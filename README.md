<p align="center">
  <img src="./public/logo.png" alt="KiNGChat logo" width="120" height="120" />
</p>

<h1 align="center">KiNGChat 3.3 👑</h1>
<p align="center"><strong>Privacy-first, self-hosted messaging platform with end-to-end encryption.</strong></p>

<p align="center">
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <img alt="Version" src="https://img.shields.io/badge/version-3.3.0-gold">
  <img alt="Stack" src="https://img.shields.io/badge/stack-Next.js%2015%20%7C%20Prisma%20%7C%20PostgreSQL-111827">
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

## What is KiNGChat?

**KiNGChat 3.3** is an open-source messenger designed for teams and communities that need control, privacy, and self-hosted reliability.

- **Frontend:** Next.js 15 + React 19
- **Backend:** Node.js + Socket.IO
- **Data layer:** Prisma + PostgreSQL
- **Security:** Browser-side E2EE primitives (ECDH-P256, HKDF-SHA256, AES-256-GCM)
- **Ops:** Docker Compose, production-safe scripts, observability/admin pages

> The server never requires client private keys for message encryption/decryption flows.

---

## Core Features

- 🔐 **End-to-end encryption (E2EE)** with modern Web Crypto primitives
- 💬 **Real-time messaging** for DMs, groups, and channels
- 👥 **Contacts and community management** (invite links, member roles)
- 🧭 **Admin panel** (users, reports, settings, audit/observability)
- 🛡️ **Security controls** (2FA/TOTP, session checks, captcha, rate limits)
- 📦 **Self-hosted deployment** (Dockerfiles + compose variants)
- 📱 **PWA support** (install prompt and service-worker based capabilities)

---

## Quick Start (One-Line Installer)

```bash
curl -fsSL https://raw.githubusercontent.com/ehsanking/KiNGChat/main/install.sh | bash
```

The installer runs preflight checks, prepares secrets, configures containers, and starts the stack.

---

## Manual Setup

### Requirements

- Node.js 20+
- npm 10+
- PostgreSQL 15+
- (Optional) Redis for scale-out socket adapters

### Steps

```bash
git clone https://github.com/ehsanking/KiNGChat.git
cd KiNGChat
cp .env.example .env
npm install
npx prisma generate
npm run build
npm test
npm start
```

For development:

```bash
npm run dev
```

---

## Docker Deployment

```bash
docker compose up -d --build
```

Production-focused alternatives are also available (`compose.prod.yaml`, `compose_prod_full.yml`, `Dockerfile.prod`).

---

## Project Structure

```text
app/                 # Next.js App Router pages, server actions, API routes
components/          # Reusable UI blocks
lib/                 # Security, messaging, sockets, runtime services
prisma/              # Database schema and migrations
scripts/             # Installer, diagnostics, maintenance scripts
tests/               # Vitest test suites
```

---

## Security Notes

- Read [`SECURITY.md`](./SECURITY.md) before public deployments.
- Review production hardening docs:
  - [`PRODUCTION_HARDENING.md`](./PRODUCTION_HARDENING.md)
  - [`PHASEA_PRODUCTION_HARDENING.md`](./PHASEA_PRODUCTION_HARDENING.md)

---

## Contributing

1. Fork the repo and create a feature branch.
2. Run tests and build locally.
3. Open a PR with a clear summary and risk notes.

Useful commands:

```bash
npm run test
npm run build
npm run lint
```

---

## Disclaimer

KiNGChat is provided **"as is"** without warranties of any kind.

- You are solely responsible for secure deployment, backups, key management, and legal compliance in your jurisdiction.
- The maintainers are not liable for data loss, misconfiguration, service interruption, or security incidents in self-hosted environments.
- Always run security reviews and penetration tests before production use.

---

## Donate

If KiNGChat helps your team, you can support continued development:

- **Tether (USDT):** `TKPswLQqd2e73UTGJ5prxVXBVo7MTsWedU`
- **TRON (TRX):** `TKPswLQqd2e73UTGJ5prxVXBVo7MTsWedU`

Copy-ready format:

```text
USDT (Tether): TKPswLQqd2e73UTGJ5prxVXBVo7MTsWedU
TRON (TRX):    TKPswLQqd2e73UTGJ5prxVXBVo7MTsWedU
```


---

## License

Released under the [MIT License](./LICENSE).

## Maintainers

Built and maintained by [@ehsanking](https://github.com/ehsanking) and contributors.
