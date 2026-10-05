# Trade Avenue — ish rejasi

Do'konchilar (B2B) uchun Telegram bot + mini app. Asos — MUSA loyihasining nusxasi
(manba papka `ecommercyfor-musa` ga tegilmaydi).

Model: Trade Avenue — ulgurji yetkazib beruvchi. Do'konlar Linko'da (`markets/`) mavjud,
ular mini app orqali tovar buyurtma qiladi.

## Tasdiqlangan qarorlar (2026-10-05)

| Kod | Qaror |
|---|---|
| M7 | Onlayn to'lov (Click/Payme/Uzum) **olib tashlanadi**. Qoladi: **naqd** va **karta (chek skrinshoti)** |
| M13 | Setlar qoladi |
| M14 | Promokod qoladi |
| M16 | Ochilish reklamasi (SplashAd) qoladi |
| M17 | Kirish ovozi va ovozli eslatmalar olib tashlanadi |
| M18 | Sharhlar va reyting olib tashlanadi |
| M19 | Kuryerni baholash olib tashlanadi |
| M20 | "Bepul yetkazishgacha" chizig'i olib tashlanadi (minimal summa qoladi) |
| M21 | Jonli kuzatish xaritasi va ETA olib tashlanadi |
| A9 / A10 | Kanalga post va kunlik e'lon qoladi |
| A11 | Trafik manbalari olib tashlanadi |
| A12 | Ovozlar (Voices) olib tashlanadi; Reklama (Ads) qoladi (M16 sababli) |
| A14 | "Miya" (3D galaktika) olib tashlanadi |
| A15 | Linko qoladi va asosiy manbaga aylanadi |
| Y1 | Do'konlar Linko'dan olinadi. Har bir do'konga **6 belgili tasodifiy kod** beriladi. Do'konchi **telefon raqami + kod** bilan kiradi. Kodni agent do'konga olib boradi |
| Y8 | Qaytarish (vozvrat) kerak emas |
| Y10 | Keshbek bor, foizi keyin admin paneldan belgilanadi |
| Boshqalar | Tavsiya etilganicha tasdiqlandi (Y2–Y7, Y9, Y11–Y13, dizayn) |

## Bosqichlar

### 1-bosqich — Tozalash va brend
- [ ] MUSA brendi, logo, ranglar, matnlar → Trade Avenue (vaqtincha neytral dizayn)
- [ ] Firebase / bot / domen sozlamalari bo'sh shablonga (yangi loyiha ochilganda to'ldiriladi)
- [ ] Olib tashlash: onlayn to'lov, ovozlar, sharhlar, kuryer bahosi, bepul yetkazish chizig'i,
      jonli kuzatish, trafik manbalari, "Miya"

### 2-bosqich — Do'kon kirishi (Y1, Y12)
- [ ] Admin → "Do'konlar": Linko `markets/` dan sinxron, 6 belgili kod yaratish/yangilash, kod kartasini chop etish
- [ ] Mini app: telefon + kod bilan kirish (urinishlar soni cheklangan), Telegram akkauntga bog'lanadi
- [ ] Bir akkauntga bir nechta do'kon (filiallar) va ular orasida almashish
- [ ] Narx va buyurtma faqat bog'langan do'konlar uchun

### 3-bosqich — Ulgurji savdo
- [ ] Y2: narxlar Linko narx ro'yxatlaridan, har do'konning o'z narx ro'yxati; miqdorga qarab chegirma
- [ ] Buyurtma Linko'ga aynan shu do'kon (`market`) va uning agenti nomidan yuboriladi
- [ ] Y4: buyurtmani takrorlash, "Doimiy ro'yxat" (sevimlilar o'rniga)
- [ ] Y5: yetkazish kunlari va qabul qilishning oxirgi vaqti
- [ ] Y7: tavsiya etilgan chakana narx va foyda ko'rsatkichi

### 4-bosqich — Moliya
- [ ] Y3: nasiya — qarz limiti, to'lov muddati, to'lovlarni kiritish, akt-sverka, botda eslatma
- [ ] Y10: keshbek (foizi sozlamada)
- [ ] Y13: nakladnoy / hisob-faktura PDF

### 5-bosqich — Xodimlar ilovasi va qo'shimchalar
- [ ] Y6: agent rejimi (o'z do'konlari, do'kon nomidan buyurtma, tashrif belgisi); kuryer → yetkazuvchi
- [ ] Y9: "Kelganda xabar ber"
- [ ] Y11: do'konchi statistikasi

### 6-bosqich — Do'konlarga mos dizayn
- [ ] Zich ro'yxat ko'rinishi, ro'yxatda `+ / −`, dona/quti narxi, qoldiq
- [ ] Ixcham bosh sahifa: aksiyalar, qayta buyurtma, kategoriyalar

## Ochiq savollar
- Logo va brend ranglari (hozircha neytral to'q ko'k)
- Bot username, domen, yangi Firebase loyihasi
- Keshbek foizi
