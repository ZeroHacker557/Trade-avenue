"""
Adminlarni boshqarish.

config.py dagi ADMIN_IDS — EGALAR ro'yxati. Ular doim admin bo'lib
qoladi va admin paneldan o'chirib bo'lmaydi: aks holda oxirgi admin
o'zini o'chirib, panelga umuman kira olmay qolishi mumkin edi.

Qolgan adminlar Firestore'dagi settings/admins hujjatida saqlanadi va
panel orqali qo'shiladi/o'chiriladi. Ro'yxat xotirada keshlanadi —
har bir tugma bosilganda bazaga so'rov ketmasligi uchun.
"""
import time

from config import ADMIN_IDS as OWNER_IDS
import firebase_db as db

_cache: set[int] | None = None

# Panelga kira oladiganlar (adminlar + `staff` dagi owner/admin xodimlar).
# Alohida kesh: bu ro'yxat panel orqali o'zgaradi, botni qayta
# ishga tushirmasdan yangilanishi kerak — shuning uchun muddatli.
_panel_cache: set[int] | None = None
_panel_at: float = 0.0
_PANEL_TTL = 60.0


def refresh() -> set[int]:
    """Ro'yxatni bazadan qayta o'qiydi."""
    global _cache, _panel_cache
    _cache = set(OWNER_IDS) | db.get_extra_admin_ids()
    _panel_cache = None
    return _cache


def all_admins() -> set[int]:
    if _cache is None:
        return refresh()
    return _cache


def is_admin(user_id: int) -> bool:
    return user_id in all_admins()


def is_owner(user_id: int) -> bool:
    """Egani panel orqali o'chirib bo'lmaydi."""
    return user_id in OWNER_IDS


def panel_ids() -> set[int]:
    """
    Botdagi «🛠 Admin panel» tugmasi kimlarga ko'rinadi.

    Adminlar ro'yxati + `staff` dagi faol owner/admin xodimlar. Xodim
    panelni Telegram ichida birinchi marta ochganda ID si o'zi yozilib
    qoladi, shuning uchun ro'yxat vaqti-vaqti bilan yangilanadi.
    """
    global _panel_cache, _panel_at
    now = time.monotonic()
    if _panel_cache is None or now - _panel_at > _PANEL_TTL:
        _panel_cache = all_admins() | db.get_panel_staff_ids()
        _panel_at = now
    return _panel_cache


def can_open_panel(user_id: int) -> bool:
    return user_id in panel_ids()


def add(user_id: int) -> bool:
    if user_id in all_admins():
        return False
    if not db.add_extra_admin(user_id):
        return False
    refresh()
    return True


def remove(user_id: int) -> bool:
    if is_owner(user_id):
        return False
    if not db.remove_extra_admin(user_id):
        return False
    refresh()
    return True
