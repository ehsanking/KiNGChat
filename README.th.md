> This README is derived from `README.md` (source of truth).

# KiNGChat 3.3 👑
### แอปส่งข้อความที่ปลอดภัยสำหรับยุคแห่งความเป็นส่วนตัว

[English version](README.md)

KiNGChat เป็นแอปส่งข้อความแบบโอเพ่นซอร์สที่มีการเข้ารหัสแบบ end‑to‑end สร้างขึ้นด้วย Next.js และ React สำหรับส่วนหน้า Node.js ที่ส่วนหลัง ใช้ Prisma และ PostgreSQL ในการจัดเก็บข้อมูล และใช้ Socket.IO สำหรับการสื่อสารแบบเรียลไทม์ ข้อความทั้งหมดจะถูกเข้ารหัสในเบราว์เซอร์ด้วย Web Crypto API (การแลกเปลี่ยนคีย์ ECDH‑P256, HKDF‑SHA256 และการเข้ารหัส AES‑256‑GCM) ผู้รับเท่านั้นที่สามารถถอดรหัสได้

## คุณสมบัติ

- **การเข้ารหัสจากต้นทางถึงปลายทาง:** แลกเปลี่ยนคีย์ผ่าน ECDH อนุพันธ์ด้วย HKDF และเข้ารหัสข้อความด้วย AES‑256‑GCM
- **แชทแบบเรียลไทม์:** ส่งข้อความ กลุ่ม และช่องแบบทันทีด้วย Socket.IO พร้อมรองรับการขยายผ่าน Redis
- **ระบบรายชื่อผู้ติดต่อ:** ค้นหาและเพิ่มผู้ใช้ตามชื่อหรือ ID
- **กลุ่มและช่อง:** สร้างกลุ่มและช่องสาธารณะหรือส่วนตัวพร้อมลิงก์เชิญและบทบาทเจ้าของ ผู้ดูแล ผู้ตรวจสอบ และสมาชิก
- **การยืนยันตัวตนสองชั้น:** รองรับ TOTP (Google Authenticator, Authy) เพื่อความปลอดภัยเพิ่มเติม
- **การจัดเก็บและประวัติ:** บันทึกข้อความในฐานข้อมูล PostgreSQL และโหลดประวัติแบบแบ่งหน้า
- **แผงผู้ดูแล:** จัดการผู้ใช้ การตั้งค่า และบันทึก
- **แอปเว็บก้าวหน้า (PWA):** ติดตั้งแอปบนโทรศัพท์หรือเดสก์ท็อปและทำงานออฟไลน์ได้
- **สคริปต์ติดตั้ง:** สคริปต์บรรทัดเดียวที่ตรวจสอบระบบ สร้างคีย์ ตั้งค่า Docker และ Caddy และเรียกใช้การย้ายข้อมูล
- **การปรับใช้ Docker:** Dockerfile และ docker‑compose อย่างเป็นทางการพร้อม SSL อัตโนมัติ
- **ส่วนต่อประสานทันสมัย:** อินเตอร์เฟซสวยงามด้วย Tailwind CSS ไอคอน Lucide และแอนิเมชัน

## การติดตั้งแบบรวดเร็ว
```bash
curl -fsSL https://raw.githubusercontent.com/ehsanking/KiNGChat/main/install.sh | bash
```

## การติดตั้งแบบแมนนวล
```bash
git clone https://github.com/ehsanking/KiNGChat.git
cd KiNGChat
cp .env.example .env
npm install --legacy-peer-deps
npm run build
npm test # ตัวเลือก
```
แก้ไข `.env` แล้วเรียกใช้งานด้วย:
```bash
npm run dev
npm start
docker compose up -d --build
```

### การใช้แหล่งมิเรอร์
หากไม่สามารถเข้าถึงรีจิสทรี npm เนื่องจากข้อจำกัด ให้ตั้งค่าแหล่งมิเรอร์:
```bash
npm config set registry https://registry.npmmirror.com
yarn config set registry https://registry.npmmirror.com
```

## ใบอนุญาต
โครงการนี้เผยแพร่ภายใต้ใบอนุญาต MIT