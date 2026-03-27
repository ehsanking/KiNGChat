> This README is derived from `README.md` (source of truth).

<div dir="rtl">

# KiNGChat 3.3 👑
### تطبيق مراسلة آمن لعصر الخصوصية

[English version](README.md)

كينغ شات هو تطبيق مراسلة مفتوح المصدر وآمن يعتمد على التشفير الطرفي. يستخدم Next.js و React للواجهة الأمامية، و Node.js في الخلفية، مع Prisma و PostgreSQL لتخزين البيانات و Socket.IO للاتصال الفوري. يتم تشفير جميع الرسائل في المتصفح باستخدام Web Crypto API (تبادل مفاتيح ECDH P‑256 و HKDF‑SHA256 و AES‑256‑GCM)، ولا يمكن فك تشفيرها إلا من قبل المستلم.

## الميزات

- **التشفير الطرفي (E2EE):** تبادل المفاتيح عبر ECDH وتوليد المفاتيح باستخدام HKDF، وتشفير الرسائل باستخدام AES‑256‑GCM.
- **مراسلة فورية:** إرسال واستقبال الرسائل والمجموعات والقنوات في الوقت الحقيقي باستخدام Socket.IO مع إمكانية التوسع عبر Redis.
- **نظام جهات الاتصال:** البحث عن المستخدمين وإضافتهم إلى قائمة جهات الاتصال.
- **المجموعات والقنوات:** إنشاء مجموعات وقنوات خاصة أو عامة مع روابط دعوة وأدوار (مالك، مدير، مشرف، عضو).
- **المصادقة الثنائية:** دعم رموز الوقت (TOTP) عبر تطبيقات مثل Google Authenticator أو Authy.
- **التخزين والسجل:** حفظ الرسائل في قاعدة بيانات PostgreSQL وإمكانية تصفح السجل بصفحات.
- **لوحة الإدارة:** إدارة المستخدمين والإعدادات والسجلات والسياسات.
- **تطبيق ويب تقدمي (PWA):** إمكانية تثبيت التطبيق على الهواتف أو الحواسيب والعمل دون اتصال.
- **برنامج تثبيت سريع:** برنامج التثبيت سطر واحد يقوم بالفحص، إنشاء المفاتيح، إعداد Docker و Caddy وتنفيذ الترحيلات.
- **نشر عبر Docker:** ملفات Docker رسمية لبيئات الإنتاج مع شهادات SSL.
- **واجهة حديثة:** تصميم عصري باستخدام Tailwind CSS وأيقونات Lucide ورسوم متحركة سلسة.

## التثبيت السريع
```bash
curl -fsSL https://raw.githubusercontent.com/ehsanking/KiNGChat/main/install.sh | bash
```

## التثبيت اليدوي
```bash
git clone https://github.com/ehsanking/KiNGChat.git
cd KiNGChat
cp .env.example .env
npm install --legacy-peer-deps
npm run build
npm test # اختياري
```
قم بتعديل ملف `.env`، ثم شغّل التطبيق باستخدام:
```bash
npm run dev
npm start
docker compose up -d --build
```

### استخدام مرايا NPM
إذا كانت بعض الحزم محظورة في بلدك، يمكنك تغيير مستودع NPM إلى مرآة:
```bash
npm config set registry https://registry.npmmirror.com
yarn config set registry https://registry.npmmirror.com
```

## الترخيص
هذا المشروع مرخّص برخصة MIT.

</div>