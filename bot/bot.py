"""
Trade Avenue Telegram Bot — Mini App + To'lov cheki

Trade Avenue — do'konlar uchun ulgurji savdo: do'konchi mini app orqali
tovar buyurtma qiladi, bot esa katalog tugmasi, chek va xabarlarni beradi.
"""
import asyncio
import hashlib
import hmac
import json
import logging
import time
from datetime import datetime, timezone

import aiohttp
from aiogram import Bot, Dispatcher, F
from aiogram.types import (
    Message, WebAppInfo, InlineKeyboardButton,
    InlineKeyboardMarkup, ReplyKeyboardMarkup, KeyboardButton,
    MenuButtonWebApp, CallbackQuery, ChatMemberUpdated, Poll
)
from aiogram.filters import Command
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.client.default import DefaultBotProperties

# Karta ma'lumoti config.py dan emas, settings/payment hujjatidan olinadi (F-07)
from config import (
    BOT_TOKEN, MINI_APP_URL, ADMIN_PANEL_URL, CRON_SECRET,
)
# Adminlar ro'yxati dinamik — panel orqali qo'shiladi/o'chiriladi
from admins import all_admins, is_admin, can_open_panel
import firebase_db as db
import i18n as tr

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Token bot/.env dan keladi. Bo'lmasa aiogram tushunarsiz xato beradi —
# shuning uchun oldindan aniq xabar bilan to'xtatamiz.
if not BOT_TOKEN:
    raise SystemExit(
        "BOT_TOKEN topilmadi.\n"
        "bot/.env faylini yarating va tokenni yozing:\n"
        "    cp bot/.env.example bot/.env\n"
        "Token @BotFather dan olinadi."
    )

bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode="HTML"))
dp  = Dispatcher(storage=MemoryStorage())


# ─── FSM ─────────────────────────────────────────────────────

class PaymentUpload(StatesGroup):
    waiting_photo = State()


# ─── Klaviaturalar ────────────────────────────────────────────

def main_kb(admin: bool = False, lang: str = tr.DEFAULT):
    rows = [
        # Oddiy tugma — bosilganda pastdagi menyu tugmasiga yo'naltiradi.
        # Mini app faqat yozuv maydoni yonidagi "🛒 Katalog" orqali ochiladi.
        [KeyboardButton(text=tr.button("catalog", lang))],
        [KeyboardButton(text=tr.button("orders", lang))],
        [KeyboardButton(text=tr.button("contact", lang)), KeyboardButton(text=tr.button("help", lang))]
    ]
    # Admin panel tugmasi FAQAT adminlarda: oddiy mijoz uni umuman
    # ko'rmaydi. Bosilganda panel shu yerning o'zida ochiladi.
    if admin:
        rows.insert(0, [KeyboardButton(text=PANEL_BUTTON)])
    return ReplyKeyboardMarkup(keyboard=rows, resize_keyboard=True)


PANEL_BUTTON = "🛠 Admin panel"


def language_kb() -> InlineKeyboardMarkup:
    """Til tanlash — yangi mijozga /start da chiqadi."""
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text=tr.t("lang_uz"), callback_data="lang:uz"),
        InlineKeyboardButton(text=tr.t("lang_ru"), callback_data="lang:ru"),
    ]])


def panel_kb() -> InlineKeyboardMarkup:
    """
    Admin panelni ochadigan tugma — oddiy HAVOLA.

    Ilgari bu `web_app` tugmasi edi: panel Telegram oynasida ochilardi.
    Kompyuterda o'sha oyna telefon o'lchamida qolib ketardi, to'liq
    ekran esa Telegram versiyasiga bog'liq bo'lib, hamma joyda
    ishlamasdi. Oddiy havola brauzerni ochadi va panel butun ekranni
    egallaydi — admin uchun ish shu tarzda qulayroq.

    Kirish har safar so'ralmaydi: admin bir marta email/parol bilan
    kiradi, brauzer seansi saqlanadi.
    """
    return InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(
        text=PANEL_BUTTON,
        url=ADMIN_PANEL_URL,
    )]])


PANEL_TEXT = (
    "🛠 <b>Admin panel</b>\n"
    "——————————————\n\n"
    "Buyurtmalar, mahsulotlar, hisobotlar va sozlamalar — hammasi shu yerda.\n\n"
    "👇 Tugmani bosing — panel brauzerda, butun ekran bo‘ylab ochiladi.\n"
    "<i>Birinchi marta email va parol so'raladi, keyin esa o'zi kirib turadi.</i>"
)


def contact_kb(lang: str = tr.DEFAULT) -> ReplyKeyboardMarkup:
    """Telefon raqamini bir bosishda olish uchun (F-26)."""
    return ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=tr.button("phone", lang), request_contact=True)]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


def location_button(order_id: str) -> InlineKeyboardButton:
    """
    Bosilganda mijoz manzilini HAQIQIY Telegram lokatsiyasi sifatida
    yuboradi (havola emas). Uni kuryerga oddiy forward qilish mumkin.
    """
    return InlineKeyboardButton(
        text="📍 Lokatsiyani olish",
        callback_data=f"loc:{order_id}",
    )


def order_action_kb(order_id: str, has_location: bool = False) -> InlineKeyboardMarkup:
    """Admin uchun status tugmalari (+ lokatsiya, agar bo'lsa)"""
    rows = [
        [
            InlineKeyboardButton(text="✅ Qabul",     callback_data=f"os:Qabul qilindi:{order_id}"),
            InlineKeyboardButton(text="🚚 Yetkazish", callback_data=f"os:Yetkazilmoqda:{order_id}")
        ],
        [
            InlineKeyboardButton(text="🎉 Bajarildi", callback_data=f"os:Yetkazildi:{order_id}"),
            InlineKeyboardButton(text="❌ Rad etish", callback_data=f"os:Rad etildi:{order_id}")
        ],
    ]
    if has_location:
        rows.append([location_button(order_id)])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def catalog_kb(lang: str = tr.DEFAULT) -> InlineKeyboardMarkup:
    """
    Katalogni ochadigan inline tugma.

    Mijoz «🛒 Katalogni ochish» ni bosganda shu tugma chiqadi va
    do'kon bir bosishda ochiladi. Ilgari faqat «pastdagi menyu
    tugmasini toping» degan matn chiqardi — ko'pchilik o'sha tugmani
    topolmay qaytib ketardi.
    """
    return InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(
        text=tr.t("catalog_button", lang),
        web_app=WebAppInfo(url=MINI_APP_URL),
        # Tugma foni yashil (Bot API 9.4, `style`: danger/success/primary).
        # aiogram 3.13 bu maydonni bilmaydi, lekin qo'shimcha maydonlarni
        # o'tkazib yuboradi — Telegram'ga shundayligicha boradi. Eski
        # mijozlar uni e'tiborsiz qoldiradi: tugma odatdagi rangda chiqadi.
        style="success",
    )]])


def order_has_location(order: dict | None) -> bool:
    loc = (order or {}).get("customer", {}).get("location") or {}
    return isinstance(loc, dict) and loc.get("lat") is not None and loc.get("lng") is not None


