> This README is derived from `README.md` (source of truth).

# KiNGChat 3.3 👑
### 隐私时代的安全聊天应用

[English version](README.md)

KiNGChat 是一款开源的端到端加密即时通讯应用。前端使用 Next.js 和 React，后端使用 Node.js，数据持久化依赖 Prisma 和 PostgreSQL，实时通信由 Socket.IO 提供。所有消息都在浏览器中使用 Web Crypto API（ECDH‑P256 密钥交换、HKDF‑SHA256 密钥派生和 AES‑256‑GCM 加密）加密，只有收件人才能解密。

## 功能特点

- **端到端加密：** 通过 ECDH 交换密钥，HKDF 派生会话密钥，使用 AES‑256‑GCM 加密消息。
- **实时聊天：** 使用 Socket.IO 实现即时的消息、群组和频道通信，可通过 Redis 扩展。
- **联系人系统：** 按用户名或数字 ID 搜索用户并添加为联系人。
- **群组与频道：** 创建公开或私密的群组和频道，支持邀请链接和所有者、管理员、版主、成员角色。
- **双重身份验证：** 支持基于时间的一次性密码 (TOTP)，可与 Google Authenticator 或 Authy 配合。
- **消息持久化与历史：** 所有消息存储在 PostgreSQL 数据库中，并支持分页加载历史记录。
- **管理面板：** 提供用户管理、系统设置、审计日志和运营仪表板。
- **渐进式 Web 应用 (PWA)：** 可以安装到手机或桌面，支持离线模式。
- **一键安装脚本：** 检查环境、生成密钥、配置 Docker 和 Caddy、执行数据库迁移并自动部署。
- **Docker 部署：** 提供官方 Dockerfile 和 docker‑compose，用 Caddy 自动颁发 SSL 证书。
- **现代界面：** 使用 Tailwind CSS、Lucide 图标和动画，界面简洁美观。

## 快速安装
```bash
curl -fsSL https://raw.githubusercontent.com/ehsanking/KiNGChat/main/install.sh | bash
```

## 手动安装
```bash
git clone https://github.com/ehsanking/KiNGChat.git
cd KiNGChat
cp .env.example .env
npm install --legacy-peer-deps
npm run build
npm test # 可选
```
编辑 `.env`，然后使用以下方式启动：
```bash
npm run dev
npm start
docker compose up -d --build
```

### 使用镜像源
部分地区访问 npm 官方源可能受限，可以设置镜像源：
```bash
npm config set registry https://registry.npmmirror.com
yarn config set registry https://registry.npmmirror.com
```

## 许可
本项目采用 MIT 许可协议发布。