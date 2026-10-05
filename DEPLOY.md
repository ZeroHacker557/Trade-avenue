# Ishga tushirish qo'llanmasi

3-blokdagi xavfsizlik o'zgarishlaridan keyin loyiha uchta qismdan iborat:

| Qism | Qayerda ishlaydi | Vazifasi |
|---|---|---|
| Mini app | Vercel (statik) | Katalog, savat, buyurtma formasi |
| `/api/*` | Vercel (serverless) | Telegram imzosini tekshirish, buyurtma yaratish, promokod |
| Bot | Sizning kompyuteringiz | Admin panel, buyurtma xabarnomalari, to'lov cheklari |

---

## 0. MUSA ga o'tish — to'ldiriladigan qiymatlar

Loyiha MUSA brendiga to'liq o'tkazildi: ranglar, matnlar, logotip, hero
rasmi, kategoriya ikonkalari va barcha kalitlar.

Kodda `TODO(MUSA)` qolmadi — quyidagi jadvalda ❌ bilan belgilanganlar
faqat tashqi xizmatlarda (Vercel, BotFather, Firebase Console) qilinadi.

| Nima | Qayerga | Holat |
|---|---|---|
| **Bot tokeni** | `bot/.env` (git'ga tushmaydi) | ✅ yozildi |
| **Bot tokeni** | Vercel env `BOT_TOKEN` | ❌ **siz qo'shasiz** |
| Firebase service account JSON | Vercel env `FIREBASE_SERVICE_ACCOUNT` | ❌ **siz qo'shasiz** |
| BotFather `/setdomain` → `musa-delivery.vercel.app` | Telegram | ❌ **siz qilasiz** |
| Firestore Rules (4-bo'lim) | Firebase Console | ❌ **siz qilasiz** |
| Firebase web config | `src/config/firebase.ts` (`musa-onlineshop`) | ✅ yozildi |
| Service account fayli va bucket | `bot/config.py`, loyiha ildizida JSON | ✅ yozildi |
| Bot username `musauz_bot` | `bot/config.py`, `src/config/brand.ts` | ✅ yozildi |
| Mini app domeni | `bot/config.py` → `MINI_APP_URL` | ✅ yozildi |
| Admin Telegram ID `7203124812` | `bot/config.py` → `ADMIN_IDS` | ✅ yozildi |
| Aloqa raqami / email / Telegram | `src/config/brand.ts` va `bot/config.py` | ✅ yozildi |
| To'lov kartasi | `bot/config.py` (eskisi qoldirildi) | ✅ yozildi |
| Logotip, hero rasmi, favicon | `src/images/`, `public/favicon-*.png` | ✅ yozildi |
| Brend ranglari va matnlar | `src/styles.css`, `src/i18n/*` | ✅ MUSA ga moslandi |

> **Bot tokeni hech qachon git'ga tushmaydi.** U `bot/.env` da, `.gitignore`
> esa uni to'sadi. `bot/config.py` faqat `os.environ` dan o'qiydi. Yangi
> muhitda ishga tushirishdan oldin:
>
> ```
> cp bot/.env.example bot/.env
> ```
>
> va tokenni yozing. Token bo'lmasa bot tushunarli xabar bilan to'xtaydi.

> Firebase web config (`apiKey` va h.k.) maxfiy emas — Firebase uni brauzerga
> ataylab ochiq beradi, himoya Firestore Rules tomonida. Shuning uchun u env
> o'zgaruvchi emas, oddiy fayl.

> ⚠️ `src/config/firebase.ts` dagi `projectId` bot ishlatadigan service
> account bilan **bir xil loyihaga** tegishli bo'lishi shart. Aks holda bot
> bir bazaga yozadi, ilova boshqasidan o'qiydi — katalog bo'sh ko'rinadi.

Brend ranglari va shriftlari `src/styles.css` dagi CSS tokenlarida —
komponentlarda hex yozilmagan, shuning uchun rang o'zgartirish bitta joyda.

## 1. Bot tokeni

Token `bot/.env` da saqlanadi va git'ga tushmaydi. Uni almashtirish kerak
bo'lsa:

1. Telegram'da [@BotFather](https://t.me/BotFather) ni oching
2. `/mybots` → botni tanlang → **API Token**
3. Yangi tokenni `bot/.env` ga va Vercel env `BOT_TOKEN` ga yozing —
   **ikkalasi bir xil bo'lishi shart**

`initData` imzosi aynan shu token bilan tekshiriladi: token va Vercel'dagi
qiymat mos kelmasa, mini app "Tizimga kirilmagan" xatosini beradi.

> ⚠️ Bu repozitoriy V7 loyihasidan nusxalangan. Git tarixida eski
> `ecommercy_test_bot` tokeni ochiq qolgan, `bot/.env` faylida esa hozir
> ham V7 ning tokeni turibdi. MUSA uchun **yangi bot** oching va eski
> tokenlarni @BotFather → **Revoke current token** bilan bekor qiling —
> aks holda tokenni topgan odam o'sha bot nomidan ish yurita oladi.

---

## 2. Vercel Environment Variables

Vercel loyihasi → **Settings** → **Environment Variables**. Ikkalasini ham
Production, Preview va Development uchun qo'shing.

### `BOT_TOKEN`
Yuqorida olingan yangi token.

### `FIREBASE_SERVICE_ACCOUNT`
Firebase Console → ⚙️ **Project Settings** → **Service accounts** →
**Generate new private key**. Yuklab olingan JSON faylni matn muharririda
oching va **butun mazmunini** (`{` dan `}` gacha) qiymat sifatida joylang.

> Loyiha ildizidagi eski `*-firebase-adminsdk-*.json` fayllar V7 loyihasiniki.
> Ular `.gitignore` da — git'ga tushmagan, lekin diskda turibdi: MUSA
> kalitini qo'shgandan keyin ularni o'chirib tashlang.

### `LINKO_TOKEN`
Linko (SFA) External API tokeni — Linko texnik yordamidan olinadi.
Katalog, narx va ombor qoldig'i shu token bilan tortiladi.

### `LINKO_BASE_URL`
Tashkilotning Linko manzili, masalan `https://musaservis.linko.uz`.
Ixtiyoriy: admin panelning «Linko integratsiya» bo'limidan ham kiritiladi
va o'sha yerdagi qiymat ustun turadi.

### `CRON_SECRET`
`/api/linko-cron` ni himoyalaydi — uzun tasodifiy satr. Yaratish:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Xuddi shu qiymat `bot/.env` ga ham yoziladi: Vercel kuniga bir marta,
bot esa har 30 daqiqada sinxronni ishga tushiradi.

Env o'zgaruvchilarni qo'shgandan keyin **qaytadan deploy qiling** —
Vercel ularni faqat yangi build'ga qo'llaydi.

---

## 3. Firebase Authentication'ni yoqing

Firebase Console → **Authentication** → **Get started**.

Custom token bilan kirish uchun alohida provider yoqish shart emas, lekin
Authentication bo'limi bir marta ishga tushirilgan bo'lishi kerak.

---

## 4. Firestore Rules'ni yangilang

Loyiha ildizidagi [`firestore.rules`](./firestore.rules) faylini oching va
mazmunini Firebase Console → **Firestore Database** → **Rules** ga nusxalab,
**Publish** bosing.

Yoki Firebase CLI bilan:

```bash
firebase deploy --only firestore:rules
```

Qoidalar nima qiladi:

- **products, categories** — hamma o'qiydi, hech kim yozmaydi (faqat bot)
- **orders** — foydalanuvchi faqat o'zinikini o'qiydi, yozish butunlay yopiq
  (buyurtmani `/api/orders` yaratadi)
- **users** — faqat o'z hujjati, faqat `first_name`, `last_name`, `phone`,
  `addresses` maydonlari
- **promocodes** — mijoz umuman ko'ra olmaydi
- **counters** — faqat server
- **linko_products** — Linko katalogining nusxasi, faqat adminga ko'rinadi

> ⚠️ Rules'ni yangilashdan **oldin** yangi kodni deploy qiling. Aks holda
> eski mini app buyurtma yarata olmay qoladi (u to'g'ridan-to'g'ri yozardi).

---

## 4a. Linko (SFA) integratsiyasi

Katalog, narx va ombor qoldig'i Linko'dan tortiladi. Buyurtmalar
yuborilmaydi — oqim bir tomonlama.

1. **Token va manzil**: Vercel env'ga `LINKO_TOKEN`, `CRON_SECRET`
   (yuqoriga qarang), `bot/.env` ga o'sha `CRON_SECRET`.
2. **Deploy** qiling va botni qayta ishga tushiring.
3. Admin panel → **Linko integratsiya**:
   - server manzilini kiriting → **Ulanishni tekshirish**
   - **narxlar ro'yxati** va **sklad(lar)** ni tanlang → **Saqlash**
   - **Sinxronlash** — Linko katalogining nusxasi tortiladi
4. Har pozitsiyani do'kondagi mahsulotga **bog'lang**. Nomlar ikki tizimda
   boshqacha yozilgani uchun yonida taklif chiqadi — bir bosishda
   tasdiqlanadi. Narx va qoldiq faqat bog'langanlariga tushadi.

Keyin sinxron o'zi ishlaydi: Vercel cron kuniga bir marta, bot har
30 daqiqada. Qo'lda ham istalgan payt bosish mumkin.

> Bog'langan mahsulotning narxini admin paneldan o'zgartirmang — keyingi
> sinxronda Linko narxi ustidan yozadi. Rasm, tavsif va tarjima esa
> Linko'da yo'q, ular faqat MUSA tomonida saqlanadi.

Tekshirish (deploy'dan keyin):

```bash
curl -s -H "x-cron-secret: <CRON_SECRET>" https://musa-delivery.vercel.app/api/linko-cron
```

---

## 5. To'g'ri tartib

```
1. Yangi kodni Vercel'ga deploy qiling (env o'zgaruvchilar bilan)
2. Mini appni ochib, buyurtma berib ko'ring — ishlashi kerak
3. Shundan keyin Firestore Rules'ni yangilang
4. Yana bir buyurtma berib tekshiring
5. bot/.env dagi tokenni tekshiring va botni qayta ishga tushiring
```

---

## 6. Tekshirish ro'yxati

- [ ] Mini app Telegram'da ochiladi, katalog ko'rinadi
- [ ] Brauzerda ochilsa "Telegram'da ochish" ekrani chiqadi
- [ ] Buyurtma berilganda adminga xabar keladi, raqami `#1001` ko'rinishida
- [ ] "Buyurtmalarim" bo'limida buyurtma ko'rinadi
- [ ] Promokod qo'llanganda chegirma to'g'ri hisoblanadi
- [ ] Bot o'chirilgan holda buyurtma berilsa, bot yoqilganda xabar keladi
- [ ] Karta bilan to'lovda chek yuborish oqimi ishlaydi

### Xatolarni qayerdan ko'rish

- **Mini app:** Telegram Desktop → mini app ustida o'ng tugma → Inspect
- **API:** Vercel → loyiha → **Logs** (`[auth]`, `[orders]`, `[promo]` teglari)
- **Bot:** terminal oynasidagi log

---

## Ma'lum cheklovlar

- **Bot shaxsiy kompyuterda ishlaydi** — kompyuter o'chsa, admin xabarnomalari
  kechikadi. Buyurtmalar yo'qolmaydi (`notified` bayrog'i tufayli), lekin
  admin ularni faqat bot yoqilganda ko'radi. Doimiy ishlashi kerak bo'lsa,
  botni VPS yoki Railway'ga ko'chirish kerak.
- **Bot lokal ishlaydi** — hozircha VPS'ga ko'chirilmagan. Ko'chirilganda
  `bot/.env` faylini ham birga olib o'tish kerak (u git'da yo'q).