def receipt_kb(order_id: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="💳 To'lov chekini yuborish", callback_data=f"receipt:{order_id}")]
    ])


def resend_receipt_kb(order_id: str, lang: str = tr.DEFAULT) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=tr.t("receipt_retry_button", lang), callback_data=f"receipt:{order_id}")]
    ])


def payment_confirm_kb(order_id: str, user_id: int, has_location: bool = False) -> InlineKeyboardMarkup:
    rows = [
        [
            InlineKeyboardButton(text="✅ Tasdiqlash", callback_data=f"pconf:ok:{order_id}:{user_id}"),
            InlineKeyboardButton(text="❌ Rad etish",  callback_data=f"pconf:no:{order_id}:{user_id}")
        ],
    ]
    if has_location:
        rows.append([location_button(order_id)])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def mini_app_kb(lang: str = tr.DEFAULT) -> InlineKeyboardMarkup:
    # Yorliq «Buyurtmalarimni ko'rish» bo'lgani uchun havola ham
    # ilovaning aynan shu bo'limini ochadi.
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text=tr.t("orders_webapp_button", lang),
            web_app=WebAppInfo(url=f"{MINI_APP_URL}?page=orders"),
        )]
    ])


# ─── Yordamchi funksiyalar ────────────────────────────────────

def get_display_name(order_data: dict) -> str:
    raw = order_data.get("username", "")
    if raw and " " not in raw.strip():
        return f"@{raw}"
    return raw or order_data.get("customer", {}).get("name", "—")


def get_products_text(products: list) -> str:
    lines = ""
    for i, p in enumerate(products, 1):
        qty      = p.get("quantity", 1)
        size     = p.get("size")
        color    = p.get("color")
        prod     = p.get("product") or p
        name     = prod.get("name", "—")
        price    = prod.get("price", 0)
        item_sum = db.format_price(price * qty)
        
        variant_info = []
        if size: variant_info.append(f"Vazn: {size}")
        if color: variant_info.append(f"Turi: {color}")
        var_text = f" ({', '.join(variant_info)})" if variant_info else ""
        
        lines += f"  <b>{i}. {name}</b>{var_text}\n"
        lines += f"     └ {qty} ta × {db.format_price(price)} = <b>{item_sum}</b>\n"
    return lines


# Telegram rasm izohi (caption) uchun chegara
CAPTION_LIMIT = 1024


def current_caption(msg) -> str:
    """Rasmli xabarning HTML izohi (formatlash saqlanadi)."""
    try:
        return msg.html_text or ""
    except Exception:
        return msg.caption or ""


def build_receipt_caption(order: dict | None, display_id: str) -> str:
    """
    Adminga yuboriladigan chek izohi: mijoz ma'lumotlari, mahsulotlar
    (turi va vazni bilan) hamda to'liq hisob-kitob.

    Telegram izohni 1024 belgi bilan cheklaydi — sig'masa mahsulotlar
    ro'yxati qisqartiriladi, mijoz ma'lumotlari esa doim to'liq qoladi.
    """
    head = "💳 <b>TO'LOV CHEKI</b>\n" + "━" * 22 + "\n\n"
    head += f"🧾 <b>Buyurtma:</b> {display_id}\n"

    if not order:
        return head + "\n⚠️ Buyurtma ma'lumotlari topilmadi."

    customer = order.get("customer", {})
    head += f"📅 {db.order_date_text(order)}\n\n"
    head += f"👤 <b>Ism:</b> {customer.get('name', '—')}\n"
    head += f"📱 <b>Telegram:</b> {get_display_name(order)}\n"
    head += f"📞 <b>Tel:</b> <code>{customer.get('phone', '—')}</code>\n"
    head += f"📍 <b>Manzil:</b> {customer.get('address', '—')}\n"
    if customer.get("comment"):
        head += f"💬 <b>Izoh:</b> {customer['comment']}\n"

    # ── Hisob-kitob ──
    tail = "\n" + "━" * 22 + "\n"
    subtotal = order.get("subtotal")
    discount = order.get("discount") or 0
    delivery_fee = order.get("deliveryFee") or 0
    if isinstance(subtotal, (int, float)) and (discount or delivery_fee):
        tail += f"🧾 Mahsulotlar: {db.format_price(subtotal)}\n"
        if discount:
            promo = order.get("promoCode")
            promo_text = f" ({promo})" if promo else ""
            tail += f"🏷 Chegirma{promo_text}: -{db.format_price(discount)}\n"
        if delivery_fee:
            tail += f"🚚 Yetkazish: {db.format_price(delivery_fee)}\n"
        else:
            tail += "🚚 Yetkazish: bepul\n"

    total = order.get("total", 0)
    total_str = db.format_price(total) if isinstance(total, (int, float)) else str(total)
    tail += f"💰 <b>To'langan summa: {total_str}</b>"

    # ── Mahsulotlar ──
    products = order.get("products", [])
    lines = []
    for i, item in enumerate(products, 1):
        qty = item.get("quantity", 1)
        prod = item.get("product") or item
        name = prod.get("name", "—")
        price = prod.get("price", 0)

        variant = []
        if item.get("size"):
            variant.append(f"Vazn: {item['size']}")
        if item.get("color"):
            variant.append(f"Turi: {item['color']}")
        var_text = f" ({', '.join(variant)})" if variant else ""

        lines.append(
            f"  <b>{i}. {name}</b>{var_text}\n"
            f"     └ {qty} ta × {db.format_price(price)} = <b>{db.format_price(price * qty)}</b>\n"
        )

    body_header = "\n📦 <b>Mahsulotlar:</b>\n"
    shown = list(lines)
    while shown:
        hidden = len(lines) - len(shown)
        more = f"  <i>...va yana {hidden} ta mahsulot</i>\n" if hidden else ""
        caption = head + body_header + "".join(shown) + more + tail
        if len(caption) <= CAPTION_LIMIT:
            return caption
        shown.pop()

    return head + body_header + f"  <i>{len(lines)} ta mahsulot</i>\n" + tail


# ─── Yangi buyurtma: Admin + User bildirishnomasi ─────────────

async def notify_admin_cancel(order_data: dict):
    """Mijoz buyurtmani bekor qilganda adminga xabar (5-band)."""
    try:
        customer = order_data.get("customer", {})
        display_id = db.order_display_id(order_data)
        total = order_data.get("total", 0)
        total_str = db.format_price(total) if isinstance(total, (int, float)) else str(total)

        cust_name = customer.get("name") or "—"
        cust_phone = customer.get("phone") or "—"

        text = f"\u274c <b>BUYURTMA BEKOR QILINDI</b>\n"
        text += "\u2501" * 22 + "\n\n"
        text += f"\U0001f9fe Buyurtma: <b>{display_id}</b>\n"
        text += f"\U0001f464 Mijoz: {cust_name}\n"
        text += f"\U0001f4de Tel: <code>{cust_phone}</code>\n"
        text += f"\U0001f4b0 Summa: <b>{total_str}</b>\n\n"
        text += "\U0001f4e6 <b>Mahsulotlar:</b>\n"
        for item in order_data.get("products", []):
            prod = item.get("product") or item
            text += f"  \u2022 {prod.get('name', '?')} \u00d7 {item.get('quantity', 1)}\n"
        text += "\n<i>Mijozning o'zi bekor qildi. Ombor qoldig'i qaytarildi.</i>"

        for admin_id in all_admins():
            try:
                await bot.send_message(admin_id, text)
            except Exception as e:
                logger.warning(f"[CANCEL] {admin_id} ga yuborib bo'lmadi: {e}")

        logger.info(f"[CANCEL] {display_id} bekor qilindi")
    except Exception as e:
        logger.error(f"[CANCEL] xato: {e}", exc_info=True)


