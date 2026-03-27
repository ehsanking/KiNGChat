> This README is derived from `README.md` (source of truth).

# KiNGChat 3.3 👑
### El mensajero seguro para la era de la privacidad

[Versión en inglés](README.md)

KiNGChat es un mensajero de código abierto con cifrado de extremo a extremo. Está construido con Next.js y React en el frontend, Node.js en el backend, utiliza Prisma y PostgreSQL para la base de datos y Socket.IO para las comunicaciones en tiempo real. Todos los mensajes se cifran en el navegador usando la API Web Crypto (intercambio de claves ECDH‑P256, derivación HKDF‑SHA256 y cifrado AES‑256‑GCM) y solo el destinatario puede descifrarlos.

## Características

- **Cifrado de extremo a extremo:** intercambio de claves con ECDH, derivación con HKDF y cifrado con AES‑256‑GCM.
- **Mensajería en tiempo real:** entrega instantánea de mensajes, grupos y canales a través de Socket.IO con soporte de escalado mediante Redis.
- **Sistema de contactos:** busca usuarios por nombre o ID y añádelos a tu lista de contactos.
- **Grupos y canales:** crea grupos o canales públicos y privados con enlaces de invitación y roles de propietario, administrador, moderador y miembro.
- **Autenticación de dos factores:** soporte TOTP (Google Authenticator, Authy) para mayor seguridad.
- **Persistencia e historial:** todos los mensajes se guardan en PostgreSQL y se cargan bajo demanda con paginación.
- **Panel de administración:** gestiona usuarios, ajustes, registros y operaciones.
- **PWA:** instala la aplicación en tu móvil o escritorio y funciona sin conexión.
- **Script de instalación:** un instalador de una sola línea realiza comprobaciones, genera secretos, configura Docker y Caddy y ejecuta las migraciones.
- **Despliegue con Docker:** Dockerfile y docker‑compose oficiales con SSL automático.
- **Interfaz moderna:** UI agradable con Tailwind CSS, iconos Lucide y animaciones.

## Instalación rápida
```bash
curl -fsSL https://raw.githubusercontent.com/ehsanking/KiNGChat/main/install.sh | bash
```

## Instalación manual
```bash
git clone https://github.com/ehsanking/KiNGChat.git
cd KiNGChat
cp .env.example .env
npm install --legacy-peer-deps
npm run build
npm test # opcional
```
Edita `.env` y luego ejecuta:
```bash
npm run dev
npm start
docker compose up -d --build
```

### Uso de espejos (mirrors)
Si en tu país hay restricciones para acceder al registro de npm, configura un mirror:
```bash
npm config set registry https://registry.npmmirror.com
yarn config set registry https://registry.npmmirror.com
```

## Licencia
Este proyecto se publica bajo la licencia MIT.