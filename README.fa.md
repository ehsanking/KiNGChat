> This README is derived from `README.md` (source of truth).

<div dir="rtl">

<p align="center">
  <img src="./public/logo.png" alt="لوگوی کینگ‌چت" width="120" height="120" />
</p>

<h1 align="center">کینگ‌چت ۳.۳ 👑</h1>
<p align="center"><strong>پیام‌رسان امن، متن‌باز و خودمیزبان برای تیم‌ها و جامعه‌ها</strong></p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.fa.md">فارسی</a>
</p>

---

## کینگ‌چت چیست؟

**KiNGChat 3.3** یک پیام‌رسان متن‌باز با تمرکز بر امنیت، حریم خصوصی و استقرار مستقل است.

- فرانت‌اند: Next.js 15 و React 19
- بک‌اند: Node.js و Socket.IO
- لایه داده: Prisma و PostgreSQL
- رمزنگاری: ECDH-P256 + HKDF-SHA256 + AES-256-GCM (در مرورگر)
- عملیات: Docker Compose، اسکریپت‌های نصب و سخت‌سازی محیط تولید

> کلید خصوصی کاربر در جریان رمزنگاری پیام‌ها به سرور ارسال نمی‌شود.

---

## قابلیت‌های اصلی

- 🔐 رمزنگاری سرتاسری (E2EE)
- 💬 پیام‌رسانی بلادرنگ برای گفت‌وگو، گروه و کانال
- 👥 مدیریت مخاطب‌ها و جامعه‌ها با لینک دعوت و نقش‌های دسترسی
- 🛡️ کنترل‌های امنیتی (۲FA، کپچا، Rate Limit، بررسی نشست)
- 🧭 پنل مدیریت (کاربران، گزارش‌ها، تنظیمات، لاگ ممیزی)
- 📦 استقرار خودمیزبان با Docker

---

## نصب سریع

```bash
curl -fsSL https://raw.githubusercontent.com/ehsanking/KiNGChat/main/install.sh | bash
```

---

## نصب دستی

```bash
git clone https://github.com/ehsanking/KiNGChat.git
cd KiNGChat
cp .env.example .env
npm install
npx prisma generate
npm run build
npm test
npm start
```

برای توسعه:

```bash
npm run dev
```

---

## استقرار با Docker

```bash
docker compose up -d --build
```

برای استقرار تولیدی می‌توانید از فایل‌های `compose.prod.yaml` و `Dockerfile.prod` نیز استفاده کنید.

---

## ساختار پروژه

```text
app/        صفحات، اکشن‌های سرور و API
components/ کامپوننت‌های رابط کاربری
lib/        ماژول‌های امنیت، پیام‌رسانی و سوکت
prisma/     اسکیما و مهاجرت‌های پایگاه‌داده
scripts/    اسکریپت‌های نصب و نگه‌داری
tests/      تست‌های Vitest
```

---

## مجوز

این پروژه تحت مجوز [MIT](./LICENSE) منتشر شده است.

## نگه‌داری

توسعه توسط [@ehsanking](https://github.com/ehsanking) و مشارکت‌کنندگان انجام می‌شود.

</div>