# ─── Status o'zgartirish → Usergа xabar ──────────────────────

# ─── Admin tugmalari ───────────────────────────────
#
# Yangi buyurtma tushganda admin panel (Vercel) adminlarga shaxsiy
# xabar yuboradi: tavsilotlar + «✅ Qabul qilindi» va «🖥 Admin
# paneldan ochish» tugmalari. Birinchisini shu yerda ishlaymiz.


async def api_admin_action(telegram_id: int, action: str, order_id: str, extra: dict | None = None):
    """
    Admin panelning `/api/admin/action` funksiyasini chaqiradi.

    Nega bot o'zi Firestore'ga yozmaydi? Holat o'zgarishi yolg'iz
    yozuv emas: tarix qo'shiladi, kuryerga/guruhga xabar ketadi,
    mijozga bildirishnoma boradi, boshqa adminlarning tugmasi
    yangilanadi, Linko xabardor qilinadi. Bularning hammasi
    TypeScript'da (orders.ts → applyStatusEffects). Botda qayta
    yozilsa ikki nusxa paydo bo'lib, vaqt o'tib bir-biridan farq
    qilib ketardi.

    So'rov BOT_TOKEN bilan imzolanadi — server shu imzoga qarab
    «bu haqiqatan bizning botimiz» deb ishonadi, kim bosgani esa
    `staff.telegramId` bo'yicha topiladi.
    """
    ts = str(int(time.time()))
    payload = f"{telegram_id}.{action}.{order_id}.{ts}"
    signature = hmac.new(
        BOT_TOKEN.encode(), payload.encode(), hashlib.sha256
    ).hexdigest()

    url = f"{MINI_APP_URL.rstrip('/')}/api/admin/action"
    body = {"action": action, "orderId": order_id, **(extra or {})}
    headers = {
        "Content-Type": "application/json",
        "x-bot-actor": str(telegram_id),
        "x-bot-ts": ts,
        "x-bot-signature": signature,
    }

    timeout = aiohttp.ClientTimeout(total=25)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(url, json=body, headers=headers) as response:
            try:
                data = await response.json(content_type=None)
            except Exception:
                data = {"error": await response.text()}
            return response.status, data or {}


async def api_order_status(telegram_id: int, order_id: str, status: str):
    """Admin botdan buyurtmani tasdiqlaganda."""
    return await api_admin_action(telegram_id, "order.status", order_id, {"status": status})


@dp.callback_query(F.data.startswith("adm:"))
async def cb_admin(callback: CallbackQuery):
    _, action, order_id = callback.data.split(":", 2)

    if action != "acc":
        await callback.answer()
        return

    await callback.answer("Yuborilmoqda…")

    try:
        code, data = await api_order_status(
            callback.from_user.id, order_id, "Qabul qilindi"
        )
    except Exception as e:
        logger.error(f"[ADMIN] {order_id} tasdiqlanmadi: {e}", exc_info=True)
        await callback.answer(
            "Server bilan bog'lanib bo'lmadi — admin paneldan urinib ko'ring",
            show_alert=True,
        )
        return

    if code != 200:
        message = (data or {}).get("error") or "Bajarilmadi"
        await callback.answer(message, show_alert=True)
        return

    if data.get("unchanged"):
        await callback.answer("Bu buyurtma allaqachon tasdiqlangan")
    else:
        await callback.answer("✅ Tasdiqlandi — kuryerga yuborildi")

    # Tugmani server o'zi yangilaydi (refreshAdminMessages). Lekin xabar
    # boshqa adminga yuborilmagan bo'lishi ham mumkin — masalan admin
    # buyurtmani /start dan keyin qo'lda topgan. Shunda hech bo'lmasa
    # bosilgan xabarni o'zimiz yangilaymiz.
    try:
        await callback.message.edit_reply_markup(
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text="✅ Qabul qilindi", callback_data="noop")]
            ])
        )
    except Exception:
        pass


# ─── Kuryer tugmalari (eski xabarlar) ────────────────────────
#
# Kuryer endi buyurtmani mini app ichida oladi va yetkazadi, bot esa
# faqat «Sizni #… buyurtma kutmoqda» deb xabar beradi. Bu ishlovchi
# oldin yuborilgan xabarlardagi «Oldim / Yetkazdim» tugmalari uchun
# qoldi — ular ham mini app bilan BIR XIL server yo'lidan o'tadi
# (api/_lib/actions/courier.ts): atomar band qilish, mijozga xabar,
# Linko, baho so'rovi va boshqa kuryerlardagi xabarlarni yangilash.

COURIER_ACTIONS = {"take": "courier.take", "done": "courier.deliver"}

COURIER_OUTCOMES = {
    # natija: (matn, ogohlantirish oynasida ko'rsatilsinmi)
    "claimed": ("Qabul qilindi — yo'lga chiqing 🛵", False),
    "already": ("Bu buyurtma allaqachon sizda", False),
    "taken": ("Bu buyurtmani {who} oldi", True),
    "closed": ("Bu buyurtma yopilgan yoki hali tasdiqlanmagan", True),
    "not_found": ("Buyurtma topilmadi", True),
    "done": ("Yetkazildi ✅ Rahmat!", False),
    "not_yours": ("Bu buyurtma sizga biriktirilmagan", True),
}


@dp.callback_query(F.data.startswith("crr:"))
async def cb_courier(callback: CallbackQuery):
    _, action, order_id = callback.data.split(":", 2)
    server_action = COURIER_ACTIONS.get(action)
    if not server_action:
        await callback.answer()
        return

    try:
        code, data = await api_admin_action(callback.from_user.id, server_action, order_id)
    except Exception as e:
        logger.error(f"[COURIER] {order_id} {action}: {e}", exc_info=True)
        await callback.answer(
            "Server bilan bog'lanib bo'lmadi — ilovadan urinib ko'ring",
            show_alert=True,
        )
        return

    if code != 200:
        await callback.answer(data.get("error") or "Bajarilmadi", show_alert=True)
        return

    text, alert = COURIER_OUTCOMES.get(data.get("outcome"), ("Bajarildi", False))
    await callback.answer(
        text.format(who=data.get("courierName") or "boshqa kuryer"),
        show_alert=alert,
    )
    # Xabarlarning o'zini server yangilaydi (updateCourierMessages)


