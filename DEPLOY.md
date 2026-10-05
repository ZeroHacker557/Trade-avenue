# Ishga tushirish qo'llanmasi

| Qism | Qayerda ishlaydi | Vazifasi |
|---|---|---|
| Mini app va admin panel | Vercel (statik) | Katalog, savat, buyurtma; `/admin` — boshqaruv |
| `/api/*` | Vercel (serverless) | Telegram imzosi, buyurtma, promokod, Linko sinxroni |
| Bot | Railway yoki VPS | Katalog tugmasi, xabarlar, to'lov cheki, jadval |

---

## 0. To'ldiriladigan qiymatlar

Kodda MUSA'ga oid kalit va ma'lumot qolmagan. Quyidagilar yangi loyiha uchun
**siz** to'ldirasiz:

| Nima | Qayerga |
|---|---|
| Yangi bot (@BotFather) tokeni | `bot/.env` → `BOT_TOKEN` va Vercel env `BOT_TOKEN` |
| Bot username | `src/config/brand.ts` → `botUsername`, `bot/config.py` → `BOT_USERNAME` |
| Yangi Firebase loyihasi web config | `src/config/firebase.ts` |
| Firebase service account JSON | Vercel env `FIREBASE_SERVICE_ACCOUNT`; bot uchun `bot/.env` yoki loyiha ildizidagi fayl |
| Storage bucket | `bot/.env` → `FIREBASE_STORAGE_BUCKET` |
| Mini app domeni | `bot/.env` → `MINI_APP_URL`, Vercel env `ADMIN_PANEL_URL`, BotFather `/setdomain` |
| Egalar Telegram ID lari | `bot/.env` → `ADMIN_IDS` |
| Aloqa (telefon, email, Telegram) | Admin panel → Sozlamalar → «Biz bilan aloqa» |
| To'lov kartasi | Admin panel → Sozlamalar → «Karta orqali to'lov» |
| Linko tokeni va manzili | Vercel env `LINKO_TOKEN`; manzil — admin panel → Linko |
| `CRON_SECRET` | Vercel env va `bot/.env` (bir xil qiymat) |

> ⚠️ `src/config/firebase.ts` dagi `projectId` bot va API ishlatadigan service
> account bilan **bir xil loyihaga** tegishli bo'lishi shart.

> Firebase web config maxfiy emas — himoya Firestore Rules tomonida.
> Bot tokeni, service account va `LINKO_TOKEN` esa hech qachon git'ga tushmaydi.

`CRON_SECRET` yaratish:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 1. Firebase

1. Firebase Console → yangi loyiha.
2. **Authentication** → Get started; **Email/Password** ni yoqing (admin panel uchun).
3. **Firestore Database** yarating, so'ng [`firestore.rules`](./firestore.rules) ni
   Rules bo'limiga joylab **Publish** qiling.
4. **Storage** yoqing va [`storage.rules`](./storage.rules) ni joylang.

```bash
firebase deploy --only firestore:rules,storage
```

## 2. Vercel

Settings → Environment Variables (Production, Preview, Development):
`BOT_TOKEN`, `FIREBASE_SERVICE_ACCOUNT`, `ADMIN_PANEL_URL`, `LINKO_TOKEN`,
`LINKO_BASE_URL` (ixtiyoriy), `CRON_SECRET`. Qo'shgandan keyin qayta deploy qiling.

## 3. Bot

```bash
cp bot/.env.example bot/.env
```

Qiymatlarni to'ldiring va botni ishga tushiring (`python bot/bot.py`).

## 4. Birinchi admin

```bash
node scripts/create-staff.mjs admin@tradeavenue.uz "Kuchli-Parol-123" owner "Ism" <telegram_id>
```

## 5. Linko

Admin panel → **Linko integratsiya**: server manzili → **Ulanishni tekshirish** →
narxlar ro'yxati va sklad → **Saqlash** → **Sinxronlash**. Pozitsiyalarni katalog
mahsulotlariga bog'lang. Keyin sinxron o'zi ishlaydi (Vercel cron va bot).

Tekshirish:

```bash
curl -s -H "x-cron-secret: <CRON_SECRET>" https://<domen>/api/linko-cron
```

---

## Tekshirish ro'yxati

- [ ] Mini app Telegram'da ochiladi, katalog ko'rinadi
- [ ] Brauzerda ochilsa «Telegram orqali oching» ekrani chiqadi
- [ ] Buyurtma berilganda adminga xabar keladi
- [ ] «Buyurtmalarim» da buyurtma ko'rinadi
- [ ] Karta bilan to'lovda chek yuklash ishlaydi
- [ ] Linko'ga buyurtma `ta-` belgisi bilan tushadi

### Xatolarni qayerdan ko'rish

- **Mini app:** Telegram Desktop → mini app ustida o'ng tugma → Inspect
- **API:** Vercel → Logs (`[auth]`, `[orders]`, `[linko]` teglari)
- **Bot:** terminal yoki Railway logi
