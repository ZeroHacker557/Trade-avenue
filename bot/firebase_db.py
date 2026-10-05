"""
Firebase Firestore & Storage Integration for Python Telegram Bot
"""
import json
import math
import os
import uuid
import urllib.parse
from datetime import datetime, timedelta, timezone

import firebase_admin
from firebase_admin import credentials, firestore, storage

from config import (
    CARD_NUMBER, CARD_OWNER,
    FIREBASE_KEY_FILE, FIREBASE_STORAGE_BUCKET,
    SUPPORT_PHONE, SUPPORT_EMAIL, SUPPORT_TELEGRAM, COMPANY_CITY, WORK_HOURS,
)

KEY_FILENAME = FIREBASE_KEY_FILE


def _credentials():
    '''
    Service account kaliti.

    Serverda (Railway) fayl yo'q — u .gitignore'da. U yerda kalit JSON
    matni `FIREBASE_SERVICE_ACCOUNT` o'zgaruvchisida turadi. Kompyuterda
    esa avvalgidek fayldan (loyiha ildizida yoki bot/ papkasida).
    '''
    raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT", "").strip()
    if raw:
        return credentials.Certificate(json.loads(raw))
    key_path = KEY_FILENAME
    if not os.path.exists(key_path):
        key_path = os.path.join(os.path.dirname(__file__), "..", KEY_FILENAME)
    return credentials.Certificate(key_path)


if not firebase_admin._apps:
    cred = _credentials()
    firebase_admin.initialize_app(cred, {
        'storageBucket': FIREBASE_STORAGE_BUCKET
    })

db = firestore.client()
bucket = storage.bucket()


def format_price(amount: int | float) -> str:
    try:
        val = int(amount)
        return f"{val:,}".replace(",", " ") + " so'm"
    except (ValueError, TypeError):
        return f"{amount} so'm"


# ─── Storage Image Upload ─────────────────────────────────────

def upload_image_to_firebase(local_path: str) -> str:
    """Uploads a local image file to Firebase Storage and returns its public URL."""
    try:
        blob_name = f"products/{uuid.uuid4().hex}_{os.path.basename(local_path)}"
        blob = bucket.blob(blob_name)
        blob.upload_from_filename(local_path)
        
        # Standard public Firebase download URL format
        encoded_name = urllib.parse.quote(blob_name, safe='')
        url = f"https://firebasestorage.googleapis.com/v0/b/{bucket.name}/o/{encoded_name}?alt=media"
        print(f"[OK] Uploaded image to Firebase: {url}")
        return url
    except Exception as e:
        print(f"[ERR] Firebase Storage error: {e}")
        return ""


# ─── Products ─────────────────────────────────────────────────

def get_products():
    docs = db.collection("products").get()
    products = []
    for doc in docs:
        d = doc.to_dict()
        d["id"] = doc.id
        products.append(d)
    return products


def get_product_by_id(prod_id: str | int):
    doc_ref = db.collection("products").document(str(prod_id))
    doc = doc_ref.get()
    if doc.exists:
        d = doc.to_dict()
        d["id"] = doc.id
        return d
    return None


def add_product(data: dict):
    # Process local images if any and upload to Firebase Storage
    firebase_images = []
    for img in data.get("images", []):
        if img.startswith("http://") or img.startswith("https://"):
            firebase_images.append(img)
        else:
            # Check local images folder
            local_path = os.path.join("images", img)
            if not os.path.exists(local_path):
                local_path = img
            if os.path.exists(local_path):
                public_url = upload_image_to_firebase(local_path)
                if public_url:
                    firebase_images.append(public_url)
                else:
                    firebase_images.append(img)
            else:
                firebase_images.append(img)

    product_id = str(int(uuid.uuid4().int % 1000000))
    product_data = {
        "id": product_id,
        "name": data.get("name", ""),
        "price": data.get("price", 0),
        "oldPrice": data.get("oldPrice"),
        "category": data.get("category", ""),
        "images": firebase_images,
        "rating": 5.0,
        "reviews": 0,
        "sizes": data.get("sizes", []),
        "color": data.get("color", ""),
        "description": data.get("description", ""),
        "discount": data.get("discount", ""),
        # Ombor qoldig'i. Buyurtma berilganda server kamaytiradi.
        "stock": int(data.get("stock", 0) or 0),
    }

    db.collection("products").document(product_id).set(product_data)
    print(f"[OK] Firebase: Mahsulot saqlandi ({product_data['name']})")
    return product_data


def update_product(prod_id: str | int, updates: dict) -> bool:
    """Mahsulotning ayrim maydonlarini yangilaydi (narx, nom, qoldiq...)."""
    try:
        ref = db.collection("products").document(str(prod_id))
        if not ref.get().exists:
            return False
        ref.update(updates)
        print(f"[OK] Firebase: Mahsulot yangilandi ({prod_id}): {list(updates)}")
        return True
    except Exception as e:
        print(f"[ERR] update_product: {e}")
        return False


def delete_product(prod_id: str | int):
    db.collection("products").document(str(prod_id)).delete()
    print(f"[DEL] Firebase: Mahsulot o'chirildi ({prod_id})")


