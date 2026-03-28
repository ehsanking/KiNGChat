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

## ภาพรวม

**Elahe Messenger** คือแพลตฟอร์มส่งข้อความโอเพ่นซอร์ส โฮสต์ด้วยตนเอง พร้อมการเข้ารหัสแบบ End-to-End (E2EE) ออกแบบสำหรับทีมและชุมชนที่ต้องการควบคุมข้อมูลของตนเองอย่างสมบูรณ์ สร้างด้วย **Next.js 15**, **React 19**, **Socket.IO** และ **Prisma ORM** พร้อม **PostgreSQL**

> เซิร์ฟเวอร์ไม่เคยเห็นข้อความธรรมดา การดำเนินการเข้ารหัสทั้งหมดเกิดขึ้นในเบราว์เซอร์

---

## คุณสมบัติ

| หมวดหมู่ | ความสามารถ |
|---|---|
| 🔐 **การเข้ารหัส** | E2EE ในเบราว์เซอร์ (ECDH-P256, HKDF-SHA256, AES-256-GCM) |
| 💬 **ข้อความ** | DM, กลุ่ม, ช่อง, ปฏิกิริยา, แก้ไข, ร่าง |
| 👥 **สังคม** | จัดการผู้ติดต่อ, ชุมชน, ลิงก์เชิญ |
| 🛡️ **ความปลอดภัย** | TOTP/2FA, จำกัดอัตรา, captcha คณิตศาสตร์ท้องถิ่น, บันทึกการตรวจสอบ |
| 📦 **DevOps** | Docker Compose, ติดตั้งด้วยคำสั่งเดียว, SSL อัตโนมัติผ่าน Caddy |
| 📱 **PWA** | ติดตั้งได้บนทุกอุปกรณ์ |

---

## ความต้องการ

| การพึ่งพา | เวอร์ชันขั้นต่ำ |
|---|---|
| Node.js | 20 LTS |
| npm | 10+ |
| PostgreSQL | 15+ |
| Redis | 6+ (ไม่บังคับ) |
| Docker + Compose | v2+ |

---

## เริ่มต้นอย่างรวดเร็ว

```bash
curl -fsSL https://raw.githubusercontent.com/ehsanking/ElaheMessenger/main/install.sh | bash
```

### ติดตั้งด้วยตนเอง

```bash
git clone https://github.com/ehsanking/ElaheMessenger.git
cd ElaheMessenger
cp .env.example .env.local
npm install && npx prisma migrate deploy
npm run build && npm start
```

---

## การกำหนดค่า

| ตัวแปร | ค่าเริ่มต้น | คำอธิบาย |
|---|---|---|
| `DATABASE_URL` | SQLite (เฉพาะ dev) | สตริงการเชื่อมต่อ PostgreSQL |
| `APP_URL` | `http://localhost:3000` | URL สาธารณะของแอป |
| `JWT_SECRET` | อัตโนมัติ | คีย์ลงนาม session token |
| `ADMIN_PASSWORD` | อัตโนมัติ | **เปลี่ยนหลังจากเข้าสู่ระบบครั้งแรก** |

---

## ใบอนุญาต

เผยแพร่ภายใต้ [ใบอนุญาต MIT](./LICENSE) Copyright © 2025 Elahe Messenger Contributors

<p align="center">สร้างด้วย ❤️ โดย <a href="https://github.com/ehsanking">@ehsanking</a> · <a href="https://t.me/kingithub">t.me/kingithub</a></p>

---

## Production Security Update (2026-03)

For critical production safety guidance, see the English README sections:
- **Production Networking Policy** (public vs private ports)
- **Database Hardening** (`POSTGRES_*` bootstrap role vs `APP_DB_*` runtime role)
- **UFW manual, opt-in setup** (never auto-enable before allowing SSH)

Keep PostgreSQL (`5432`) internal-only by default.
