<div align="center">

<img src="./public/logo.png" alt="KiNGChat Logo" width="128" height="128" />

# KiNGChat 👑
### The Secure Messenger for the Private Era

[![License: MIT](https://img.shields.io/badge/License-MIT-gold.svg)](LICENSE)  
[![Version](https://img.shields.io/badge/Version-3.1-blue.svg)]()
[![Status](https://img.shields.io/badge/Status-Production--Ready-emerald.svg)]()

[English](README.md) | [فارسی](README.fa.md) | [Русский](README.ru.md) | [العربية](README.ar.md) | [中文](README.zh.md) | [Español](README.es.md) | [ไทย](README.th.md) | [Português](README.pt.md) | [Deutsch](README.de.md) | [Dansk](README.da.md) | [Svenska](README.sv.md) | [Türkçe](README.tr.md)

</div>

## Overview

KiNGChat is an open source, end‑to‑end encrypted messenger built for privacy.  It combines the power of [Next.js](https://nextjs.org/) and [React](https://react.dev/) on the frontend with a Node.js backend, using [Prisma](https://www.prisma.io/) and PostgreSQL for data persistence and [Socket.IO](https://socket.io/) for real‑time communications.  All messages are encrypted in the browser using the Web Crypto API (ECDH‑P256 key exchange, HKDF‑SHA256, AES‑256‑GCM) and are only decrypted by the intended recipient.  You own your keys — the server never sees your private keys.

### Key Features

- **End‑to‑End Encryption (E2EE):**  Built‑in cryptography ensures that only you and your contacts can read your messages.  Keys are exchanged via ECDH (P‑256), derived with HKDF, and messages are encrypted using AES‑256‑GCM.
- **Real‑Time Chat:**  Messages, group conversations and channels are delivered instantly via Socket.IO.  Horizontal scaling is supported through the Redis adapter.
- **Contacts System:**  Search for people by username or numeric ID and add them to your contacts list.  Contacts persist across sessions.
- **Groups & Channels:**  Create WhatsApp‑style groups and public or private channels with invite links.  Assign roles (Owner, Admin, Moderator, Member), mute participants and manage membership.
- **Two‑Factor Authentication (2FA):**  Add an extra layer of security using TOTP (Google Authenticator, Authy or compatible apps).  Users can enable, verify and disable 2FA in their profile settings.
- **Message Persistence & History:**  Messages and attachments are stored in a PostgreSQL database via Prisma and loaded on demand with cursor‑based pagination.
- **Admin Panel:**  A built‑in administration panel provides user management, system configuration, audit logging and operational dashboards.  Change registration policies, ban or unban users, set upload limits and review moderation actions.
 - **Progressive Web App (PWA) \(experimental\):**  A PWA mode was explored in earlier versions.  Offline caching and install prompts are still available in limited form, but the dedicated PWA plugin has been removed as of v3.1.  Native‑like packaging guides are retained for reference.
- **Professional Installer:**  A one‑liner installation script performs preflight checks, generates secrets, configures Docker and Caddy, performs database migrations and launches the stack.  Everything is automatic.
- **Docker Deployment:**  Official Dockerfile and docker-compose configurations are provided for easy production deployment with SSL termination by Caddy.
- **Modern UX:**  Built with Tailwind CSS, Lucide icons and motion animations, the interface is clean, responsive and accessible.

### Technology Stack

| Layer           | Technologies & Frameworks                                         |
|-----------------|--------------------------------------------------------------------|
| **Frontend**    | Next.js 15, React 19, TypeScript, Tailwind CSS, PWA offline caching |
| **Backend**     | Node.js (server runtime), Socket.IO for WebSocket messaging        |
| **Database**    | PostgreSQL via Prisma ORM with migrations and schema generation    |
| **Real‑Time**   | Socket.IO with optional Redis adapter for multi‑instance scaling    |
| **Security**    | Web Crypto API (ECDH, HKDF, AES‑GCM), Argon2 password hashing, TOTP |
| **Infrastructure** | Docker, Docker Compose, Caddy reverse proxy with automatic HTTPS |
| **Additional**  | Web push notifications, IDB for key storage, QR code generation, P‑Queue for concurrency |

## Installation

### Quick Install (One‑Liner)

Deploy KiNGChat instantly using the official installer script:

```bash
curl -fsSL https://raw.githubusercontent.com/ehsanking/KiNGChat/main/install.sh | bash
```

The script performs a preflight system check, installs dependencies (Docker, Docker Compose, Certbot if needed), clones the KiNGChat repository, generates secure secrets, builds the images and runs the stack with automatic SSL via Caddy.  At the end of installation it prints the generated admin password.

### Manual Installation

If you prefer manual setup:

```bash
# Clone the repository
git clone https://github.com/ehsanking/KiNGChat.git
cd KiNGChat

# Create your environment file
cp .env.example .env

# Install dependencies
npm install --legacy-peer-deps

# Build the Next.js application
npm run build

# Run tests (optional)
npm test
```

Edit `.env` to configure your database (`DATABASE_URL`), JWT and encryption secrets, admin credentials and other environment variables.  When ready, start the application:

```bash
# Start in development mode
npm run dev

# OR run in production with Node.js
npm start

# OR use Docker Compose
docker compose up -d --build
```

### Using Package Mirrors

Due to internet restrictions in some regions, retrieving dependencies from the default `registry.npmjs.org` may be blocked.  If `npm install` fails because of sanctions or connectivity issues, you can point NPM or Yarn to a mirror:

```bash
# Use the official npm registry (default)
npm config set registry https://registry.npmjs.org/

# Set a mirror (for example, the Chinese mirror)
npm config set registry https://registry.npmmirror.com

# For Yarn
yarn config set registry https://registry.npmmirror.com
```

Alternatively, you can configure a private proxy or download prebuilt Docker images published on the GitHub Container Registry.

## Contributing

Pull requests are welcome!  Please open an issue to discuss major changes.  For local development you can run `npm run dev` with a PostgreSQL database accessible via `DATABASE_URL`.  Coding guidelines include TypeScript, ESLint, Prettier and Vitest tests.  See `PHASE4_ROADMAP.md` for planned improvements.

## License

KiNGChat is released under the [MIT License](LICENSE).  See the LICENSE file for more information.

## Acknowledgements

KiNGChat is built by [@ehsanking](https://github.com/ehsanking) and contributors.  It leverages open source projects including Next.js, Prisma, Socket.IO, Tailwind CSS and many more.  We thank the authors of these tools for their incredible work.