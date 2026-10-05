"""
Mavjud mahsulot rasmlarini siqadi: har bir rasm uchun kichik (thumb) va
o'rta (optimized) WebP nusxa yaratib, mahsulot hujjatiga yozadi.

    python scripts/optimize_images.py            # faqat ko'rsatadi, hech narsa yozmaydi
    python scripts/optimize_images.py --apply    # haqiqatda yuklaydi va yozadi

Xavfsiz:
  - asl rasmlar va `images` maydoni O'ZGARMAYDI — faqat `thumbs` va
    `optimized` qo'shiladi. Ilova nusxa bo'lmasa asl rasmni oladi, ya'ni
    skript yarim yo'lda to'xtasa ham hech narsa buzilmaydi;
  - qayta ishga tushirish mumkin: nusxasi tayyor mahsulot o'tkazib yuboriladi;
  - asl rasmlarga keshlash sarlavhasi qo'yiladi (faqat metama'lumot).

Admin panel yangi rasmlarni yuklashda o'zi siqadi (src/admin/lib/storage.ts),
bu skript — undan oldin yuklanganlar uchun.
"""
import io
import json
import re
import sys
import uuid
from glob import glob
from pathlib import Path
from urllib.parse import quote, unquote, urlparse
from urllib.request import urlopen

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent

# admin/lib/storage.ts dagi bilan bir xil
VARIANTS = {
    "thumbs": {"max_side": 480, "quality": 80, "suffix": "thumb"},
    "optimized": {"max_side": 1200, "quality": 86, "suffix": "opt"},
}
CACHE = "public, max-age=31536000, immutable"


def firebase_config():
    """Loyiha va bucket — src/config/firebase.ts dan (kalit tanlashda adashmaslik uchun)."""
    text = (ROOT / "src" / "config" / "firebase.ts").read_text(encoding="utf-8")
    project = re.search(r"projectId:\s*'([^']+)'", text).group(1)
    bucket = re.search(r"storageBucket:\s*'([^']+)'", text).group(1)
    return project, bucket


def service_account(project):
    """Ildizdagi bir nechta kalitdan AYNAN shu loyihaniki."""
    for path in glob(str(ROOT / "*firebase-adminsdk*.json")):
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        if data.get("project_id") == project:
            return path
    raise SystemExit(f"{project} loyihasining service account kaliti topilmadi")


def encode(image, max_side, quality):
    img = ImageOps.exif_transpose(image)
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA" if "A" in img.getbands() or img.mode == "P" else "RGB")
    img = img.copy()
    # Faqat kichraytiriladi, kattalashtirilmaydi
    img.thumbnail((max_side, max_side), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, "WEBP", quality=quality, method=6)
    return out.getvalue(), img.size


def storage_path(url):
    """Firebase download URL'dan fayl yo'li: .../o/products%2Fx.png?alt=..."""
    parsed = urlparse(url)
    if "/o/" not in parsed.path:
        return None
    return unquote(parsed.path.split("/o/", 1)[1])


def main():
    apply = "--apply" in sys.argv
    project, bucket_name = firebase_config()

    import firebase_admin
    from firebase_admin import credentials, firestore, storage

    firebase_admin.initialize_app(
        credentials.Certificate(service_account(project)),
        {"storageBucket": bucket_name},
    )
    db = firestore.client()
    bucket = storage.bucket()

    print(f"Loyiha: {project}  |  rejim: {'YOZISH' if apply else 'faqat ko‘rish (--apply yo‘q)'}\n")

    total_before = total_thumb = total_opt = 0
    done = skipped = failed = 0

    for doc in db.collection("products").stream():
        data = doc.to_dict()
        images = [u for u in (data.get("images") or []) if isinstance(u, str)]
        if not images:
            continue

        ready = data.get("variantSources") == images and all(
            isinstance(data.get(field), list)
            and len(data[field]) == len(images)
            and all(data[field])
            for field in VARIANTS
        )
        if ready:
            skipped += 1
            continue

        name = data.get("name", doc.id)
        result = {field: [] for field in VARIANTS}
        try:
            for index, url in enumerate(images):
                raw = urlopen(url, timeout=60).read()
                total_before += len(raw)
                image = Image.open(io.BytesIO(raw))
                image.load()

                for field, cfg in VARIANTS.items():
                    blob_bytes, size = encode(image, cfg["max_side"], cfg["quality"])
                    if field == "thumbs":
                        total_thumb += len(blob_bytes)
                    else:
                        total_opt += len(blob_bytes)

                    if not apply:
                        result[field].append("")
                        continue

                    path = f"products/{doc.id}_{index}_{uuid.uuid4().hex[:8]}_{cfg['suffix']}.webp"
                    token = str(uuid.uuid4())
                    blob = bucket.blob(path)
                    blob.cache_control = CACHE
                    blob.metadata = {"firebaseStorageDownloadTokens": token}
                    blob.upload_from_string(blob_bytes, content_type="image/webp")
                    result[field].append(
                        f"https://firebasestorage.googleapis.com/v0/b/{bucket_name}/o/"
                        f"{quote(path, safe='')}?alt=media&token={token}"
                    )

                # Asl rasm ham keshlansin — faqat metama'lumot, fayl o'zgarmaydi
                original = storage_path(url)
                if apply and original:
                    try:
                        blob = bucket.blob(original)
                        blob.reload()
                        if blob.cache_control != CACHE:
                            blob.cache_control = CACHE
                            blob.patch()
                    except Exception as error:  # noqa: BLE001 — asosiy ishga ta'sir qilmasin
                        print(f"   (asl rasm keshlanmadi: {error})")

            if apply:
                doc.reference.set(
                    {
                        "thumbs": result["thumbs"],
                        "optimized": result["optimized"],
                        # Nusxalar aynan shu rasmlardan — ilova mos kelmaganini ishlatmaydi
                        "variantSources": images,
                    },
                    merge=True,
                )
            done += 1
            print(f"✓ {name}  ({len(images)} ta rasm)")
        except Exception as error:  # noqa: BLE001
            failed += 1
            print(f"✗ {name}: {error}")

    kb = lambda n: f"{n / 1024:,.0f} KB".replace(",", " ")
    print(
        f"\nQayta ishlandi: {done}  |  tayyor edi: {skipped}  |  xato: {failed}\n"
        f"Asl rasmlar:        {kb(total_before)}\n"
        f"Kichik (katalog):   {kb(total_thumb)}\n"
        f"O'rta (sahifa):     {kb(total_opt)}"
    )
    if not apply:
        print("\nHech narsa yozilmadi. Haqiqatda bajarish uchun: --apply")


if __name__ == "__main__":
    main()