@dp.callback_query(F.data == "noop")
async def cb_noop(callback: CallbackQuery):
    """Faqat holatni ko'rsatuvchi tugma — bosilganda hech narsa qilmaydi."""
    await callback.answer()


@dp.callback_query(F.data.startswith("os:"))
async def cb_order_status(callback: CallbackQuery):
    """
    Eski xabarlardagi holat tugmalari.

    Holat endi veb admin paneldan o'zgartiriladi. Tugmalar eski
    xabarlarda qolib ketgan — bosilganda jim turmasin, tushuntirib
    qo'yamiz.
    """
    await callback.answer(
        "Holat endi admin paneldan o'zgartiriladi",
        show_alert=True,
    )


# ─── Chek yuborish ────────────────────────────────────────────

@dp.callback_query(F.data.startswith("receipt:"))
async def cb_start_receipt(callback: CallbackQuery, state: FSMContext):
    order_id = callback.data.split("receipt:", 1)[-1]
    await state.update_data(receipt_order_id=order_id)
    await state.set_state(PaymentUpload.waiting_photo)
    lang = tr.normalize(db.get_user_language(callback.from_user.id))
    await callback.message.answer(tr.t("receipt_ask", lang))
    await callback.answer()


@dp.message(PaymentUpload.waiting_photo, F.photo)
async def handle_receipt_photo(message: Message, state: FSMContext):
    data     = await state.get_data()
    order_id = data.get("receipt_order_id", "—")
    user_id  = message.from_user.id

    order   = db.get_order_by_id(order_id) if order_id != "—" else None
    display_id = db.order_display_id(order) if order else order_id
    caption = build_receipt_caption(order, display_id)

    try:
        for admin_id in all_admins():
            try:
                await bot.send_photo(admin_id,
                                     photo=message.photo[-1].file_id,
                                     caption=caption,
                                     reply_markup=payment_confirm_kb(
                                         order_id, user_id, order_has_location(order)))
            except Exception as e:
                logger.warning(f"[RECEIPT] Admin {admin_id} ga yuborib bo'lmadi: {e}")
        logger.info(f"[RECEIPT] Adminga yo'naltirildi: {order_id} ← {user_id}")
    except Exception as e:
        logger.error(f"[RECEIPT] Adminga yuborib bo'lmadi: {e}")

    await state.clear()
    lang = tr.normalize(db.get_user_language(user_id))
    await message.answer(tr.t("receipt_sent", lang))


@dp.message(PaymentUpload.waiting_photo)
async def handle_receipt_wrong(message: Message):
    lang = tr.normalize(db.get_user_language(message.from_user.id))
    await message.answer(tr.t("receipt_photo_only", lang))


# ─── Admin: To'lovni tasdiqlash / rad etish ──────────────────

@dp.callback_query(F.data.startswith("pconf:"))
async def cb_payment_confirm(callback: CallbackQuery):
    if not is_admin(callback.from_user.id):
        await callback.answer("Sizda ruxsat yo'q", show_alert=True)
        return

    parts    = callback.data.split(":")
    action   = parts[1]        # ok | no
    order_id = parts[2]        # Firestore hujjat id'si
    user_id  = int(parts[3])

    order      = db.get_order_by_id(order_id)
    display_id = db.order_display_id(order) if order else order_id

    # Ikkinchi admin ham xuddi shu chekni olgan bo'ladi. U kechroq
    # tugma bossa, mijozga takroriy xabar ketmasligi kerak.
    current = (order or {}).get("paymentStatus")
    if current in ("Tolangan", "Rad etildi"):
        already = "tasdiqlangan" if current == "Tolangan" else "rad etilgan"
        try:
            await callback.message.edit_reply_markup(reply_markup=None)
        except Exception:
            pass
        await callback.answer(f"Bu chek allaqachon {already}", show_alert=True)
        return

    approved = action == "ok"
    db.update_payment_status(order_id, "Tolangan" if approved else "Rad etildi")
    logger.info(f"[PAY] {'Tasdiqlandi' if approved else 'Rad etildi'}: {order_id}")

    # ── Mijozga xabar (bitta, faqat bir marta) ──
    lang = tr.normalize(db.get_user_language(user_id))
    try:
        if approved:
            await bot.send_message(
                user_id, tr.t("pay_approved", lang, order=display_id),
                reply_markup=mini_app_kb(lang),
            )
        else:
            await bot.send_message(
                user_id, tr.t("pay_rejected", lang, order=display_id),
                reply_markup=resend_receipt_kb(order_id, lang),
            )
    except Exception as e:
        logger.warning(f"[PAY] Mijozga xabar yuborilmadi: {e}")

    # ── Chek xabarini SHU YERNING O'ZIDA yangilaymiz ──
    # Ilgari bu yerda har bir adminga alohida "statusni o'zgartiring"
    # xabari yuborilardi. Natijada tasdiqlashdan keyin ortiqcha xabarlar
    # to'planib qolardi, holbuki status tugmalari shu xabarga sig'adi.
    mark = "✅ <b>TO'LOV TASDIQLANDI</b>" if approved else "❌ <b>CHEK RAD ETILDI</b>"
    hint = "Endi buyurtma holatini belgilang 👇" if approved else "Mijoz yangi chek yuborishi kutilmoqda."
    try:
        await callback.message.edit_caption(
            caption=current_caption(callback.message) + f"\n\n{mark}\n{hint}",
            reply_markup=order_action_kb(order_id, order_has_location(order)) if approved else None,
        )
    except Exception as e:
        logger.warning(f"[PAY] Chek xabarini yangilab bo'lmadi: {e}")

    await callback.answer("✅ Tasdiqlandi" if approved else "❌ Rad etildi")


# ─── Lokatsiyani yuborish ────────────────────────────────────

@dp.callback_query(F.data.startswith("loc:"))
async def cb_send_location(callback: CallbackQuery):
    """
    Mijoz manzilini haqiqiy Telegram lokatsiyasi sifatida yuboradi.

    Havola emas, venue xabari — uni kuryerga oddiy forward qilish
    mumkin va u xaritada ochiladi.
    """
    if not is_admin(callback.from_user.id):
        await callback.answer("Sizda ruxsat yo'q", show_alert=True)
        return

    order_id = callback.data[len("loc:"):]
    order = db.get_order_by_id(order_id)

    if not order:
        await callback.answer("Buyurtma topilmadi", show_alert=True)
        return

    customer = order.get("customer", {})
    loc = customer.get("location") or {}
    lat, lng = loc.get("lat"), loc.get("lng")

    if lat is None or lng is None:
        await callback.answer("Bu buyurtmada lokatsiya yo'q", show_alert=True)
        return

    display_id = db.order_display_id(order)
    title = f"{customer.get('name') or 'Mijoz'} — {display_id}"
    address = customer.get("address") or "Manzil ko'rsatilmagan"

    try:
        # send_venue — pin + nom + manzil. Forward qilinadi, xaritada ochiladi.
        await bot.send_venue(
            callback.from_user.id,
            latitude=float(lat),
            longitude=float(lng),
            title=title[:255],
            address=address[:255],
        )
        await callback.answer("Lokatsiya yuborildi")
        logger.info(f"[LOC] {display_id} -> {callback.from_user.id}")
    except Exception as e:
        logger.error(f"[LOC] yuborilmadi: {e}")
        await callback.answer("Lokatsiyani yuborib bo'lmadi", show_alert=True)


