# MUSA Shop — Telegram Mini App

MUSA (muzlatilgan mahsulotlar — yarim tayyor, muzqaymoq, sirok) uchun
Telegram mini app do'koni:
React + TypeScript + Tailwind CSS frontend, Vercel serverless API va aiogram
asosidagi Telegram bot.

## Brend

| Element | Qiymat |
| --- | --- |
| Asosiy rang | `#0A7A3D` (logo yashili) |
| Aksent | `#F2C94C` (logo sarig'i) / matn uchun `#A9760A` |
| Uchinchi rang | `#16359E` (logodagi ko'k yozuv) |
| Shriftlar | Archivo Black (sarlavha), Montserrat (matn) |
| Logotip | `src/images/musa-mark.webp` (belgi), `public/favicon-*.png` |
| Hero rasm | `src/images/hero-products.webp` |

Kompaniya ma'lumotlari (telefon, email, Telegram, bot username) bitta joyda:
[`src/config/brand.ts`](src/config/brand.ts). Bot tomonida — `bot/config.py`.

Ranglar `src/styles.css` dagi CSS o'zgaruvchilarida. Komponentlarda hex
yozilmaydi — faqat `var(--brand)` kabi tokenlar, shu tufayli qorong'i rejim
bitta blokda hal bo'ladi.

> Firebase loyihasi — `musa-onlineshop`, bot — [@musauz_bot](https://t.me/musauz_bot),
> mini app — `https://musa-delivery.vercel.app`. Maxfiy qiymatlar (bot tokeni,
> service account JSON) git'ga tushmaydi — [`DEPLOY.md`](./DEPLOY.md) ga qarang.

## Tuzilma

- `src/pages` — ekranlar: bosh sahifa, katalog, profil, buyurtmalar, mahsulot detali.
- `src/components/brand` — logotip komponenti.
- `src/components` — qayta ishlatiluvchi layout, UI, mahsulot va buyurtma komponentlari.
- `src/config/brand.ts` — brend va aloqa konstantalari.
- `src/config/categories.ts` — uchta asosiy yo'nalish (bosh sahifadagi kartalar va katalog menyusi).
- `src/hooks` — ilovaning UI holati va biznes harakatlari.
- `src/i18n` — o'zbekcha (asosiy) va ruscha lug'atlar.
- `src/types` — markazlashtirilgan TypeScript domen turlari.
- `src/admin/` — veb admin panel (alohida sahifa: `admin.html`, manzil `/admin`).
- `api/` — Vercel serverless funksiyalari (auth, orders, reviews, promo).
- `api/admin/` — admin panel API'si (Firebase ID token + rol tekshiruvi).
- `scripts/create-staff.mjs` — birinchi admin hisobini yaratish.
- `bot/` — aiogram bot va admin panel.
- `public/images/products` — mahsulot rasmlari (bot admin paneli orqali ham yuklanadi).

## Admin panel

Manzil: `/admin` (lokal ishlab chiqishda `http://localhost:5173/admin.html`).

Kirish email va parol bilan — Firebase Authentication. Rollar:

| Rol | Nima qila oladi |
| --- | --- |
| `owner` | Hammasi, shu jumladan xodimlarni boshqarish va sozlamalar |
| `admin` | Buyurtma, mahsulot, mijoz, ommaviy xabar |
| `courier` | Faqat o'ziga biriktirilgan buyurtmalar va ularning holati |

Birinchi hisobni skript yaratadi (Firebase Console'da qo'lda yaratish shart emas —
skript rolni custom claim va `staff/{uid}` hujjatiga ham yozadi):

```bash
node scripts/create-staff.mjs sizning@email.com "Kuchli-Parol-123" owner "Ismingiz"
```

Kira olmasangiz — sababini shu topadi (hech narsani o'zgartirmaydi):

```bash
node scripts/check-admin.mjs sizning@email.com
```

> ⚠️ Loyiha ildizida bir nechta `*firebase-adminsdk*.json` bo'lsa, skriptlar
> `src/config/firebase.ts` dagi `projectId` ga mos keladiganini tanlaydi.
> Eski V7 kalitlarini (`ecommercytest`, `v7-savdo`) o'chirib tashlagan
> ma'qul — ular chalkashlik va xavfsizlik muammosi.

Bo'limlar: boshqaruv paneli (jonli statistika), buyurtmalar (holat va kuryer
biriktirish), mahsulotlar, kategoriyalar, promokodlar, mijozlar bazasi,
ommaviy xabar, xodimlar va sozlamalar.

Xabarlarni (yangi buyurtma, holat o'zgarishi, ommaviy xabar, kuryerga
yuborish) **Telegram Bot API orqali to'g'ridan-to'g'ri Vercel'dan** ketadi —
lokal bot o'chiq bo'lsa ham ishlaydi. Botda admin panel **yo'q**: u faqat
mijozlarga xizmat qiladi (katalog tugmasi, telefon, to'lov cheki).

Vercel env o'zgaruvchilari: `BOT_TOKEN`, `FIREBASE_SERVICE_ACCOUNT` va
`ADMIN_PANEL_URL` (xabarnomadagi tugma shu manzilga olib boradi).

Firebase Console'da yangilanishi kerak: **Firestore → Rules**
([firestore.rules](./firestore.rules)), **Storage → Rules**
([storage.rules](./storage.rules)) va **Authentication → Email/Password**.

## Buyruqlar

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run build
```

```bash
npm run lint
```

Mahsulotlar bazadan (Firestore) keladi va bot admin paneli orqali qo'shiladi —
`src/data.ts` bo'sh ro'yxat qaytaradi.
