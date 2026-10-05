# Trade Avenue — do'konlar uchun Telegram mini app

Trade Avenue — ulgurji yetkazib beruvchi va do'konlar orasidagi savdo ilovasi.
Do'konchi Telegram ichida katalogni ko'radi, o'z narxlarida buyurtma beradi va
holatini kuzatadi. Ma'lumotlar Linko (SFA) bilan sinxron.

Tarkibi: React + TypeScript + Tailwind CSS (mini app va admin panel),
Vercel serverless API, aiogram bot, Firebase (Firestore, Auth, Storage).

> Loyiha `ecommercyfor-musa` asosida qurilgan. Ish rejasi va tasdiqlangan
> qarorlar — [`PLAN.md`](./PLAN.md).

## Brend

| Element | Qiymat |
| --- | --- |
| Asosiy rang | `#1D4ED8` (ko'k) |
| Aksent | `#F59E0B` (amber) / matn uchun `#B45309` |
| Uchinchi rang | `#0F766E` (firuza) |
| Shriftlar | Archivo Black (sarlavha), Montserrat (matn) |
| Logotip | `src/images/ta-mark.svg`, `public/favicon-*.png` |

Kompaniya ma'lumotlari (telefon, email, Telegram, bot username) bitta joyda:
[`src/config/brand.ts`](src/config/brand.ts). Bot tomonida — `bot/config.py`.

Ranglar `src/styles.css` dagi CSS o'zgaruvchilarida. Komponentlarda hex
yozilmaydi — faqat `var(--brand)` kabi tokenlar, shu tufayli qorong'i rejim
bitta blokda hal bo'ladi.

## Tuzilma

- `src/pages` — ekranlar: bosh sahifa, katalog, buyurtmalar, profil, mahsulot.
- `src/components` — qayta ishlatiluvchi layout, UI, mahsulot va buyurtma komponentlari.
- `src/config` — brend, Firebase, kategoriyalar, aloqa.
- `src/hooks` — ilovaning UI holati va biznes harakatlari.
- `src/i18n` — o'zbekcha (asosiy) va ruscha lug'atlar.
- `src/courier` — yetkazuvchi (kuryer) sahifasi, mini app ichida.
- `src/admin` — veb admin panel (`admin.html`, manzil `/admin`).
- `api/` — Vercel serverless funksiyalari (auth, orders, promo, courier, linko-cron).
- `api/admin/` — admin panel API'si (Firebase ID token + rol tekshiruvi).
- `bot/` — aiogram bot.
- `scripts/` — birinchi admin hisobini yaratish va tekshirish.

## Admin panel

Manzil: `/admin` (lokal ishlab chiqishda `http://localhost:5173/admin.html`).
Kirish — email va parol (Firebase Authentication). Rollar: `owner`, `admin`, `courier`.

Birinchi hisob:

```bash
node scripts/create-staff.mjs admin@tradeavenue.uz "Kuchli-Parol-123" owner "Ism"
```

## Buyruqlar

`npm` bu kompyuterda buzilgan — paketlar `bun` bilan o'rnatiladi, skriptlar
esa to'g'ridan-to'g'ri `node` orqali ishlaydi:

```bash
bun install --no-save
```

```bash
node ./node_modules/vite/bin/vite.js
```

```bash
node ./node_modules/typescript/bin/tsc -b && node ./node_modules/vite/bin/vite.js build
```

Ishga tushirish va tashqi xizmatlar — [`DEPLOY.md`](./DEPLOY.md).
