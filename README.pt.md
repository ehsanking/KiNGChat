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

## Visão Geral

**Elahe Messenger** é uma plataforma de mensagens de código aberto, auto-hospedada e com criptografia ponta a ponta (E2EE), projetada para equipes e comunidades que exigem controle total sobre seus dados. Construída com **Next.js 15**, **React 19**, **Socket.IO** e **Prisma ORM** com **PostgreSQL**.

> O servidor nunca vê o texto simples das mensagens. Todas as operações criptográficas são realizadas no navegador.

---

## Recursos

| Categoria | Capacidades |
|---|---|
| 🔐 **Criptografia** | E2EE no navegador (ECDH-P256, HKDF-SHA256, AES-256-GCM) |
| 💬 **Mensagens** | DMs, grupos, canais, reações, edição, rascunhos |
| 👥 **Social** | Gestão de contatos, comunidades, links de convite |
| 🛡️ **Segurança** | TOTP/2FA, limitação de taxa, captcha matemático local, logs de auditoria |
| 📦 **DevOps** | Docker Compose, instalador de uma linha, SSL automático via Caddy |
| 📱 **PWA** | Instalável em qualquer dispositivo |

---

## Requisitos

| Dependência | Versão Mínima |
|---|---|
| Node.js | 20 LTS |
| npm | 10+ |
| PostgreSQL | 15+ |
| Redis | 6+ (opcional) |
| Docker + Compose | v2+ |

---

## Início Rápido

### Instalador de Uma Linha (Linux/macOS)

```bash
curl -fsSL https://raw.githubusercontent.com/ehsanking/ElaheMessenger/main/install.sh | bash
```

### Instalação Manual

```bash
git clone https://github.com/ehsanking/ElaheMessenger.git
cd ElaheMessenger
cp .env.example .env.local
# Edite .env.local: DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, APP_URL
npm install
npx prisma migrate deploy
npm run build
npm start
```

---

## Configuração

| Variável | Padrão | Descrição |
|---|---|---|
| `DATABASE_URL` | SQLite (só dev) | String de conexão PostgreSQL |
| `APP_URL` | `http://localhost:3000` | URL pública da aplicação |
| `JWT_SECRET` | Automático | Chave de assinatura de token de sessão |
| `ENCRYPTION_KEY` | Automático | Chave de criptografia AES |
| `ADMIN_PASSWORD` | Automático | **Altere após o primeiro login** |
| `REDIS_URL` | Vazio | Habilita cluster Socket.IO |

---

## Implantação com Docker

```bash
# Desenvolvimento
docker compose up -d

# Produção (com SSL automático)
docker compose -f compose.prod.yaml up -d --build
```

---

## Segurança

- **Criptografia E2EE**: Mensagens criptografadas no navegador antes do envio
- **Servidor cego**: Armazena apenas texto cifrado
- **2FA/TOTP**: RFC 6238, compatível com qualquer app autenticador padrão
- **Limitação de taxa**: Limites per-IP em HTTP e WebSocket

Divulgação de vulnerabilidades: [SECURITY.md](./SECURITY.md)

---

## Contribuição

```bash
npm run dev        # Servidor de desenvolvimento
npm run build      # Build de produção
npm run lint       # ESLint
npm test           # Testes
npm run db:setup   # Configuração do BD
```

Use [Conventional Commits](https://www.conventionalcommits.org/) e abra um PR para `main`.

---

## Licença

Lançado sob a [Licença MIT](./LICENSE). Copyright © 2025 Colaboradores do Elahe Messenger.

<p align="center">Feito com ❤️ por <a href="https://github.com/ehsanking">@ehsanking</a> · <a href="https://t.me/kingithub">t.me/kingithub</a></p>
