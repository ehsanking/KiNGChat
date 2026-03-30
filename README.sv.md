<p align="center">
  <img src="./public/readme-banner.png" alt="Elahe Messenger" width="800" />
</p>

<p align="center">
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <img alt="Version" src="https://img.shields.io/badge/version-1.0.0-gold">
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

## Översikt

**Elahe Messenger** är en öppen källkod, självhostad meddelandeplattform med end-to-end-kryptering (E2EE), utformad för team och gemenskaper som kräver full kontroll över sina data. Byggd med **Next.js 15**, **React 19**, **Socket.IO** och **Prisma ORM** med **PostgreSQL**.

> Servern ser aldrig klartexten i meddelanden. Alla kryptografiska operationer utförs i webbläsaren.

---

## Funktioner

| Kategori | Möjligheter |
|---|---|
| 🔐 **Kryptering** | Browser-side E2EE (ECDH-P256, HKDF-SHA256, AES-256-GCM) |
| 💬 **Meddelanden** | DMs, grupper, kanaler, reaktioner, redigering, utkast |
| 👥 **Socialt** | Kontakthantering, gemenskaper, inbjudningslänkar |
| 🛡️ **Säkerhet** | TOTP/2FA, hastighetsbegränsning, lokal matematik-captcha, granskningslogg |
| 📦 **DevOps** | Docker Compose, enradsinstallation, automatisk SSL via Caddy |
| 📱 **PWA** | Installerbar på vilken enhet som helst |

---

## Arkitektur (algoritm + visuellt flödesschema)

### End-to-end-algoritm för meddelandeflöde

1. **Autentisering och sessionsbindning**: användaren loggar in och säker cookiesession skyddas av CSRF-/origin-kontroller.
2. **Ladda klientnycklar**: E2EE-nycklar skapas/laddas i webbläsaren (Web Crypto + IndexedDB).
3. **Kryptering på klienten**: meddelandet krypteras före sändning; servern behöver inte klartext.
4. **Realtidssändning**: krypterad payload skickas via HTTPS/WSS till `server.ts` och Socket.IO.
5. **Säkerhetskontroller på servern**: medlemskap, behörighet, rate limiting, anti-missbruk och revisionslogg tillämpas.
6. **Lagring och distribution**: krypterad payload sparas via Prisma i PostgreSQL; valfri Redis skalar Pub/Sub.
7. **Leverans till mottagarenheter**: behöriga mottagarsessioner får ciphertext i realtid.
8. **Dekryptering endast hos mottagaren**: mottagarens webbläsare dekrypterar lokalt och uppdaterar levererad/läst-status.

### Visuellt flöde

```mermaid
flowchart TD
  A[Användarinloggning + säker session] --> B[Ladda E2EE-nycklar i webbläsaren]
  B --> C[Skriv meddelande]
  C --> D[Kryptering på klienten]
  D --> E[Skicka ciphertext via HTTPS/WSS]
  E --> F[server.ts + Next.js + Socket.IO]
  F --> G{Kontroller: medlemskap/rate/behörighet}
  G -->|Tillåtet| H[(PostgreSQL via Prisma)]
  G -->|Tillåtet| I[(Redis valfri: Pub/Sub)]
  H --> J[Realtidsleverans till mottagare]
  I --> J
  J --> K[Mottagarwebbläsare dekrypterar]
  K --> L[Uppdatera levererad/läst-status]
```

---

## Krav

| Beroende | Minversion |
|---|---|
| Node.js | 20 LTS |
| npm | 10+ |
| PostgreSQL | 15+ |
| Redis | 6+ (valfritt) |
| Docker + Compose | v2+ |

---

## Snabbstart

```bash
curl -fsSL https://raw.githubusercontent.com/ehsanking/ElaheMessenger/main/install.sh | ( [ "$(id -u)" -eq 0 ] && bash || sudo bash )
```

### Manuell installation

```bash
git clone https://github.com/ehsanking/ElaheMessenger.git
cd ElaheMessenger
cp .env.example .env.local
npm install && npx prisma migrate deploy
npm run build && npm start
```

---

## Konfiguration

| Variabel | Standard | Beskrivning |
|---|---|---|
| `DATABASE_URL` | SQLite (bara dev) | PostgreSQL-anslutningssträng |
| `APP_URL` | `http://localhost:3000` | Offentlig URL |
| `JWT_SECRET` | Automatisk | Session-token signeringsnyckel |
| `ADMIN_PASSWORD` | Automatisk | **Ändra efter första inloggningen** |

---

## Licens

Utgiven under [MIT-licensen](./LICENSE). Copyright © 2025 Elahe Messenger Contributors.

<p align="center">Skapad med ❤️ av <a href="https://github.com/ehsanking">@ehsanking</a> · <a href="https://t.me/kingithub">t.me/kingithub</a></p>

---

## Production Security Update (2026-03)

For critical production safety guidance, see the English README sections:
- **Production Networking Policy** (public vs private ports)
- **Database Hardening** (`POSTGRES_*` bootstrap role vs `APP_DB_*` runtime role)
- **UFW manual, opt-in setup** (never auto-enable before allowing SSH)

Keep PostgreSQL (`5432`) internal-only by default.

---

## Donate

If this project helps you, you can support its maintenance:

- **USDT (TRC20 / Tether):** `TKPswLQqd2e73UTGJ5prxVXBVo7MTsWedU`
- **TRON (TRX):** `TKPswLQqd2e73UTGJ5prxVXBVo7MTsWedU`

