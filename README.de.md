> This README is derived from `README.md` (source of truth).

# KiNGChat 3.3 👑
### Der sichere Messenger für das Zeitalter der Privatsphäre

[Englische Version](README.md)

KiNGChat ist ein quelloffener Messenger mit Ende‑zu‑Ende‑Verschlüsselung. Er basiert auf Next.js und React im Frontend, Node.js im Backend und nutzt Prisma und PostgreSQL zur Datenspeicherung sowie Socket.IO für Echtzeitkommunikation. Alle Nachrichten werden im Browser mit der Web Crypto API (ECDH‑P256‑Schlüsselaustausch, HKDF‑SHA256‑Ableitung und AES‑256‑GCM‑Verschlüsselung) verschlüsselt und können nur vom vorgesehenen Empfänger entschlüsselt werden.

## Funktionen

- **Ende‑zu‑Ende‑Verschlüsselung:** Schlüssel werden über ECDH ausgetauscht, per HKDF abgeleitet und Nachrichten mit AES‑256‑GCM verschlüsselt.
- **Echtzeit‑Chat:** Sofortige Zustellung von Nachrichten, Gruppen und Kanälen über Socket.IO, skalierbar mit Redis.
- **Kontaktsystem:** Suche und füge Benutzer anhand von Benutzernamen oder ID zu deiner Kontaktliste hinzu.
- **Gruppen und Kanäle:** Erstelle öffentliche oder private Gruppen und Kanäle mit Einladungslinks und Rollen (Eigentümer, Administrator, Moderator, Mitglied).
- **Zwei‑Faktor‑Authentifizierung:** Unterstützung für TOTP (Google Authenticator, Authy) zur zusätzlichen Sicherheit.
- **Persistenz und Verlauf:** Alle Nachrichten werden in PostgreSQL gespeichert und können seitenweise geladen werden.
- **Admin‑Panel:** Verwaltung von Benutzern, Einstellungen, Protokollen und Betriebsaufgaben.
- **PWA:** Installiere die App auf deinem Telefon oder Desktop und nutze sie offline.
- **Installationsscript:** Ein Einzeiler, der Prüfungen durchführt, Schlüssel generiert, Docker und Caddy einrichtet und Migrationen ausführt.
- **Docker‑Deployment:** Offizielles Dockerfile und docker‑compose mit automatischem SSL.
- **Moderne Benutzeroberfläche:** Ansprechendes UI mit Tailwind CSS, Lucide‑Icons und Animationen.

## Schnelle Installation
```bash
curl -fsSL https://raw.githubusercontent.com/ehsanking/KiNGChat/main/install.sh | bash
```

## Manuelle Installation
```bash
git clone https://github.com/ehsanking/KiNGChat.git
cd KiNGChat
cp .env.example .env
npm install --legacy-peer-deps
npm run build
npm test # optional
```
Bearbeite `.env` und starte dann:
```bash
npm run dev
npm start
docker compose up -d --build
```

### Spiegelserver nutzen
Falls in deinem Land der Zugriff auf das npm‑Registry eingeschränkt ist, kannst du ein Spiegel‑Registry konfigurieren:
```bash
npm config set registry https://registry.npmmirror.com
yarn config set registry https://registry.npmmirror.com
```

## Lizenz
Dieses Projekt steht unter der MIT‑Lizenz.