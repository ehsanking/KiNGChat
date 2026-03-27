# نقشه API امن برای مسنجر شخصی

این سند، الگوی پیشنهادی برای طراحی APIهای امن Elahe Messenger را مشخص می‌کند تا توسعه‌دهندگان بتوانند کلاینت‌های شخصی خود را بدون ایجاد ریسک امنیتی پیاده‌سازی کنند.

## اصول پایه

- **اصل حداقل دسترسی:** هر endpoint فقط همان دسترسی لازم را داشته باشد.
- **اعتبارسنجی سخت‌گیرانه ورودی:** قبل از هر پردازش، نوع و طول فیلدها کنترل شود.
- **مقابله با سوء‌استفاده:** endpointهای حساس (login/register/captcha) rate limit داشته باشند.
- **session امن:** احراز هویت فقط با کوکی session امضاشده و اعتبارسنجی مبدا انجام شود.
- **بدون cache روی داده حساس:** پاسخ‌های امنیتی با `Cache-Control: no-store` برگردانده شوند.

## APIهای کلیدی

### 1) دریافت captcha
- `GET /api/captcha`
- کاربرد: دریافت `captchaId` و تصویر SVG (data URI).
- کنترل امنیتی:
  - rate limit مبتنی بر IP.
  - no-store cache header.
  - ذخیره challenge با backend مشترک Redis (در دسترس بودن) و fallback امن.

### 2) ورود
- `POST /api/login`
- کاربرد: ورود کاربر + بررسی captcha (در صورت فعال بودن).
- کنترل امنیتی:
  - بررسی origin (same-origin).
  - rate limit برای IP + username.
  - lockout پس از خطاهای متوالی.
  - کوکی session امن سمت سرور.

### 3) ثبت‌نام E2EE
- `POST /api/e2ee/register`
- کاربرد: ثبت‌نام به‌همراه کلیدهای رمزنگاری.
- کنترل امنیتی:
  - بررسی امضای Signed Pre-Key.
  - اعتبارسنجی captcha.
  - رعایت سیاست‌های فعال/غیرفعال بودن ثبت‌نام.

## چرا گاهی captcha لود نمی‌شود؟

رایج‌ترین دلایل عملیاتی:

1. **اختلال کوتاه‌مدت شبکه یا timeout** بین کلاینت و `/api/captcha`.
2. **ازدحام درخواست captcha** از یک IP (بلاک توسط rate limit).
3. **مشکل موقت Redis** در ذخیره challenge (در استقرار چند نودی).
4. **خطا در دریافت public settings** قبل از fetch captcha.

## راهکارهای پیاده‌سازی‌شده

- اضافه شدن retry با backoff روی fetch تنظیمات عمومی و captcha در صفحات login/register-v2.
- مقاوم‌سازی captcha store: استفاده از Redis در حالت عادی + fallback به in-memory در زمان اختلال Redis.
- اضافه شدن rate limit پاسخ‌محور برای endpoint captcha با headerهای استاندارد rate-limit.

