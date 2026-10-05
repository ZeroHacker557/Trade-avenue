"""
Trafik manbasi — /start dagi qo'shimcha so'z (deep link payload).

Reklamadagi havola: https://t.me/musauz_bot?start=meta_ig
→ bot «/start meta_ig» oladi → manba «meta_ig».

Qoidalar:
  • faqat [A-Za-z0-9_-], 1–64 belgi — aks holda manba hisoblanmaydi;
  • so'z yo'q — «organic» (to'g'ridan-to'g'ri kirgan);
  • «receipt_…» — chek havolasi, trafik manbasi EMAS (None).
Yozish: firebase_db.record_start, statistika: admin panel → «Trafik manbalari».
"""
import re

ORGANIC = "organic"
_VALID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def parse_start_source(text: str | None) -> str | None:
    """«/start meta_ig» → «meta_ig»; «/start» → «organic»; noto'g'ri/chek → None."""
    parts = (text or "").strip().split(maxsplit=1)
    if not parts or not parts[0].startswith("/start"):
        return None
    if len(parts) == 1:
        return ORGANIC
    payload = parts[1].strip()
    if payload.startswith("receipt_"):
        return None
    return payload if _VALID.match(payload) else None


def source_update(existing: dict | None, source: str, now_iso: str) -> tuple[dict, bool]:
    """
    Foydalanuvchi hujjatiga yoziladigan maydonlar va «yangi foydalanuvchimi».

    • Hujjat umuman yo'q — yangi foydalanuvchi: firstSource ham yoziladi.
    • Hujjat bor — eski (legacy yoki avval kelgan): firstSource TEGILMAYDI,
      faqat lastSource yangilanadi. Eski mijozlarda firstSource bo'sh qoladi.
    """
    fields = {"lastSource": source, "lastSourceAt": now_iso}
    is_new = existing is None
    if is_new:
        fields.update({"firstSource": source, "firstSourceAt": now_iso})
    return fields, is_new