# ─── Categories ───────────────────────────────────────────────

def get_categories():
    docs = db.collection("categories").get()
    categories = []
    for doc in docs:
        d = doc.to_dict()
        d["id"] = doc.id
        categories.append(d)
    return categories


def get_category_by_id(cat_id: str | int):
    doc_ref = db.collection("categories").document(str(cat_id))
    doc = doc_ref.get()
    if doc.exists:
        d = doc.to_dict()
        d["id"] = doc.id
        return d
    return None


def add_category(name: str):
    cat_id = str(int(uuid.uuid4().int % 100000))
    cat_data = {"id": cat_id, "name": name, "icon": "package"}
    db.collection("categories").document(cat_id).set(cat_data)
    print(f"[OK] Firebase: Kategoriya qo'shildi ({name})")
    return cat_data


def delete_category(cat_id: str | int):
    db.collection("categories").document(str(cat_id)).delete()
    print(f"[DEL] Firebase: Kategoriya o'chirildi ({cat_id})")


# ─── Orders ───────────────────────────────────────────────
#
# Buyurtmaning yagona kaliti — Firestore hujjat id'si. Ilgari "id" maydonidagi
# "#1234567" ishlatilgan edi, u har ~2.8 soatda takrorlanib, noto'g'ri
# buyurtma yangilanishiga olib kelardi. Eski yozuvlar buzilmasligi uchun
# quyidagi funksiyalar avval hujjat id'sini, topilmasa "id" maydonini qidiradi.


def _order_ref(order_id: str):
    """Hujjat havolasini qaytaradi: avval doc.id, keyin eski 'id' maydoni."""
    ref = db.collection("orders").document(str(order_id))
    if ref.get().exists:
        return ref

    docs = db.collection("orders").where("id", "==", str(order_id)).limit(1).get()
    for doc in docs:
        return doc.reference
    return None


def update_order_status(order_id: str, new_status: str):
    try:
        ref = _order_ref(order_id)
        if ref is None:
            print(f"[ERR] Order {order_id} topilmadi")
            return False
        ref.update({"status": new_status})
        print(f"[OK] Order {order_id} status updated to {new_status}")
        return True
    except Exception as e:
        print(f"[ERR] Failed to update order status: {e}")
        return False


def update_payment_status(order_id: str, payment_status: str):
    """To'lov statusini yangilash"""
    try:
        ref = _order_ref(order_id)
        if ref is None:
            print(f"[ERR] Order {order_id} topilmadi")
            return False
        ref.update({"paymentStatus": payment_status})
        print(f"[OK] Order {order_id} payment status updated to {payment_status}")
        return True
    except Exception as e:
        print(f"[ERR] Failed to update payment status: {e}")
        return False


def get_order_by_id(order_id: str):
    """Buyurtmani hujjat id'si (yoki eski 'id' maydoni) bo'yicha olish"""
    try:
        ref = _order_ref(order_id)
        if ref is None:
            return None
        snap = ref.get()
        if not snap.exists:
            return None
        d = snap.to_dict()
        d["_doc_id"] = snap.id
        return d
    except Exception as e:
        print(f"[ERR] get_order_by_id: {e}")
        return None


def delete_order(doc_id: str) -> bool:
    """Buyurtmani butunlay o'chiradi. Faqat admin paneldan chaqiriladi."""
    try:
        ref = db.collection("orders").document(str(doc_id))
        if not ref.get().exists:
            return False
        ref.delete()
        print(f"[DEL] Buyurtma o'chirildi: {doc_id}")
        return True
    except Exception as e:
        print(f"[ERR] delete_order: {e}")
        return False


def order_display_id(order: dict) -> str:
    """Foydalanuvchiga ko'rsatiladigan raqam: «#0005 · 23.09.2026».

    Raqam har kuni #0001 dan boshlanadi, shuning uchun doim to'liq sana
    bilan — aks holda kechagi #0005 bugungisi bilan adashib ketardi.
    Eski yozuvlarda raqam o'rnida 'id' maydoni.
    """
    number = order.get("orderNumber") or order.get("id") or "—"
    day = str(order.get("orderDay") or "")
    if len(day) != 10 or day[4] != "-" or day[7] != "-":
        # orderDay yo'q — createdAt dan Toshkent sanasi
        try:
            created = datetime.fromisoformat(str(order.get("createdAt") or "").replace("Z", "+00:00"))
            day = (created.astimezone(timezone.utc) + timedelta(hours=5)).strftime("%Y-%m-%d")
        except ValueError:
            return number
    return f"{number} · {day[8:10]}.{day[5:7]}.{day[0:4]}"


_MONTHS_UZ = ["yan", "fev", "mar", "apr", "may", "iyun",
              "iyul", "avg", "sen", "okt", "noy", "dek"]