# ─── Buyurtmalarim ─────────────────────────────
#
# Buyurtmalar botda KO'RSATILMAYDI — faqat ilovada.
#
# Ilgari bot har bir buyurtmani to'liq matn bilan chiqarardi:
# mahsulotlar, holat, summa. Bir necha buyurtma bo'lsa xabar juda
# uzun bo'lib ketardi, holat esa o'zgarganda xabardagi matn eski
# holida qolib ketardi. Ilovada holat real vaqtda yangilanadi.


def my_orders_kb(lang: str = tr.DEFAULT) -> InlineKeyboardMarkup:
    """Ilovaning «Buyurtmalarim» bo'limini bevosita ochadi."""
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text=tr.t("orders_button", lang),
            web_app=WebAppInfo(url=f"{MINI_APP_URL}?page=orders"),
        )]
    ])


@dp.message(F.text.in_(tr.labels("orders")))
async def handle_my_orders(message: Message):
    lang = tr.normalize(db.get_user_language(message.from_user.id))
    orders = db.get_user_orders(message.from_user.id)

    if not orders:
        await message.answer(tr.t("orders_empty", lang), reply_markup=my_orders_kb(lang))
        return

    CLOSED = ("Yetkazildi", "Bekor qilingan", "Rad etildi")
    active = [o for o in orders if o.get("status") not in CLOSED]

    text = tr.t("orders_list", lang, total=len(orders), active=len(active))

    rows = list(my_orders_kb(lang).inline_keyboard)

    # Chek yuborish ilovada EMAS, botda bo'lishi kerak: mijoz rasm
    # jo'natadi. Shuning uchun karta to'lovi kutilayotgan
    # buyurtmalar uchun tugma shu yerda qoladi.
    for o in orders[:5]:
        if o.get("paymentMethod") != "Karta":
            continue
        pay = o.get("paymentStatus", "")
        if pay == "Tolangan":
            continue
        doc_id = o.get("_doc_id", "")
        if not doc_id:
            continue
        label = tr.t("receipt_again", lang) if pay == "Rad etildi" else tr.t("receipt_send", lang)
        rows.append([InlineKeyboardButton(
            text=f"💳 {db.order_display_id(o)} — {label}",
            callback_data=f"receipt:{doc_id}",
        )])

    await message.answer(text, reply_markup=InlineKeyboardMarkup(inline_keyboard=rows))


# ─── Kanal: bot qo'shildi / chiqarildi ─────────────────────

@dp.my_chat_member()
async def on_bot_membership(update: ChatMemberUpdated):
    """Bot kanalga admin qilib qo'shilsa — admin panel uni «Topilgan
    kanallar» ro'yxatida ko'rsatadi (yopiq kanalni ham bir bosishda ulash
    uchun). Chiqarilsa yoki huquqi olinsa — holat yangilanadi."""
    chat = update.chat
    if chat.type not in ("channel", "group", "supergroup"):
        return
    await asyncio.to_thread(
        db.save_bot_chat, chat.id, chat.type, chat.title or "", chat.username,
        getattr(update.new_chat_member.status, "value", update.new_chat_member.status),
    )


@dp.poll()
async def on_poll_update(poll: Poll):
    """Bot yuborgan so'rovnoma (kanalda) — har ovozda yangi natija keladi."""
    options = [{"text": o.text, "voters": o.voter_count} for o in poll.options]
    await asyncio.to_thread(db.save_poll, poll.id, options, poll.total_voter_count, poll.is_closed)


# ─── /start ──────────────────────────────────────────────────

@dp.message(F.text.startswith("/start"))
async def cmd_start(message: Message, state: FSMContext):
    user     = message.from_user
    # Panelga kira oladiganlar: adminlar va paneldagi owner/admin xodimlar
    admin = can_open_panel(user.id)

    lang = db.get_user_language(user.id)

    # Yangi mijoz — avval til. Faqat chek havolasi bilan kelgan bo'lsa
    # («/start receipt_...») to'xtatmaymiz: unga to'lov ma'lumoti kerak.
    if lang is None and "receipt_" not in (message.text or ""):
        await message.answer(tr.t("lang_ask"), reply_markup=language_kb())
        return
    lang = tr.normalize(lang)

    # ── Deep link: /start receipt_<hujjat_id> ──
    # Yangi havolalar Firestore hujjat id'sini yuboradi. Eski havolalarda
    # "#" siz raqam kelardi — u ham ishlashda davom etadi (F-03).
    parts = message.text.split(" ", 1)
    if len(parts) > 1 and parts[1].startswith("receipt_"):
        raw_id = parts[1].replace("receipt_", "").strip()

        order = db.get_order_by_id(raw_id) or db.get_order_by_id(f"#{raw_id}")
        if order:
            order_id   = order.get("_doc_id", raw_id)
            display_id = db.order_display_id(order)
            products  = order.get("products", [])
            total     = order.get("total", 0)
            total_str = db.format_price(total) if isinstance(total, (int, float)) else str(total)

            await state.update_data(receipt_order_id=order_id)
            await state.set_state(PaymentUpload.waiting_photo)

            items_text = ""
            for p in products:
                qty   = p.get("quantity", 1)
                size  = p.get("size")
                color = p.get("color")
                prod  = p.get("product") or p
                name  = prod.get("name", "—")

                variant_info = []
                if size: variant_info.append(f"Vazn: {size}")
                if color: variant_info.append(f"Turi: {color}")
                var_text = f" ({', '.join(variant_info)})" if variant_info else ""

                items_text += f"  • {name}{var_text} × {qty}\n"

            pay_cfg = db.get_payment_settings()
            await message.answer(
                tr.t("pay_info", lang, order=display_id, items=items_text,
                     total=total_str, card=pay_cfg["cardNumber"], owner=pay_cfg["cardOwner"]),
                reply_markup=main_kb(admin, lang),
            )
        else:
            await message.answer(tr.t("order_not_found", lang), reply_markup=main_kb(admin, lang))
        return

    # ── Oddiy /start ──
    await send_welcome(message, user, admin, lang)


async def send_welcome(message: Message, user, admin: bool, lang: str):
    """Salomlashish xabari — /start da ham, til tanlangandan keyin ham."""
    await message.answer(tr.t("welcome", lang, name=user.first_name), reply_markup=main_kb(admin, lang))

    # Adminlarga panelga kirish tugmasi — mijozlarda bu xabar bo'lmaydi
    if admin:
        await message.answer(PANEL_TEXT, reply_markup=panel_kb())

    # Telefon raqami bu yerda so'ralmaydi — mijoz uni buyurtma berishda
    # rasmiylashtirish formasida o'zi yozadi.


