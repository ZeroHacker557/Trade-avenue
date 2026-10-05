"""
Firestore'da qanday ma'lumotlar borligini tekshirish
"""
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import firebase_db as db

print("=" * 50)
print("FIRESTORE DIAGNOSTIKA")
print("=" * 50)

# Kategoriyalar
print("\nKATEGORIYALAR:")
cats = db.get_categories()
if cats:
    for c in cats:
        print(f"  - ID: {c['id']} | Name: {c['name']} | Icon: {c.get('icon', '?')}")
else:
    print("  WARNING: Kategoriyalar TOPILMADI!")

# Mahsulotlar
print(f"\nMAHSULOTLAR:")
prods = db.get_products()
if prods:
    for p in prods:
        images = p.get('images', [])
        img_info = []
        for img in images:
            if img.startswith("http"):
                img_info.append(f"URL OK: {img[:80]}...")
            elif img:
                img_info.append(f"LOCAL FILE: {img}")
            else:
                img_info.append("EMPTY")
        
        print(f"  - ID: {p['id']} | Name: {p.get('name', '?')}")
        print(f"    Price: {p.get('price', '?')} | Category: {p.get('category', '?')}")
        for info in img_info:
            print(f"    Image: {info}")
else:
    print("  WARNING: Mahsulotlar TOPILMADI!")

print(f"\nJAMI: {len(cats)} kategoriya, {len(prods)} mahsulot")
print("=" * 50)