def order_date_text(order: dict) -> str:
    """
    Buyurtma sanasi. Yangi yozuvlarda createdAt (ISO, UTC) bor —
    uni o'qiladigan ko'rinishga aylantiramiz. Eski yozuvlarda
    formatlangan 'date' matni saqlanib qolgan (F-10).
    """
    created = order.get("createdAt")
    if created:
        try:
            dt = datetime.fromisoformat(str(created).replace("Z", "+00:00"))
            dt = dt.astimezone()
            return f"{dt.day} {_MONTHS_UZ[dt.month - 1]}, {dt.year} • {dt:%H:%M}"
        except (ValueError, TypeError):
            pass
    return order.get("date") or "—"


def claim_order_notification(doc_id: str) -> bool:
    """
    Buyurtmani 'adminga yuborilgan' deb belgilaydi.
    Transaction ichida atomik: True qaytsa — xabar yuborish shu chaqiruv
    zimmasida, aks holda boshqa birov allaqachon yuborgan.
    """
    ref = db.collection("orders").document(doc_id)

    @firestore.transactional
    def _claim(transaction):
        snap = ref.get(transaction=transaction)
        if not snap.exists:
            return False
        # Faqat aniq False bo'lganini olamiz. Eski buyurtmalarda bu maydon
        # umuman yo'q — ular qayta yuborilmasligi kerak.
        if snap.to_dict().get("notified") is not False:
            return False
        transaction.update(ref, {"notified": True})
        return True

    try:
        return _claim(db.transaction())
    except Exception as e:
        print(f"[ERR] claim_order_notification: {e}")
        return False


def claim_cancel_notification(doc_id: str) -> bool:
    """
    Mijoz bekor qilgan buyurtmani 'adminga aytildi' deb belgilaydi.
    claim_order_notification bilan bir xil mantiq — takroriy xabar bo'lmasin.
    """
    ref = db.collection("orders").document(doc_id)

    @firestore.transactional
    def _claim(transaction):
        snap = ref.get(transaction=transaction)
        if not snap.exists:
            return False
        if snap.to_dict().get("cancelNotified") is not False:
            return False
        transaction.update(ref, {"cancelNotified": True})
        return True

    try:
        return _claim(db.transaction())
    except Exception as e:
        print(f"[ERR] claim_cancel_notification: {e}")
        return False


def release_order_notification(doc_id: str):
    """Xabar yuborilmasa bayroqni qaytaramiz — keyingi urinishda qayta yuboriladi."""
    try:
        db.collection("orders").document(doc_id).update({"notified": False})
    except Exception as e:
        print(f"[ERR] release_order_notification: {e}")


def get_user_orders(user_id: int):
    """Foydalanuvchining barcha buyurtmalarini olish"""
    try:
        docs = db.collection("orders").where("userId", "==", user_id).get()
        orders = []
        for doc in docs:
            d = doc.to_dict()
            d["_doc_id"] = doc.id
            orders.append(d)
        orders.sort(key=lambda x: x.get("createdAt", ""), reverse=True)
        return orders
    except Exception as e:
        print(f"[ERR] get_user_orders: {e}")
        return []


def listen_to_new_orders(callback, cancel_callback=None):
    """
    Yangi buyurtmalarni kuzatadi va callback'ni chaqiradi.

    Vaqt oynasiga tayanmaydi: har bir buyurtmada `notified` bayrog'i bor.
    Shu sababli bot qancha vaqt o'chib turgan bo'lsa ham, ishga tushganda
    yuborilmagan buyurtmalarni yetkazadi (F-21). Eski, `notified` maydoni
    yo'q buyurtmalar esa qayta yuborilmaydi.

    callback(order_data) — yuborish muvaffaqiyatsiz bo'lsa
    release_order_notification(doc_id) chaqirilishi kerak.
    """

    def on_snapshot(col_snapshot, changes, read_time):
        for change in changes:
            order_data = change.document.to_dict() or {}
            doc_id = change.document.id

            # ── Yangi buyurtma ──
            # callback None — yangi buyurtma xabarnomasi endi /api/orders
            # tomonidan yuboriladi, bot bunga aralashmaydi.
            if callback and change.type.name == 'ADDED':
                if order_data.get("notified") is False and claim_order_notification(doc_id):
                    order_data['_doc_id'] = doc_id
                    try:
                        callback(order_data)
                    except Exception as e:
                        print(f"[ERR] Buyurtma callback xatosi: {e}")
                        release_order_notification(doc_id)
                    continue

            # ── Mijoz bekor qildi ──
            if cancel_callback and order_data.get("cancelNotified") is False:
                if claim_cancel_notification(doc_id):
                    order_data['_doc_id'] = doc_id
                    try:
                        cancel_callback(order_data)
                    except Exception as e:
                        print(f"[ERR] Bekor qilish callback xatosi: {e}")

    orders_watch = db.collection("orders").on_snapshot(on_snapshot)
    return orders_watch

# ─── Users ────────────────────────────────────────────────────

def get_user(user_id: int) -> dict | None:
    try:
        snap = db.collection("users").document(str(user_id)).get()
        return snap.to_dict() if snap.exists else None
    except Exception as e:
        print(f"[ERR] get_user: {e}")
        return None


