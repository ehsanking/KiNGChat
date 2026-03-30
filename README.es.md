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

## Descripción general

**Elahe Messenger** es una plataforma de mensajería de código abierto, autoalojada y con cifrado de extremo a extremo (E2EE), diseñada para equipos y comunidades que exigen control total sobre sus datos. Construida con **Next.js 15**, **React 19**, **Socket.IO** y **Prisma ORM** con **PostgreSQL**.

> El servidor nunca ve el texto plano de los mensajes. Todas las operaciones criptográficas se realizan en el navegador.

---

## Características

| Categoría | Capacidades |
|---|---|
| 🔐 **Cifrado** | E2EE en el navegador (ECDH-P256, HKDF-SHA256, AES-256-GCM) |
| 💬 **Mensajería** | Mensajes directos, grupos, canales, reacciones, edición, borradores |
| 👥 **Social** | Gestión de contactos, comunidades, enlaces de invitación |
| 🛡️ **Seguridad** | TOTP/2FA, limitación de tasa, captcha matemático local, registros de auditoría |
| 📦 **DevOps** | Docker Compose, instalador de una línea, SSL automático con Caddy |
| 📱 **PWA** | Instalable en cualquier dispositivo |

---

## Arquitectura (algoritmo + diagrama visual de flujo)

### Algoritmo de flujo de mensajes end-to-end

1. **Autenticación y vínculo de sesión**: el usuario inicia sesión y la cookie segura queda protegida por validaciones CSRF/origin.
2. **Carga de claves del cliente**: las claves E2EE se generan/cargan en el navegador (Web Crypto + IndexedDB).
3. **Cifrado en cliente**: el mensaje se cifra antes de enviarse; el servidor no necesita texto plano.
4. **Envío en tiempo real**: el ciphertext viaja por HTTPS/WSS hacia `server.ts` y Socket.IO.
5. **Controles de seguridad del servidor**: se aplican membresía, autorización, rate limiting, antiabuso y auditoría.
6. **Persistencia y distribución**: el payload cifrado se guarda con Prisma en PostgreSQL; Redis opcional escala Pub/Sub.
7. **Entrega al receptor**: las sesiones autorizadas del receptor reciben ciphertext en tiempo real.
8. **Descifrado solo en navegador receptor**: el cliente receptor descifra localmente y actualiza estado delivered/read.

### Diagrama visual

```mermaid
flowchart TD
  A[Inicio de sesión + sesión segura] --> B[Cargar claves E2EE en navegador]
  B --> C[Escribir mensaje]
  C --> D[Cifrado en cliente]
  D --> E[Enviar ciphertext por HTTPS/WSS]
  E --> F[server.ts + Next.js + Socket.IO]
  F --> G{Controles: membresía/rate/autorización}
  G -->|Permitido| H[(PostgreSQL via Prisma)]
  G -->|Permitido| I[(Redis opcional: Pub/Sub)]
  H --> J[Entrega en tiempo real al receptor]
  I --> J
  J --> K[Descifrado en navegador receptor]
  K --> L[Actualizar estado delivered/read]
```

---

## Requisitos

| Dependencia | Versión mínima |
|---|---|
| Node.js | 20 LTS |
| npm | 10+ |
| PostgreSQL | 15+ |
| Redis | 6+ (opcional) |
| Docker + Compose | v2+ |

---

## Inicio rápido

### Instalador de una línea (Linux/macOS)

```bash
curl -fsSL https://raw.githubusercontent.com/ehsanking/ElaheMessenger/main/install.sh | bash
```

### Instalación manual

```bash
git clone https://github.com/ehsanking/ElaheMessenger.git
cd ElaheMessenger
cp .env.example .env.local
# Edita .env.local: DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, APP_URL
npm install
npx prisma migrate deploy
npm run build
npm start
```

---

## Configuración

| Variable | Por defecto | Descripción |
|---|---|---|
| `DATABASE_URL` | SQLite (solo dev) | Cadena de conexión PostgreSQL |
| `APP_URL` | `http://localhost:3000` | URL pública de la aplicación |
| `JWT_SECRET` | Automático | Clave de firma de tokens de sesión |
| `ENCRYPTION_KEY` | Automático | Clave de cifrado AES |
| `ADMIN_PASSWORD` | Automático | **Cámbialo después del primer inicio de sesión** |
| `REDIS_URL` | Vacío | Habilita clúster de Socket.IO |

---

## Despliegue con Docker

```bash
# Desarrollo
docker compose up -d

# Producción (con SSL automático)
docker compose -f compose.prod.yaml up -d --build
```

---

## Seguridad

- **Cifrado E2EE**: Los mensajes se cifran en el navegador antes del envío
- **Servidor ciego**: Solo almacena texto cifrado
- **2FA/TOTP**: RFC 6238, compatible con cualquier app de autenticación estándar
- **Limitación de tasa**: Límites per-IP en HTTP y WebSocket

Divulgación de vulnerabilidades: [SECURITY.md](./SECURITY.md)

---

## Contribuir

```bash
npm run dev        # Servidor de desarrollo
npm run build      # Build de producción
npm run lint       # ESLint
npm test           # Tests
npm run db:setup   # Configuración de BD
```

Usa [Conventional Commits](https://www.conventionalcommits.org/) y abre un PR a `main`.

---

## Licencia

Publicado bajo la [Licencia MIT](./LICENSE). Copyright © 2025 Colaboradores de Elahe Messenger.

<p align="center">Hecho con ❤️ por <a href="https://github.com/ehsanking">@ehsanking</a> · <a href="https://t.me/kingithub">t.me/kingithub</a></p>

---

## Production Security Update (2026-03)

For critical production safety guidance, see the English README sections:
- **Production Networking Policy** (public vs private ports)
- **Database Hardening** (`POSTGRES_*` bootstrap role vs `APP_DB_*` runtime role)
- **UFW manual, opt-in setup** (never auto-enable before allowing SSH)

Keep PostgreSQL (`5432`) internal-only by default.
