> This README is derived from `README.md` (source of truth).

# KiNGChat 3.3 👑
### Den säkra meddelandetjänsten för integritetens era

[Engelsk version](README.md)

KiNGChat är en öppen källkods‑meddelandeapp med end‑to‑end kryptering. Frontend byggs med Next.js och React, backend körs på Node.js och använder Prisma och PostgreSQL för datalagring samt Socket.IO för realtidskommunikation. Alla meddelanden krypteras i webbläsaren via Web Crypto API (ECDH‑P256, HKDF‑SHA256 och AES‑256‑GCM) och kan endast dekrypteras av mottagaren.

## Funktioner

- **End‑to‑end kryptering:** Nycklar utbyts via ECDH, härleds med HKDF och meddelanden krypteras med AES‑256‑GCM.
- **Realtidschatt:** Omedelbar leverans av meddelanden, grupper och kanaler genom Socket.IO med skalning via Redis.
- **Kontaktsystem:** Sök efter användare med användarnamn eller ID och lägg till dem i kontaktlistan.
- **Grupper och kanaler:** Skapa offentliga eller privata grupper och kanaler med inbjudningslänkar och roller (Ägare, Administratör, Moderator, Medlem).
- **Tvåfaktorsautentisering:** Stöd för TOTP (Google Authenticator, Authy) för ökad säkerhet.
- **Lagring och historik:** Alla meddelanden sparas i PostgreSQL och historik kan laddas med sidpaginering.
- **Administrationspanel:** Hantera användare, inställningar, loggar och driftuppgifter.
- **PWA:** Installera appen på mobil eller dator och använd den offline.
- **Installationsskript:** Ett enradigt skript som gör kontroller, genererar hemligheter, konfigurerar Docker och Caddy och kör migreringar.
- **Docker‑distribution:** Officiell Dockerfile och docker‑compose med automatisk SSL.
- **Modern UI:** Snyggt gränssnitt med Tailwind CSS, Lucide‑ikoner och animationer.

## Snabb installation
```bash
curl -fsSL https://raw.githubusercontent.com/ehsanking/KiNGChat/main/install.sh | bash
```

## Manuell installation
```bash
git clone https://github.com/ehsanking/KiNGChat.git
cd KiNGChat
cp .env.example .env
npm install --legacy-peer-deps
npm run build
npm test # valfritt
```
Redigera `.env` och starta sedan:
```bash
npm run dev
npm start
docker compose up -d --build
```

### Använda spegelservrar
Om åtkomsten till npm‑registret är begränsad i ditt land kan du ställa in en spegel:
```bash
npm config set registry https://registry.npmmirror.com
yarn config set registry https://registry.npmmirror.com
```

## Licens
Detta projekt släpps under MIT‑licensen.