# ─── Til tanlash ──────────────────────────────────────────────

@dp.message(F.text.in_({"/til", "/lang", "/language"}))
async def cmd_language(message: Message):
    """Tilni keyinroq ham almashtirish mumkin."""
    await message.answer(tr.t("lang_ask"), reply_markup=language_kb())


@dp.callback_query(F.data.startswith("lang:"))
async def cb_language(callback: CallbackQuery):
    lang = tr.normalize(callback.data.split(":", 1)[1])
    user = callback.from_user
    db.set_user_language(user.id, lang)
    await callback.answer()

    # Tanlov xabari o'z vazifasini bajardi — tasdiqqa aylanadi
    try:
        await callback.message.edit_text(tr.t("lang_saved", lang))
    except Exception as e:
        logger.debug(f"[LANG] xabar yangilanmadi: {e}")

    # Salomlashish va admin paneli — /start dagidek
    await send_welcome(callback.message, user, can_open_panel(user.id), lang)


@dp.message(F.contact)
async def handle_contact(message: Message):
    """Foydalanuvchi «Raqamni yuborish» tugmasini bosganda (F-26)."""
    contact = message.contact

    # Faqat o'z raqamini qabul qilamiz — boshqa odamning kontaktini emas
    lang = tr.normalize(db.get_user_language(message.from_user.id))
    if contact.user_id != message.from_user.id:
        await message.answer(tr.t("phone_foreign", lang), reply_markup=contact_kb(lang))
        return

    admin = can_open_panel(message.from_user.id)
    phone = contact.phone_number
    if not phone.startswith("+"):
        phone = f"+{phone}"

    if db.set_user_phone(message.from_user.id, phone):
        await message.answer(tr.t("phone_saved", lang, phone=phone), reply_markup=main_kb(admin, lang))
    else:
        await message.answer(tr.t("phone_failed", lang), reply_markup=main_kb(admin, lang))


@dp.message(F.text.in_(tr.labels("catalog")))
async def handle_open_catalog(message: Message):
    """
    Katalog tugmasi bosilganda do'konni ochadigan tugmani yuboradi.

    Reply-klaviatura tugmasining o'ziga `web_app` biriktirilmagan:
    u yozuv maydoni yonidagi doimiy menyu tugmasi bilan birga turadi
    va matn sifatida ham ishlashi kerak. Shuning uchun javob
    sifatida inline tugma beriladi — bir bosishda do'kon ochiladi.
    """
    lang = tr.normalize(db.get_user_language(message.from_user.id))
    await message.answer(tr.t("catalog_title", lang), reply_markup=catalog_kb(lang))


@dp.message(F.text.in_(tr.labels("contact")))
async def cmd_contact(message: Message):
    lang = tr.normalize(db.get_user_language(message.from_user.id))
    # Admin panel → Sozlamalar → «Biz bilan aloqa» (bo'sh bo'lsa config.py)
    c = db.get_contact_settings()
    await message.answer(tr.t(
        "contact", lang,
        telegram=c["telegram"], phone=c["phone"],
        email=c["email"], city=c["address"], hours=c["workHours"],
    ))


# ─── Admin: /panel ─────────────────────────────

@dp.message(Command("panel"))
async def cmd_panel(message: Message):
    """Admin panelni ochish tugmasini yuboradi (faqat adminlarga)."""
    if not can_open_panel(message.from_user.id):
        await message.answer("🛠 Bu buyruq faqat <b>adminlar</b> uchun.")
        return
    await message.answer(PANEL_TEXT, reply_markup=panel_kb())


@dp.message(F.text == PANEL_BUTTON)
async def handle_panel_button(message: Message):
    """
    Tugma matni kelib qolsa (eski mijozda `web_app` ishlamasa) —
    inline tugma bilan javob beramiz, admin baribir panelga kiradi.
    """
    if not can_open_panel(message.from_user.id):
        return
    await message.answer(PANEL_TEXT, reply_markup=panel_kb())


# ─── Kuryer: jonli joylashuv ─────────────────────────────────
#
# Kuryer botga bir marta «Jonli joylashuv» yuboradi — keyin Telegram uni
# FONDA o'zi yangilab turadi (mini app yopiq, ekran o'chiq bo'lsa ham).
# Har yangilanish `edited_message` bo'lib keladi. Biz uni admin xaritasiga
# (courier_locations) yozamiz. Firestore'ni ortiqcha yuklamaslik uchun bitta
# kuryerdan ko'pi bilan har 8 soniyada bir marta yoziladi.

LIVE_FOREVER = 0x7FFFFFFF          # «Men o'chirgunimcha»
LOCATION_MIN_INTERVAL = 8          # soniya
_last_location_write: dict[str, float] = {}

SHARE_LIVE_HELP = (
    "📍 <b>Jonli joylashuvni qanday yoqish kerak</b>\n\n"
    "1. Shu chatda pastdagi 📎 tugmasini bosing\n"
    "2. «Joylashuv» (Location) ni tanlang\n"
    "3. «Jonli joylashuvni ulashish» → <b>«Men o‘chirgunimcha»</b>\n\n"
    "Shundan keyin ilova yopiq bo‘lsa ham admin sizni xaritada ko‘radi.\n\n"
    "<i>Smena tugaganda xabardagi «Ulashishni to‘xtatish» ni bosing.</i>"
)


async def handle_courier_location(message: Message, edited: bool):
    courier = db.get_courier_by_telegram(message.from_user.id)
    if not courier:
        return  # Mijoz yoki begona — bu yerda ishlov berilmaydi

    loc = message.location
    now = time.time()
    last = _last_location_write.get(courier["uid"], 0)
    if edited and now - last < LOCATION_MIN_INTERVAL:
        return
    _last_location_write[courier["uid"]] = now

    live_until = None
    if loc.live_period and loc.live_period < LIVE_FOREVER:
        sent_at = message.date.timestamp() if message.date else now
        live_until = datetime.fromtimestamp(sent_at + loc.live_period, timezone.utc).isoformat()

    try:
        tracked = await asyncio.to_thread(
            db.save_courier_location, courier, loc.latitude, loc.longitude,
            loc.heading, loc.horizontal_accuracy, live_until,
        )
    except Exception as e:
        logger.warning(f"[LOCATION] {courier['uid']} yozilmadi: {e}")
        return

    if tracked < 0:
        # Dam olyapti va yetkazadigani yo'q — joylashuv saqlanmadi
        if not edited:
            await message.answer(
                "🌙 Siz hozir <b>dam olyapsiz</b> — joylashuvingiz saqlanmadi.\n\n"
                "Ishga chiqqaningizda ilovada «Ishdaman» ni yoqing, keyin joylashuvni qayta ulashing."
            )
        return
    if edited:
        return
    if loc.live_period:
        await message.answer(
            "✅ <b>Jonli joylashuv ulandi!</b>\n"
            "Admin sizni xaritada ko‘radi."
            "\n\n<i>Smena tugaganda xabardagi «Ulashishni to‘xtatish» ni bosing.</i>"
        )
    else:
        await message.answer(
            "📍 Joylashuv saqlandi, lekin bu <b>bir martalik</b>.\n\n" + SHARE_LIVE_HELP
        )


