> This README is derived from `README.md` (source of truth).

# KiNGChat 3.3 👑
### Den sikre beskedtjeneste til privatlivets tidsalder

[Engelsk version](README.md)

KiNGChat er en open source beskedapp med end‑to‑end kryptering. Frontenden er bygget med Next.js og React, backend kører på Node.js med Prisma og PostgreSQL til data og Socket.IO til realtidsbeskeder. Alle beskeder krypteres i browseren via Web Crypto API (ECDH‑P256 nøgleudveksling, HKDF‑SHA256 og AES‑256‑GCM), og kun modtageren kan dekryptere dem.

## Funktioner

- **End‑to‑end kryptering:** Nøgler udveksles via ECDH, afledes med HKDF og beskeder krypteres med AES‑256‑GCM.
- **Realtidschat:** Øjeblikkelig levering af beskeder, grupper og kanaler via Socket.IO med skalering gennem Redis.
- **Kontaktsystem:** Søg efter brugere via brugernavn eller ID og føj dem til din kontaktliste.
- **Grupper og kanaler:** Opret offentlige eller private grupper og kanaler med invitationslinks og roller (Ejer, Administrator, Moderator, Medlem).
- **To‑faktor‑godkendelse:** Understøtter TOTP (Google Authenticator, Authy) for ekstra sikkerhed.
- **Data og historik:** Alle beskeder gemmes i PostgreSQL og historikken kan indlæses med pagination.
- **Adminpanel:** Administrer brugere, indstillinger, logfiler og driftsopgaver.
- **PWA:** Installer appen på mobil eller skrivebord og brug den offline.
- **Installationsscript:** Ét linje script der udfører tjek, genererer hemmeligheder, opsætter Docker og Caddy og kører migrationer.
- **Docker deployment:** Officiel Dockerfile og docker‑compose med automatisk SSL.
- **Moderne brugerflade:** Pæn UI med Tailwind CSS, Lucide ikoner og animationer.

## Hurtig installation
```bash
curl -fsSL https://raw.githubusercontent.com/ehsanking/KiNGChat/main/install.sh | bash
```

## Manuel installation
```bash
git clone https://github.com/ehsanking/KiNGChat.git
cd KiNGChat
cp .env.example .env
npm install --legacy-peer-deps
npm run build
npm test # valgfrit
```
Rediger `.env` og start derefter:
```bash
npm run dev
npm start
docker compose up -d --build
```

### Brug af mirror
Hvis adgangen til npm-registret er begrænset, kan du konfigurere et mirror:
```bash
npm config set registry https://registry.npmmirror.com
yarn config set registry https://registry.npmmirror.com
```

## Licens
Dette projekt er frigivet under MIT-licensen.