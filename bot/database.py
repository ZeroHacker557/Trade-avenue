import json
import os
from config import DB_FILE, IMAGES_DIR

# Ensure directories
os.makedirs(IMAGES_DIR, exist_ok=True)


def _load_db():
    if os.path.exists(DB_FILE):
        with open(DB_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"categories": [], "products": [], "next_cat_id": 1, "next_prod_id": 1}


def _save_db(data):
    with open(DB_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ─── Categories ──────────────────────────────────────────────

def get_categories():
    db = _load_db()
    return db["categories"]


def add_category(name: str, icon: str = "Package") -> dict:
    db = _load_db()
    cat = {"id": db["next_cat_id"], "name": name, "icon": icon}
    db["categories"].append(cat)
    db["next_cat_id"] += 1
    _save_db(db)
    return cat


def delete_category(cat_id: int) -> bool:
    db = _load_db()
    before = len(db["categories"])
    db["categories"] = [c for c in db["categories"] if c["id"] != cat_id]
    if len(db["categories"]) < before:
        _save_db(db)
        return True
    return False


def get_category_by_id(cat_id: int):
    db = _load_db()
    for c in db["categories"]:
        if c["id"] == cat_id:
            return c
    return None


# ─── Products ────────────────────────────────────────────────

def get_products():
    db = _load_db()
    return db["products"]


def get_products_by_category(category_name: str):
    db = _load_db()
    return [p for p in db["products"] if p["category"] == category_name]


def add_product(data: dict) -> dict:
    db = _load_db()
    product = {
        "id": db["next_prod_id"],
        "name": data["name"],
        "price": data["price"],
        "oldPrice": data.get("oldPrice"),
        "category": data["category"],
        "color": data.get("color", ""),
        "rating": data.get("rating", 5.0),
        "reviews": data.get("reviews", 0),
        "images": data.get("images", []),
        "description": data.get("description", ""),
        "discount": data.get("discount", ""),
        "sizes": data.get("sizes", []),
    }
    db["products"].append(product)
    db["next_prod_id"] += 1
    _save_db(db)
    return product


def delete_product(prod_id: int) -> bool:
    db = _load_db()
    before = len(db["products"])
    db["products"] = [p for p in db["products"] if p["id"] != prod_id]
    if len(db["products"]) < before:
        _save_db(db)
        return True
    return False


def get_product_by_id(prod_id: int):
    db = _load_db()
    for p in db["products"]:
        if p["id"] == prod_id:
            return p
    return None


def update_product(prod_id: int, updates: dict) -> bool:
    db = _load_db()
    for p in db["products"]:
        if p["id"] == prod_id:
            p.update(updates)
            _save_db(db)
            return True
    return False


def format_price(amount):
    """Format price as Uzbek so'm"""
    return f"{amount:,.0f} so'm".replace(",", " ")