@dp.message(F.location)
async def on_location(message: Message):
    await handle_courier_location(message, edited=False)


@dp.edited_message(F.location)
async def on_location_update(message: Message):
    await handle_courier_location(message, edited=True)


@dp.message(Command("joylashuv"))
async def cmd_location_help(message: Message):
    if not db.get_courier_by_telegram(message.from_user.id):
        await message.answer("🛵 Bu buyruq faqat <b>kuryerlar</b> uchun.")
        return
    await message.answer(SHARE_LIVE_HELP)


# ─── Kuryer: /bugun ──────────────────────────────────────────

@dp.message(Command("bugun"))
async def cmd_today(message: Message):
    """
    Kuryerning bugungi ishi: nechta yetkazdi, nechtasi yo'lda va
    qo'lida qancha naqd pul bo'lishi kerak (kassaga topshirish uchun).
    """
    courier = db.get_courier_by_telegram(message.from_user.id)
    if not courier:
        await message.answer("🛵 Bu buyruq faqat <b>kuryerlar</b> uchun.")
        return

    r = db.courier_today(courier["uid"])
    months = ["yanvar", "fevral", "mart", "aprel", "may", "iyun",
              "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"]
    day = f"{r['date'].day}-{months[r['date'].month - 1]}"
    name = courier.get("name") or message.from_user.first_name

    lines = [
        f"🛵 <b>{name} — bugun, {day}</b>",
        "━" * 22,
        "",
        f"✅ Yetkazildi: <b>{len(r['delivered'])} ta</b>",
        f"🚚 Yo'lda: <b>{len(r['on_way'])} ta</b>",
        f"⏳ Olib ketish kutilmoqda: <b>{len(r['waiting'])} ta</b>",
        "",
        f"💵 Naqd pul (kassaga topshiriladi): <b>{db.format_price(r['cash'])}</b>",
        f"💳 Karta orqali to'langan: <b>{db.format_price(r['card'])}</b>",
    ]

    if r["delivered"]:
        lines += ["", "<b>Yetkazilganlar:</b>"]
        for o in r["delivered"][-15:]:
            # Karta va onlayn (WLCM) — naqdsiz
            pay = "💵" if (o.get("paymentMethod") or "Naqd") == "Naqd" else "💳"
            lines.append(f"{o['_at']:%H:%M} · {db.order_display_id(o)} · {db.format_price(o.get('total') or 0)} {pay}")
        if len(r["delivered"]) > 15:
            lines.append(f"<i>… va yana {len(r['delivered']) - 15} ta</i>")

    if r["on_way"]:
        lines += ["", "<b>Hozir yo'lda:</b>"]
        for o in r["on_way"][:10]:
            address = (o.get("customer") or {}).get("address") or "—"
            lines.append(f"{db.order_display_id(o)} · {address[:40]}")

    if not (r["delivered"] or r["on_way"] or r["waiting"]):
        lines += ["", "<i>Bugun hali buyurtma yo'q. Omad! 🍀</i>"]

    # Batafsil statistika va marshrut — mini app'dagi kuryer sahifasida
    kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="📱 Kuryer sahifasi", web_app=WebAppInfo(url=MINI_APP_URL)),
    ]])
    await message.answer("\n".join(lines), reply_markup=kb)


@dp.message(Command("group"))
async def cmd_group(message: Message):
    """
    Guruh identifikatorini aytadi.

    Admin panelda «Umumiy guruhga yuborish» uchun chat ID kerak. Uni
    qo'lda topish noqulay (manfiy raqam, oson xato qilinadi), shuning
    uchun botning o'zi aytadi: guruhga qo'shib, /group deb yozish kifoya.
    """
    chat = message.chat
    if chat.type == "private":
        await message.answer(
            "ℹ️ Bu buyruq <b>guruhda</b> ishlaydi.\n\n"
            "1️⃣ Botni guruhga qo'shing\n"
            "2️⃣ Uni admin qiling\n"
            "3️⃣ Guruhda <code>/group</code> deb yozing\n\n"
            "Bot guruh ID sini beradi — uni admin panel → Sozlamalar →\n"
            "«Umumiy guruhga» maydoniga qo'yasiz."
        )
        return

    await message.answer(
        f"🆔 <b>Guruh ID si:</b>\n\n<code>{chat.id}</code>\n\n"
        f"Nomi: {chat.title}\n\n"
        "Shu raqamni admin panel → Sozlamalar → «Umumiy guruhga» "
        "maydoniga nusxalang."
    )


@dp.message(F.text.in_(tr.labels("help") | {"/help"}))
async def cmd_help(message: Message):
    lang = tr.normalize(db.get_user_language(message.from_user.id))
    await message.answer(tr.t("help", lang))


# ─── WebApp sendData (fallback) ───────────────────────────────

@dp.message(F.web_app_data)
async def handle_webapp_data(message: Message):
    try:
        data       = json.loads(message.web_app_data.data)
        pay_method = data.get("paymentMethod", "Naqd")
        order_id   = data.get("id", "")
        # Xabarnomani /api/orders yuborgan — bu yerda takrorlamaymiz
        if pay_method == "Naqd":
            lang = tr.normalize(db.get_user_language(message.from_user.id))
            await message.answer(tr.t("order_cash_ok", lang, order=order_id))
    except Exception as e:
        logger.error(f"WebApp data: {e}")
        lang = tr.normalize(db.get_user_language(message.from_user.id))
        await message.answer(tr.t("error_retry", lang))


# ─── Fon vazifalari ───────────────────────────────────────────
#
# Ikkalasi ham bot ishlab turganda bajariladi. Bot o'chiq bo'lsa
# eslatma yuborilmaydi — buyurtma oqimiga ta'sir qilmaydi, faqat
# qo'shimcha turtki bo'lgani uchun shunday qoldirilgan.

# Savat to'ldirilib, shuncha soat buyurtma bo'lmasa — eslatma
CART_REMINDER_HOURS = 2
# Eslatmalar qanchalik tez-tez tekshiriladi
CART_CHECK_MINUTES = 15
# Kunlik hisobot adminlarga shu soatda boradi (bot turgan kompyuter vaqti)
REPORT_HOUR = 21
# Linko katalogi shu oraliqda sinxronlanadi
LINKO_SYNC_MINUTES = 30


def cart_reminder_kb(lang: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(
        text=tr.t("cart_button", lang),
        web_app=WebAppInfo(url=MINI_APP_URL),
    )]])


