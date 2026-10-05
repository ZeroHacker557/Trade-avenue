"""
Trafik manbasi mantiqi testi:  python bot/test_source_tracking.py
(Firestore kerak emas — sof funksiyalar.)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from source_tracking import ORGANIC, parse_start_source, source_update  # noqa: E402

fails = []


def check(name, cond, extra=""):
    print(("OK   " if cond else "XATO ") + name + ("" if cond else f"  -> {extra}"))
    if not cond:
        fails.append(name)


# ── parse_start_source ──
check("payload", parse_start_source("/start meta_ig") == "meta_ig")
check("payloadsiz → organic", parse_start_source("/start") == ORGANIC)
check("bo'sh joylar", parse_start_source("  /start   test_123  ") == "test_123")
check("tire va raqam", parse_start_source("/start meta-fb_2026") == "meta-fb_2026")
check("64 belgi — qabul", parse_start_source("/start " + "a" * 64) == "a" * 64)
check("65 belgi — rad", parse_start_source("/start " + "a" * 65) is None)
check("kirill — rad", parse_start_source("/start реклама") is None)
check("maxsus belgi — rad", parse_start_source("/start meta.ig") is None)
check("ikki so'z — rad", parse_start_source("/start meta ig") is None)
check("chek havolasi — manba emas", parse_start_source("/start receipt_abc123") is None)
check("boshqa buyruq", parse_start_source("/help") is None)
check("None", parse_start_source(None) is None)

# ── source_update ──
fields, is_new = source_update(None, "meta_ig", "2026-10-01T00:00:00Z")
check("yangi: firstSource yoziladi", is_new and fields["firstSource"] == "meta_ig" and fields["lastSource"] == "meta_ig")

existing = {"id": 1, "language": "uz", "firstSource": "meta_ig"}
fields, is_new = source_update(existing, "meta_fb", "2026-10-02T00:00:00Z")
check("eski: firstSource ustiga yozilmaydi", not is_new and "firstSource" not in fields and fields["lastSource"] == "meta_fb")

legacy = {"id": 2, "language": "ru"}
fields, is_new = source_update(legacy, "test_123", "2026-10-02T00:00:00Z")
check("legacy: firstSource bo'sh qoladi", not is_new and "firstSource" not in fields and fields["lastSource"] == "test_123")

print("\nNATIJA:", ", ".join(fails) if fails else "hammasi joyida")
sys.exit(1 if fails else 0)
