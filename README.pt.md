> This README is derived from `README.md` (source of truth).

# KiNGChat 3.3 👑
### O mensageiro seguro para a era da privacidade

[Versão em inglês](README.md)

KiNGChat é um mensageiro de código aberto com encriptação ponto a ponto. Ele utiliza Next.js e React no frontend, Node.js no backend, com Prisma e PostgreSQL para persistência e Socket.IO para comunicações em tempo real. Todas as mensagens são encriptadas no navegador através da API Web Crypto (troca de chaves ECDH‑P256, derivação HKDF‑SHA256 e encriptação AES‑256‑GCM), e apenas o destinatário pode descriptografá‑las.

## Funcionalidades

- **Encriptação ponto a ponto:** troca de chaves via ECDH, derivação com HKDF e encriptação com AES‑256‑GCM.
- **Chat em tempo real:** entrega instantânea de mensagens, grupos e canais via Socket.IO com suporte a escalonamento usando Redis.
- **Sistema de contactos:** procure usuários pelo nome de utilizador ou ID e adicione‑os à sua lista.
- **Grupos e canais:** crie grupos e canais públicos ou privados com links de convite e cargos (Proprietário, Administrador, Moderador, Membro).
- **Autenticação de dois fatores:** suporte TOTP (Google Authenticator, Authy) para maior segurança.
- **Persistência e histórico:** todas as mensagens são guardadas em PostgreSQL e carregadas sob demanda com paginação.
- **Painel de administração:** gerencie utilizadores, configurações, registos e operações.
- **PWA:** instale a aplicação no telemóvel ou computador e use‑a offline.
- **Script de instalação:** um instalador de uma linha realiza verificações, gera segredos, configura Docker e Caddy e executa as migrações.
- **Desdobramento com Docker:** Dockerfile e docker‑compose oficiais com SSL automático.
- **Interface moderna:** UI agradável com Tailwind CSS, ícones Lucide e animações.

## Instalação rápida
```bash
curl -fsSL https://raw.githubusercontent.com/ehsanking/KiNGChat/main/install.sh | bash
```

## Instalação manual
```bash
git clone https://github.com/ehsanking/KiNGChat.git
cd KiNGChat
cp .env.example .env
npm install --legacy-peer-deps
npm run build
npm test # opcional
```
Edite `.env` e depois execute:
```bash
npm run dev
npm start
docker compose up -d --build
```

### Uso de espelhos
Se houver restrições ao acesso ao repositório npm em seu país, defina um espelho:
```bash
npm config set registry https://registry.npmmirror.com
yarn config set registry https://registry.npmmirror.com
```

## Licença
Este projeto é distribuído sob a licença MIT.