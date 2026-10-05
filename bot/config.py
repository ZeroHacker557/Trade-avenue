# ═══════════════════════════════════════════════════════════
# MUSA Shop — bot sozlamalari
#
# Frontend tomonidagi mos fayllar:
#   src/config/brand.ts     — bot username, aloqa ma'lumotlari
#   src/config/firebase.ts  — Firebase web config
#
# MAXFIY qiymatlar (BOT_TOKEN) bu faylda EMAS — ular `bot/.env`
# faylida turadi, u esa .gitignore'da. Namuna: bot/.env.example
# ═══════════════════════════════════════════════════════════
import os
from pathlib import Path


def _load_env() -> None:
    """
    bot/.env faylini o'qib, os.environ ga yozadi.

    python-dotenv qo'shmaslik uchun qo'lda: bot yagona bog'liqligi
    aiogram bo'lib qolsin. Allaqachon mavjud env o'zgaruvchisi
    ustidan yozilmaydi — server muhitida env kuchliroq bo'ladi.
    """
    path = Path(__file__).with_name(".env")
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_env()

# ── Telegram ──
# Token .env dan keladi. Bo'sh bo'lsa bot ishga tushmaydi (bot.py tekshiradi).
BOT_TOKEN    = os.environ.get("BOT_TOKEN", "")
# Linko katalogini sinxronlash uchun /api/linko-cron kaliti.
# Bo'sh bo'lsa bot sinxronni chaqirmaydi (Vercel cron baribir ishlaydi).
CRON_SECRET  = os.environ.get("CRON_SECRET", "")
BOT_USERNAME = "musauz_bot"
ADMIN_IDS    = {7203124812}   # Egalar — panel orqali o'chirib bo'lmaydi
# BotFather /setdomain da ham aynan shu domen ko'rsatilgan bo'lishi kerak.
MINI_APP_URL = "https://musa-delivery.vercel.app"
# Admin panel — o'sha domendagi alohida sahifa. Bot uni faqat
# adminlarga ko'rsatadi va u Telegram oynasida to'liq ekranda ochiladi.
ADMIN_PANEL_URL = f"{MINI_APP_URL}/admin.html"

# ── Kompaniya aloqa ma'lumotlari (bot javoblarida ko'rinadi) ──
# Frontend tomonidagi nusxasi: src/config/brand.ts
COMPANY_NAME     = "MUSA"
COMPANY_TAGLINE  = "Muzlatilgan mahsulotlar"
SUPPORT_PHONE    = "+998 97 400 98 77"
SUPPORT_EMAIL    = "abubakrfrontend@gmail.com"
SUPPORT_TELEGRAM = "@for_name"
COMPANY_CITY     = "Toshkent, O'zbekiston"
WORK_HOURS       = "09:00 — 20:00"

# ── Firebase ──
# Service account JSON fayli (loyiha ildizida yoki bot/ papkasida).
# Firebase Console → Project Settings → Service accounts →
# "Generate new private key". Fayl .gitignore'da.
FIREBASE_KEY_FILE       = "musa-onlineshop-firebase-adminsdk-fbsvc-f51dff6a35.json"
# Storage bucket — mahsulot rasmlari shu yerga yuklanadi.
# Console → Storage → bucket nomi (odatda <project-id>.firebasestorage.app).
# src/config/firebase.ts dagi storageBucket bilan bir xil bo'lishi shart.
FIREBASE_STORAGE_BUCKET = "musa-onlineshop.firebasestorage.app"

# ── Server ──
API_HOST     = "0.0.0.0"
API_PORT     = 8080
IMAGES_DIR   = "images"
DB_FILE      = "database.json"

# To'lov sozlamalari — faqat BOSHLANG'ICH qiymat.
# Bot birinchi ishga tushganda bular Firestore'dagi settings/payment
# hujjatiga ko'chiriladi. Undan keyin haqiqiy manba — o'sha hujjat (F-07).
CARD_NUMBER = "5614 6818 1872 7921"
CARD_OWNER  = "Abubakir Abdulbositov"