async def send_cart_reminders():
    """Tashlab ketilgan savatlar uchun bitta eslatma."""
    try:
        rows = db.abandoned_carts(CART_REMINDER_HOURS)
    except Exception as e:
        logger.warning(f"[CART] savatlarni o'qib bo'lmadi: {e}")
        return

    for row in rows:
        lang = tr.normalize(row.get("language"))
        try:
            await bot.send_message(
                row["id"],
                tr.t("cart_left", lang, count=row["count"]),
                reply_markup=cart_reminder_kb(lang),
            )
            db.mark_cart_reminded(row["id"])
            logger.info(f"[CART] eslatma yuborildi: {row['id']} ({row['count']} ta)")
        except Exception as e:
            # Bloklagan yoki botni o'chirgan bo'lishi mumkin — qayta urinmaymiz
            logger.debug(f"[CART] {row['id']} ga yetmadi: {e}")
            db.mark_cart_reminded(row["id"])
        await asyncio.sleep(0.2)


async def cart_reminder_loop():
    while True:
        await asyncio.sleep(CART_CHECK_MINUTES * 60)
        try:
            await send_cart_reminders()
        except Exception as e:
            logger.warning(f"[CART] eslatma halqasi: {e}")


def daily_report_text() -> str:
    """Kunlik savdo hisoboti — adminlar uchun."""
    r = db.get_sales_report(1)
    lines = [
        "📊 <b>Bugungi hisobot</b>",
        "━" * 22,
        "",
        f"🧾 Buyurtma: <b>{r['orders']} ta</b>",
        f"✅ Yetkazildi: <b>{r['delivered']} ta</b>",
        f"🔄 Jarayonda: <b>{r['pending']} ta</b>",
        f"❌ Bekor/rad: <b>{r['cancelled']} ta</b>",
        "",
        f"💰 Tushum: <b>{db.format_price(r['revenue'])}</b>",
        f"🧮 O'rtacha chek: <b>{db.format_price(r['avg_check'])}</b>",
        f"👥 Yangi mijoz: <b>{r['new_customers']} ta</b>",
    ]

    if r["top_products"]:
        lines += ["", "<b>Eng ko'p sotilgani:</b>"]
        for item in r["top_products"][:5]:
            lines.append(f"• {item['name']} — {item['qty']} ta")

    if not r["orders"]:
        lines += ["", "<i>Bugun buyurtma bo'lmadi.</i>"]

    return "\n".join(lines)


async def send_daily_report():
    text = daily_report_text()
    for admin_id in all_admins():
        try:
            await bot.send_message(admin_id, text)
        except Exception as e:
            logger.debug(f"[REPORT] {admin_id} ga yetmadi: {e}")
        await asyncio.sleep(0.2)
    logger.info("[REPORT] Kunlik hisobot yuborildi")


async def linko_sync_loop():
    """
    Linko katalogini vaqti-vaqti bilan tortadi.

    Mantiq Vercel tomonida (api/linko-cron.ts) — bot faqat turtki
    beradi. Sababi: Vercel Hobby rejasida cron kuniga BIR MARTA
    ishlaydi, narx va qoldiq esa kun davomida o'zgaradi.
    """
    if not CRON_SECRET:
        logger.info("[LINKO] CRON_SECRET yo'q — sinxron o'tkazib yuborildi")
        return

    url = f"{MINI_APP_URL.rstrip('/')}/api/linko-cron"
    while True:
        await asyncio.sleep(LINKO_SYNC_MINUTES * 60)
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url,
                    headers={"x-cron-secret": CRON_SECRET},
                    timeout=aiohttp.ClientTimeout(total=120),
                ) as response:
                    data = await response.json(content_type=None)
            if response.status == 200:
                logger.info(f"[LINKO] {data.get('report') or 'sinxronlandi'}")
            else:
                logger.warning(f"[LINKO] sinxron xatosi {response.status}: {data}")
        except Exception as e:
            # Internet uzilishi yoki Vercel javob bermasligi — do'konga ta'sir qilmaydi
            logger.warning(f"[LINKO] sinxron bajarilmadi: {e}")


async def scheduler_loop():
    """
    Har daqiqada: rejalashtirilgan e'lonlar, aksiya boshlanganda e'lon va
    haftalik zaxira nusxa (mantiq — api/_lib/actions/scheduler.ts).

    Vercel funksiyasi uzoq ishlamaydi: mijozlarga yuborish bo'laklab
    boradi va javobda `more: true` bo'lsa — darhol yana chaqiramiz.
    """
    if not CRON_SECRET:
        logger.info("[TASKS] CRON_SECRET yo'q — jadval o'chiq")
        return

    url = f"{MINI_APP_URL.rstrip('/')}/api/linko-cron?tasks=1"
    while True:
        await asyncio.sleep(60)
        for _ in range(20):
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(
                        url,
                        headers={"x-cron-secret": CRON_SECRET},
                        timeout=aiohttp.ClientTimeout(total=90),
                    ) as response:
                        data = await response.json(content_type=None)
                if response.status != 200:
                    logger.warning(f"[TASKS] {response.status}: {data}")
                    break
                if not data.get("more"):
                    break
            except Exception as e:
                logger.warning(f"[TASKS] bajarilmadi: {e}")
                break


async def daily_report_loop():
    """
    Har kuni REPORT_HOUR da bir marta.

    Soat emas, SANA eslab qolinadi: bot kun davomida qayta ishga
    tushsa ham hisobot ikki marta ketmaydi.
    """
    sent_on = None
    while True:
        await asyncio.sleep(60)
        now = datetime.now()
        if now.hour == REPORT_HOUR and sent_on != now.date():
            sent_on = now.date()
            try:
                await send_daily_report()
            except Exception as e:
                logger.warning(f"[REPORT] yuborilmadi: {e}")


# ─── Main ─────────────────────────────────────────────────────

async def main():
    # Sozlama hujjatlari hali yo'q bo'lsa, boshlang'ich qiymatlar bilan yaratamiz
    db.ensure_payment_settings()
    db.ensure_delivery_settings()

    try:
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(text="🛒 Katalog", web_app=WebAppInfo(url=MINI_APP_URL))
        )
    except Exception as e:
        logger.warning(f"Menu button: {e}")

    loop = asyncio.get_running_loop()

    # Yangi buyurtma xabarnomasi bu yerda EMAS — uni /api/orders yuboradi
    # (api/_lib/actions/orders.ts → notifyNewOrder). Sababi: bot shaxsiy
    # kompyuterda ishlaydi va o'chiq bo'lishi mumkin, Vercel esa doim yoqiq.
    # Bekor qilish xabari hozircha shu yerda qoladi.
    def on_order_cancelled(order_data):
        asyncio.run_coroutine_threadsafe(notify_admin_cancel(order_data), loop)

    watch = db.listen_to_new_orders(None, on_order_cancelled)

    # Fon vazifalari: savat eslatmasi va kunlik hisobot
    tasks = [
        asyncio.create_task(cart_reminder_loop()),
        asyncio.create_task(daily_report_loop()),
        asyncio.create_task(linko_sync_loop()),
        asyncio.create_task(scheduler_loop()),
    ]

    logger.info("[BOT] Ishga tushdi ✅")

    try:
        await dp.start_polling(bot)
    finally:
        for task in tasks:
            task.cancel()
        watch.unsubscribe()
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
