> This README is derived from `README.md` (source of truth).

# KiNGChat 3.3 👑
### Gizlilik Çağı için Güvenli Mesajlaşma Uygulaması

[English version](README.md)

KiNGChat, uçtan uca şifreleme sağlayan açık kaynaklı bir sohbet uygulamasıdır. Ön yüzü Next.js ve React ile, arka yüzü Node.js ile yazılmıştır; veri saklama için Prisma ve PostgreSQL, gerçek zamanlı iletişim için Socket.IO kullanır. Tüm mesajlar tarayıcıda Web Crypto API (ECDH‑P256 anahtar değişimi, HKDF‑SHA256 anahtar türetimi ve AES‑256‑GCM şifreleme) kullanılarak şifrelenir, böylece yalnızca alıcı tarafından çözülebilir.

## Özellikler

- **Uçtan uca şifreleme:** Anahtarlar ECDH ile değiştirilir, HKDF ile türetilir ve mesajlar AES‑256‑GCM ile şifrelenir.
- **Gerçek zamanlı sohbet:** Socket.IO ile anlık mesaj, grup ve kanal iletimi; Redis ile ölçeklenebilir.
- **Kişi sistemi:** Kullanıcı adını veya sayısal kimliği kullanarak kişileri arayın ve listenize ekleyin.
- **Gruplar ve kanallar:** Davet bağlantılı, sahip/yönetici/moderatör/üye rol destekli, herkese açık veya özel gruplar ve kanallar oluşturun.
- **İki faktörlü kimlik doğrulama:** TOTP tabanlı 2FA (Google Authenticator, Authy) desteği.
- **Mesaj kalıcılığı ve geçmiş:** Tüm mesajlar PostgreSQL'de saklanır ve sayfalama ile geçmişe erişilebilir.
- **Yönetici paneli:** Kullanıcı yönetimi, sistem ayarları, günlükler ve denetim araçları.
- **PWA:** Mobil veya masaüstüne yüklenebilir, çevrimdışı çalışabilir web uygulaması.
- **Kurulum betiği:** Ön koşul kontrolleri, gizli anahtar üretimi, Docker ve Caddy yapılandırması ve veritabanı göçleri gerçekleştiren tek satırlık kurulum.
- **Docker dağıtımı:** Otomatik SSL sağlayan resmi Dockerfile ve docker‑compose.
- **Modern arayüz:** Tailwind CSS, Lucide ikonları ve animasyonlar ile modern kullanıcı arayüzü.

## Hızlı Kurulum
```bash
curl -fsSL https://raw.githubusercontent.com/ehsanking/KiNGChat/main/install.sh | bash
```

## Manuel Kurulum
```bash
git clone https://github.com/ehsanking/KiNGChat.git
cd KiNGChat
cp .env.example .env
npm install --legacy-peer-deps
npm run build
npm test # isteğe bağlı
```
`.env` dosyasını düzenledikten sonra aşağıdaki komutlardan biriyle çalıştırabilirsiniz:
```bash
npm run dev
npm start
docker compose up -d --build
```

### Kayıt Yansımaları (Mirrors)
Bazı ülkelerde npm ana deposuna erişim kısıtlıysa bir yansıma ayarlayabilirsiniz:
```bash
npm config set registry https://registry.npmmirror.com
yarn config set registry https://registry.npmmirror.com
```

## Lisans
Bu proje MIT lisansı altında yayımlanmaktadır.