def get_user_language(user_id: int) -> str | None:
    """
    Mijoz tanlagan til ("uz" yoki "ru"). Hali tanlamagan bo'lsa — None.

    Xuddi shu maydonni mini app ham o'qiydi (src/App.tsx), shuning uchun
    botda tanlangan til ilovada ham ishlaydi.
    """
    try:
        snap = db.collection("users").document(str(user_id)).get()
        value = (snap.to_dict() or {}).get("language") if snap.exists else None
        return value if value in ("uz", "ru") else None
    except Exception as e:
        print(f"[ERR] get_user_language: {e}")
        return None


def set_user_language(user_id: int, lang: str) -> bool:
    """Tilni saqlaydi. Hujjat hali yo'q bo'lsa — yaratiladi."""
    if lang not in ("uz", "ru"):
        return False
    try:
        db.collection("users").document(str(user_id)).set(
            {"id": user_id, "language": lang}, merge=True
        )
        return True
    except Exception as e:
        print(f"[ERR] set_user_language: {e}")
        return False


def save_poll(poll_id: str, options: list, total: int, closed: bool):
    """Kanal so'rovnomasining jonli natijasi — admin panel «Telegram kanal» ko'rsatadi."""
    try:
        db.collection("polls").document(str(poll_id)).set({
            "options": options,
            "total": total,
            "closed": closed,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        print(f"[ERR] save_poll: {e}")


def save_bot_chat(chat_id: int, chat_type: str, title: str, username: str | None, status: str):
    """Bot qo'shilgan/chiqarilgan kanal yoki guruh — admin panel «Kanal» bo'limi uchun."""
    try:
        db.collection("bot_chats").document(str(chat_id)).set({
            "chatId": chat_id,
            "type": chat_type,
            "title": title,
            "username": username,
            "status": status,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        print(f"[ERR] save_bot_chat: {e}")


def set_user_phone(user_id: int, phone: str):
    """Telefon raqamini saqlaydi — mini app uni avtomatik to'ldiradi (F-26)."""
    try:
        db.collection("users").document(str(user_id)).set(
            {"id": user_id, "phone": phone}, merge=True
        )
        print(f"[OK] Telefon saqlandi: {user_id}")
        return True
    except Exception as e:
        print(f"[ERR] set_user_phone: {e}")
        return False


def abandoned_carts(hours: int = 2, limit: int = 30) -> list:
    """
    Savatni to'ldirib, buyurtma bermay ketganlar.

    Savat ilovada profilga ham yoziladi (`users/{id}.cart`), shuning
    uchun bot uni ko'ra oladi. Shartlar:
      • savat bo'sh emas;
      • oxirgi o'zgarishdan `hours` soat o'tgan;
      • shu savat uchun eslatma hali yuborilmagan.

    Buyurtma berilganda ilova savatni tozalaydi — demak bo'sh savat
    eslatmaga tushmaydi.
    """
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(hours=hours)).isoformat()
    # Faqat so'nggi bir kunda o'zgargan savatlar: ilgari har 15 daqiqada
    # savati bo'lgan HAMMA mijoz o'qilardi (eslatma olganlari ham) —
    # mijozlar ko'paygani sari Firestore o'qishlari ham o'sardi.
    # Bitta maydon bo'yicha oraliq — qo'shimcha indeks kerak emas.
    since = (now - timedelta(hours=hours + 24)).isoformat()
    found = []
    try:
        docs = (
            db.collection("users")
            .where("cartUpdatedAt", ">=", since)
            .where("cartUpdatedAt", "<=", cutoff)
            .limit(200)
            .get()
        )
    except Exception as e:
        print(f"[ERR] abandoned_carts: {e}")
        return found

    for doc in docs:
        data = doc.to_dict() or {}
        cart = data.get("cart") or []
        if not isinstance(cart, list) or not cart:
            continue

        updated = str(data.get("cartUpdatedAt") or "")
        reminded = str(data.get("cartRemindedAt") or "")
        # Eslatma savat oxirgi o'zgarishidan keyin yuborilgan bo'lsa — tinch qo'yamiz
        if reminded and reminded >= updated:
            continue

        try:
            user_id = int(data.get("id") or doc.id)
        except (TypeError, ValueError):
            continue

        count = 0
        for row in cart:
            try:
                count += int((row or {}).get("quantity") or 0)
            except (TypeError, ValueError):
                continue
        if count <= 0:
            continue

        found.append({
            "id": user_id,
            "count": count,
            "language": data.get("language"),
            "name": data.get("first_name") or "",
        })
        if len(found) >= limit:
            break

    return found


def mark_cart_reminded(user_id: int) -> bool:
    """Eslatma yuborilgani belgilanadi — bitta savat uchun bir marta."""
    try:
        db.collection("users").document(str(user_id)).set(
            {"cartRemindedAt": datetime.now(timezone.utc).isoformat()}, merge=True
        )
        return True
    except Exception as e:
        print(f"[ERR] mark_cart_reminded: {e}")
        return False


def get_all_users():
    docs = db.collection("users").get()
    users = []
    for doc in docs:
        d = doc.to_dict()
        d["id"] = doc.id
        users.append(d)
    return users

# ─── Promocodes ───────────────────────────────────────────────

def get_promocodes():
    docs = db.collection("promocodes").get()
    codes = []
    for doc in docs:
        d = doc.to_dict()
        d["id"] = doc.id
        codes.append(d)
    return codes

def add_promocode(code: str, discount: int):
    doc_ref = db.collection("promocodes").document()
    doc_ref.set({
        "code": code.upper(),
        "discountPercent": discount,
        "active": True,
        "usageCount": 0
    })
    return doc_ref.id

def delete_promocode(code_id: str):
    db.collection("promocodes").document(code_id).delete()

# ─── Kuryerlar (admin panel bilan umumiy `staff` kolleksiyasi) ──

def get_courier_by_telegram(telegram_id: int):
    """
    Telegram foydalanuvchisi kuryermi? Bo'lsa — uning `staff` hujjati.

    Kuryerni admin panel qo'shadi. Unda Firebase Auth hisobi bo'lmasligi
    mumkin (Telegram-only kuryer), shuning uchun qidiruv telegramId
    bo'yicha boradi, hujjat identifikatori bo'yicha emas.
    """
    try:
        docs = (
            db.collection("staff")
            .where("telegramId", "==", int(telegram_id))
            .limit(1)
            .get()
        )
        for doc in docs:
            data = doc.to_dict() or {}
            # Kuryer yoki «kuryer sifatida ham ishlaydi» belgili ega/admin
            # (server bilan bir xil: api/_lib/courier-staff.ts → canDeliver)
            delivers = data.get("role") == "courier" or data.get("canDeliver") is True
            if not delivers or data.get("active") is False:
                return None
            data["uid"] = doc.id
            return data
    except Exception as e:
        print(f"[ERR] get_courier_by_telegram: {e}")
    return None


TASHKENT_OFFSET_S = 5 * 60 * 60
STOP_MINUTES = 6


def shift_active(staff: dict) -> bool:
    """
    Smena hozir ochiqmi — api/_lib/courier-staff.ts → shiftActive bilan
    bir xil: Toshkent vaqti bilan 00:00 da o'zi yopiladi.
    """
    if staff.get("onShift") is not True:
        return False
    try:
        since = datetime.fromisoformat(str(staff.get("shiftSince") or "").replace("Z", "+00:00")).timestamp()
    except ValueError:
        return False
    local = datetime.now(timezone.utc).timestamp() + TASHKENT_OFFSET_S
    midnight = local - (local % 86400) - TASHKENT_OFFSET_S
    return since >= midnight


def _distance_km(a: tuple, b: tuple) -> float:
    """Haversine — api/_lib/actions/location.ts → distanceKm bilan bir xil."""
    lat1, lng1 = math.radians(a[0]), math.radians(a[1])
    lat2, lng2 = math.radians(b[0]), math.radians(b[1])
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 2 * 6371 * math.asin(min(1.0, math.sqrt(h)))


def save_courier_location(courier: dict, lat: float, lng: float, heading=None,
                          accuracy=None, live_until: str | None = None) -> int:
    """
    Telegram «Jonli joylashuv»ini yozadi — api/_lib/actions/location.ts
    dagi saveCourierLocation bilan bir xil shaklda:

      courier_locations/{uid}  — admin xaritasi

    Maxfiylik: kuryer smenada bo'lmasa va qo'lida yo'ldagi buyurtma
    bo'lmasa — hech narsa saqlanmaydi, -1 qaytadi.

    Qaytaradi: yo'ldagi buyurtmalar soni (yoki -1).
    """
    uid = courier["uid"]
    at = datetime.now(timezone.utc).isoformat()
    name = courier.get("name") or "Kuryer"
    # Xodimlar kartasidagi raqam, bo'lmasa botga ulashgan kontakt
    # (api/_lib/courier-staff.ts → courierPhone bilan bir xil)
    phone = courier.get("phone") or ((get_user(courier.get("telegramId")) or {}).get("phone") if courier.get("telegramId") else None)

    active = [
        (doc.id, doc.to_dict() or {})
        for doc in db.collection("orders").where("courierId", "==", uid).where("status", "==", "Yetkazilmoqda").stream()
    ]
    if not active and not shift_active(courier):
        return -1

    db.collection("courier_locations").document(uid).set({
        "uid": uid,
        "name": name,
        "telegramId": courier.get("telegramId"),
        # Admin xaritasida qo'ng'iroq tugmasi (server bilan bir xil)
        "phone": phone,
        "lat": lat,
        "lng": lng,
        "accuracy": accuracy,
        "heading": heading,
        "speed": None,
        "source": "live",
        "at": at,
        "liveUntil": live_until,
    }, merge=True)

    return len(active)


def send_notification(user_id: int, title: str, body: str, type: str = 'system', order_id: str | None = None):
    data = {
        "userId": user_id,
        "title": title,
        "body": body,
        # ISO 8601 — mini app shu bo'yicha saralaydi (F-10)
        "date": datetime.now(timezone.utc).isoformat(),
        "read": False,
        "type": type,
    }
    if order_id:
        # Mini app «Buyurtmalar» nishonida bitta buyurtmani bir marta sanaydi
        data["orderId"] = str(order_id)
    db.collection("notifications").document().set(data)


# ─── Payment settings ─────────────────────────────────────────
#
# Karta ma'lumoti yagona joyda — settings/payment hujjatida. Bot ham,
# mini app ham shu yerdan o'qiydi (F-07). config.py faqat birinchi
# marta to'ldirish uchun boshlang'ich qiymat beradi.

def get_payment_settings() -> dict:
    try:
        snap = db.collection("settings").document("payment").get()
        if snap.exists:
            data = snap.to_dict() or {}
            return {
                "cardNumber": data.get("cardNumber") or CARD_NUMBER,
                "cardOwner": data.get("cardOwner") or CARD_OWNER,
            }
    except Exception as e:
        print(f"[ERR] get_payment_settings: {e}")
    return {"cardNumber": CARD_NUMBER, "cardOwner": CARD_OWNER}


def ensure_payment_settings():
    """Hujjat yo'q bo'lsa config.py qiymatlari bilan yaratadi."""
    try:
        ref = db.collection("settings").document("payment")
        if not ref.get().exists:
            ref.set({"cardNumber": CARD_NUMBER, "cardOwner": CARD_OWNER})
            print("[OK] settings/payment yaratildi")
    except Exception as e:
        print(f"[ERR] ensure_payment_settings: {e}")


def update_payment_settings(card_number: str, card_owner: str):
    db.collection("settings").document("payment").set(
        {"cardNumber": card_number, "cardOwner": card_owner}, merge=True
    )


# ─── Delivery settings ────────────────────────────────────────

def get_contact_settings() -> dict:
    """
    «Biz bilan aloqa» — admin panel → Sozlamalar (settings/contact).
    Bo'sh maydon yoki hujjat yo'q bo'lsa — config.py dagi standart.
    Mini app ham shu hujjatni o'qiydi (src/config/contact.ts).
    """
    contact = {
        "phone": SUPPORT_PHONE,
        "telegram": SUPPORT_TELEGRAM,
        "email": SUPPORT_EMAIL,
        "address": COMPANY_CITY,
        "workHours": WORK_HOURS,
    }
    try:
        snap = db.collection("settings").document("contact").get()
        if snap.exists:
            data = snap.to_dict() or {}
            for key in contact:
                value = str(data.get(key) or "").strip()
                if value:
                    contact[key] = value
    except Exception as e:
        print(f"[ERR] get_contact_settings: {e}")
    username = contact["telegram"].lstrip("@")
    contact["telegram"] = f"@{username}" if username else ""
    return contact


def get_delivery_settings() -> dict:
    try:
        snap = db.collection("settings").document("delivery").get()
        if snap.exists:
            data = snap.to_dict() or {}
            return {
                "fee": max(int(data.get("fee") or 0), 0),
                "freeFrom": max(int(data.get("freeFrom") or 0), 0),
            }
    except Exception as e:
        print(f"[ERR] get_delivery_settings: {e}")
    return {"fee": 0, "freeFrom": 0}


def ensure_delivery_settings():
    try:
        ref = db.collection("settings").document("delivery")
        if not ref.get().exists:
            ref.set({"fee": 0, "freeFrom": 0})
            print("[OK] settings/delivery yaratildi")
    except Exception as e:
        print(f"[ERR] ensure_delivery_settings: {e}")


def update_delivery_settings(fee: int, free_from: int):
    db.collection("settings").document("delivery").set(
        {"fee": int(fee), "freeFrom": int(free_from)}, merge=True
    )


# ─── Orders list (admin) ──────────────────────────────────────

def get_orders(status: str | None = None, limit: int = 20):
    """Buyurtmalar ro'yxati, yangisidan eskisiga."""
    try:
        query = db.collection("orders")
        if status:
            query = query.where("status", "==", status)
        docs = query.get()
        orders = []
        for doc in docs:
            d = doc.to_dict()
            d["_doc_id"] = doc.id
            orders.append(d)
        orders.sort(key=lambda x: x.get("createdAt", ""), reverse=True)
        return orders[:limit]
    except Exception as e:
        print(f"[ERR] get_orders: {e}")
        return []


# ─── Sotuv hisoboti ───────────────────────────────────────────

def get_sales_report(days: int = 7) -> dict:
    """
    Oxirgi N kunlik savdo hisoboti.

    "Yetkazildi" statusidagi buyurtmalar haqiqiy savdo deb hisoblanadi;
    bekor qilingan va rad etilganlar summaga kirmaydi.
    """
    from datetime import timedelta

    since = datetime.now(timezone.utc) - timedelta(days=days)

    report = {
        "days": days,
        "orders": 0,
        "delivered": 0,
        "cancelled": 0,
        "pending": 0,
        "revenue": 0,
        "avg_check": 0,
        "top_products": [],
        "new_customers": 0,
    }

    try:
        docs = db.collection("orders").get()
    except Exception as e:
        print(f"[ERR] get_sales_report: {e}")
        return report

    product_counts = {}
    customers = set()
    delivered_totals = []

    for doc in docs:
        d = doc.to_dict() or {}

        created = d.get("createdAt")
        if not created:
            continue
        try:
            when = datetime.fromisoformat(str(created).replace("Z", "+00:00"))
        except (ValueError, TypeError):
            continue
        if when < since:
            continue

        report["orders"] += 1

        status = d.get("status", "Yangi")
        if status == "Yetkazildi":
            report["delivered"] += 1
            total = d.get("total") or 0
            if isinstance(total, (int, float)):
                report["revenue"] += total
                delivered_totals.append(total)
        elif status in ("Bekor qilingan", "Rad etildi"):
            report["cancelled"] += 1
        else:
            report["pending"] += 1

        if d.get("userId"):
            customers.add(d["userId"])

        # Eng ko'p sotilgan mahsulotlar — bekor qilinmaganlar bo'yicha
        if status not in ("Bekor qilingan", "Rad etildi"):
            for item in d.get("products", []):
                prod = item.get("product") or {}
                name = prod.get("name")
                if not name:
                    continue
                qty = item.get("quantity", 1)
                entry = product_counts.setdefault(name, {"qty": 0, "sum": 0})
                entry["qty"] += qty
                entry["sum"] += (prod.get("price") or 0) * qty

    if delivered_totals:
        report["avg_check"] = round(sum(delivered_totals) / len(delivered_totals))

    report["new_customers"] = len(customers)
    report["top_products"] = sorted(
        ({"name": k, **v} for k, v in product_counts.items()),
        key=lambda x: x["qty"],
        reverse=True,
    )[:5]

    return report


# ─── Analitika ────────────────────────────────────────────────

def get_analytics(days: int = 7) -> dict:
    """
    Mini appdagi xatti-harakatlar (12-band).

    Ma'lumot /api/track orqali yig'iladi: har bir hodisa uchun alohida
    hujjat emas, hisoblagichlar oshiriladi.
    """
    from datetime import timedelta

    result = {
        "days": days,
        "view": 0,
        "cart_add": 0,
        "checkout_start": 0,
        "top_viewed": [],
        "conversion": 0.0,
    }

    try:
        today = datetime.now(timezone.utc).date()
        wanted = {(today - timedelta(days=i)).isoformat() for i in range(days)}

        for doc in db.collection("analytics").document("daily").collection("days").get():
            if doc.id not in wanted:
                continue
            d = doc.to_dict() or {}
            for key in ("view", "cart_add", "checkout_start"):
                result[key] += int(d.get(key) or 0)

        # Eng ko'p ko'rilgan mahsulotlar
        items = []
        for doc in db.collection("analytics").document("products").collection("items").get():
            d = doc.to_dict() or {}
            views = int(d.get("view") or 0)
            if views:
                product = get_product_by_id(doc.id)
                items.append({
                    "name": (product or {}).get("name") or f"ID {doc.id}",
                    "views": views,
                    "cart_add": int(d.get("cart_add") or 0),
                })
        result["top_viewed"] = sorted(items, key=lambda x: x["views"], reverse=True)[:5]

        if result["view"]:
            result["conversion"] = round(result["cart_add"] / result["view"] * 100, 1)

    except Exception as e:
        print(f"[ERR] get_analytics: {e}")

    return result


def count_products_in_category(name: str) -> int:
    try:
        docs = db.collection("products").where("category", "==", name).get()
        return len(list(docs))
    except Exception as e:
        print(f"[ERR] count_products_in_category: {e}")
        return 0


def rename_category(cat_id: str | int, new_name: str) -> int:
    """
    Kategoriya nomini o'zgartiradi.

    MUHIM: mahsulotlarda kategoriya NOMI saqlanadi, id emas. Shuning uchun
    faqat kategoriya hujjatini yangilash yetmaydi — o'sha nomdagi barcha
    mahsulotlarni ham yangilash kerak, aks holda ular bog'lanishini
    yo'qotadi va katalogda ko'rinmay qoladi.

    Yangilangan mahsulotlar sonini qaytaradi.
    """
    new_name = new_name.strip()
    if not new_name:
        return 0

    ref = db.collection("categories").document(str(cat_id))
    snap = ref.get()
    if not snap.exists:
        return 0

    old_name = (snap.to_dict() or {}).get("name", "")
    if old_name == new_name:
        return 0

    ref.update({"name": new_name})

    updated = 0
    try:
        products = db.collection("products").where("category", "==", old_name).get()
        batch = db.batch()
        for i, doc in enumerate(products, 1):
            batch.update(doc.reference, {"category": new_name})
            updated += 1
            # Firestore batch chegarasi — 500 ta amal
            if i % 400 == 0:
                batch.commit()
                batch = db.batch()
        if updated % 400 != 0 or updated == 0:
            batch.commit()
    except Exception as e:
        print(f"[ERR] rename_category (mahsulotlar): {e}")

    print(f"[OK] Kategoriya: '{old_name}' -> '{new_name}' ({updated} ta mahsulot)")
    return updated


# ─── Adminlar ─────────────────────────────────────────────────
#
# config.py dagi ADMIN_IDS — egalar, ular bu yerda saqlanmaydi.
# Panel orqali qo'shilgan adminlar settings/admins hujjatida.

_ADMINS_DOC = ("settings", "admins")


def get_extra_admin_ids() -> set:
    try:
        snap = db.collection(_ADMINS_DOC[0]).document(_ADMINS_DOC[1]).get()
        if not snap.exists:
            return set()
        ids = (snap.to_dict() or {}).get("ids") or []
        return {int(x) for x in ids}
    except Exception as e:
        print(f"[ERR] get_extra_admin_ids: {e}")
        return set()


def get_panel_staff_ids() -> set:
    """
    Admin panelga kira oladigan xodimlarning Telegram ID lari.

    Manba — `staff` kolleksiyasi: panelda xodim qo'shilganda yoki
    xodimning o'zi panelni Telegram ichida ochib kirganda ID shu yerga
    yoziladi (api/_lib/actions/people.ts → staffLinkTelegram).

    Faqat FAOL `owner`/`admin` xodimlar. Kuryerlar bu ro'yxatga
    kirmaydi: ularning ishi buyurtma tugmalari va /bugun.
    """
    ids = set()
    try:
        for doc in db.collection("staff").where("role", "in", ["owner", "admin"]).get():
            data = doc.to_dict() or {}
            if data.get("active") is False:
                continue
            tid = data.get("telegramId")
            if tid:
                ids.add(int(tid))
    except Exception as e:
        print(f"[ERR] get_panel_staff_ids: {e}")
    return ids


def add_extra_admin(user_id: int) -> bool:
    try:
        ref = db.collection(_ADMINS_DOC[0]).document(_ADMINS_DOC[1])
        current = get_extra_admin_ids()
        current.add(int(user_id))
        ref.set({"ids": sorted(current)}, merge=True)
        print(f"[OK] Admin qo'shildi: {user_id}")
        return True
    except Exception as e:
        print(f"[ERR] add_extra_admin: {e}")
        return False


def remove_extra_admin(user_id: int) -> bool:
    try:
        ref = db.collection(_ADMINS_DOC[0]).document(_ADMINS_DOC[1])
        current = get_extra_admin_ids()
        current.discard(int(user_id))
        ref.set({"ids": sorted(current)}, merge=True)
        print(f"[DEL] Admin o'chirildi: {user_id}")
        return True
    except Exception as e:
        print(f"[ERR] remove_extra_admin: {e}")
        return False


def find_users(query: str, limit: int = 10) -> list:
    """Ism yoki username bo'yicha foydalanuvchi qidirish (admin qo'shish uchun)."""
    q = (query or "").strip().lower().lstrip("@")
    result = []
    try:
        for doc in db.collection("users").get():
            d = doc.to_dict() or {}
            name = f"{d.get('first_name', '')} {d.get('last_name', '')}".strip().lower()
            username = (d.get("username") or "").lower()
            if not q or q in name or q in username or q == str(d.get("id", "")):
                d["id"] = d.get("id") or doc.id
                result.append(d)
            if len(result) >= limit:
                break
    except Exception as e:
        print(f"[ERR] find_users: {e}")
    return result


TASHKENT = timezone(timedelta(hours=5))


# ─── Kuryerning bugungi hisoboti (/bugun) ─────────────────────

def courier_today(uid: str) -> dict:
    """
    Kuryerga biriktirilgan buyurtmalardan BUGUNGI holat (Toshkent vaqti).

      delivered — bugun yetkazilganlar
      on_way    — hozir yo'lda (Yetkazilmoqda)
      waiting   — biriktirilgan, lekin hali olinmagan (Qabul qilindi)
      cash      — bugun naqd olingan pul (kassaga topshiriladi)
      card      — karta orqali to'langanlar summasi
    """
    start = datetime.now(TASHKENT).replace(hour=0, minute=0, second=0, microsecond=0)

    def parse(value):
        try:
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except (TypeError, ValueError):
            return None

    delivered, on_way, waiting = [], [], []
    try:
        for doc in db.collection("orders").where("courierId", "==", uid).stream():
            order = doc.to_dict() or {}
            order["_doc_id"] = doc.id
            status = order.get("status")
            if status == "Yetkazildi":
                when = parse(order.get("statusUpdatedAt") or order.get("createdAt"))
                if when and when >= start:
                    order["_at"] = when.astimezone(TASHKENT)
                    delivered.append(order)
            elif status == "Yetkazilmoqda":
                on_way.append(order)
            elif status == "Qabul qilindi":
                waiting.append(order)
    except Exception as e:
        print(f"[ERR] courier_today: {e}")

    delivered.sort(key=lambda o: o["_at"])
    # Naqd — faqat «Naqd» (va bo'sh); karta o'tkazmasi va onlayn to'lov — naqdsiz
    is_cash = lambda o: (o.get("paymentMethod") or "Naqd") == "Naqd"
    cash = sum(int(o.get("total") or 0) for o in delivered if is_cash(o))
    card = sum(int(o.get("total") or 0) for o in delivered if not is_cash(o))
    return {"date": start, "delivered": delivered, "on_way": on_way, "waiting": waiting, "cash": cash, "card": card}
