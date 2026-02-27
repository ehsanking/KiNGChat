# KiNGChat 👑

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

**KiNGChat** is a privacy-first, self-hosted web messenger designed for resilience, especially in environments with restricted or disrupted international internet access (like Iran). It features End-to-End Encryption (E2EE), offline-capable PWA, and optional Firebase push notifications.

---

## 🇮🇷 راهنمای فارسی (Persian Guide)

**کینگ‌چت (KiNGChat)** یک پیام‌رسان وب خودمیزبان (Self-hosted) و مبتنی بر حریم خصوصی است که برای پایداری در شرایط اختلال اینترنت بین‌المللی طراحی شده است. این پیام‌رسان دارای رمزنگاری سرتاسری (E2EE) است و هیچ وابستگی حیاتی به سرویس‌های خارجی ندارد.

### امکانات کلیدی:
- **رمزنگاری سرتاسری (E2EE):** پیام‌ها و فایل‌ها روی دستگاه شما رمزنگاری می‌شوند و سرور تنها داده‌های رمزنگاری شده را می‌بیند.
- **پایداری در شبکه ملی:** بدون نیاز به CDN ها یا سرویس‌های خارجی کار می‌کند.
- **وب اپلیکیشن پیشرونده (PWA):** قابلیت نصب روی گوشی و دسکتاپ.
- **نوتیفیکیشن (اختیاری):** پشتیبانی از Firebase برای ارسال پوش نوتیفیکیشن در صورت در دسترس بودن اینترنت بین‌الملل.
- **مدیریت گروه‌ها و نقش‌ها:** امکان ساخت گروه با دسترسی‌های مختلف.

### 🚀 نصب سریع (نصب تک خطی)

برای نصب سریع روی سرور لینوکس خود، دستور زیر را اجرا کنید:

```bash
curl -fsSL https://raw.githubusercontent.com/EHSANKiNG/kingchat/main/install.sh | bash
```

### 🐳 راهنمای نصب داکر در سرورهای ایران

برای دور زدن تحریم‌ها و نصب داکر در سرورهای ایران، از دستورات زیر استفاده کنید:

**اگر سیستم عامل شما اوبونتو (Ubuntu) است:**
دستور زیر را برای نصب و استفاده از داکر وارد کنید و نیازی به چیز دیگر نیست:
```bash
curl -fsSL https://raw.githubusercontent.com/manageitir/docker/main/install-ubuntu.sh | sh
```

**اگر سیستم عامل دیگری به جز اوبونتو دارید:**
ابتدا داکر را نصب کنید و سپس دستور زیر را برای اضافه کردن میرور ایمیج های داکر و دور زدن تحریمها اجرا کنید:
```bash
curl -fsSL https://raw.githubusercontent.com/manageitir/docker/main/mirror.sh | sh
```

سپس با استفاده از `docker-compose` برنامه را اجرا کنید:
```bash
docker-compose up -d
```

---

## 🇬🇧 English Guide

**KiNGChat** is a self-hosted, privacy-first web messenger built to operate reliably during international internet disruptions. It uses End-to-End Encryption (E2EE) and has zero critical dependencies on foreign services.

### Key Features:
- **End-to-End Encryption (E2EE):** Messages and attachments are encrypted client-side.
- **Resilient Infrastructure:** Works fully on local networks without external CDNs.
- **Progressive Web App (PWA):** Installable on mobile and desktop.
- **Push Notifications:** Optional Firebase integration.
- **Group Management:** Role-based access control for groups.

### 🚀 One-Line Installation

Run the following command on your Linux server:

```bash
curl -fsSL https://raw.githubusercontent.com/EHSANKiNG/kingchat/main/install.sh | bash
```

### 🐳 Docker Setup

1. Install Docker and Docker Compose.
2. Clone the repository and run:
```bash
docker-compose up -d
```

*(Note for Iranian servers: Please refer to the Persian section for scripts to bypass Docker registry blocks).*

---
**Developer:** EHSANKiNG
**Version:** 1.0.0
