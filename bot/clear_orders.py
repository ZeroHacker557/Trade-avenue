"""
Buyurtmalarni tozalash — sinov ma'lumotlarini o'chirish uchun.

DIQQAT: o'chirilgan buyurtmalarni qaytarib bo'lmaydi.

Ishlatish:
    python clear_orders.py            # hamma buyurtmani o'chiradi
    python clear_orders.py --mine     # faqat bitta foydalanuvchinikini
    python clear_orders.py --list     # hech narsa o'chirmaydi, ro'yxatni ko'rsatadi

Skript avval ro'yxatni chiqaradi va tasdiqlashni so'raydi.
"""
import io
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

import firebase_db as db

# --mine uchun: kimning buyurtmalari
MY_USER_ID = 7203124812

CONFIRM_WORD = "OCHIR"


def collect():
    docs = db.db.collection("orders").get()
    orders = []
    for doc in docs:
        d = doc.to_dict() or {}
        d["_doc_id"] = doc.id
        orders.append(d)
    orders.sort(key=lambda x: x.get("createdAt", ""), reverse=True)
    return orders


def show(orders):
    print(f"\nJami {len(orders)} ta buyurtma:\n")
    for o in orders:
        total = o.get("total", 0)
        total_str = db.format_price(total) if isinstance(total, (int, float)) else str(total)
        print(
            f"  {db.order_display_id(o):>12}  |  {o.get('status', '?'):<14}"
            f"|  {total_str:>16}  |  userId={o.get('userId')}"
        )
        print(f"                 doc.id: {o['_doc_id']}  |  {o.get('createdAt', '?')}")
    print()


def main():
    args = sys.argv[1:]
    only_mine = "--mine" in args
    list_only = "--list" in args

    orders = collect()
    if only_mine:
        orders = [o for o in orders if o.get("userId") == MY_USER_ID]

    if not orders:
        print("O'chiriladigan buyurtma yo'q.")
        return

    show(orders)

    if list_only:
        print("(--list rejimi: hech narsa o'chirilmadi)")
        return

    scope = f"foydalanuvchi {MY_USER_ID} ning" if only_mine else "BARCHA"
    print(f"Yuqoridagi {len(orders)} ta buyurtma ({scope}) butunlay o'chiriladi.")
    print("Bu amalni ortga qaytarib bo'lmaydi.\n")

    answer = input(f"Davom etish uchun {CONFIRM_WORD} deb yozing (boshqa narsa = bekor): ").strip()
    if answer != CONFIRM_WORD:
        print("Bekor qilindi. Hech narsa o'chirilmadi.")
        return

    deleted = failed = 0
    for o in orders:
        if db.delete_order(o["_doc_id"]):
            deleted += 1
        else:
            failed += 1

    print(f"\nO'chirildi: {deleted} ta")
    if failed:
        print(f"O'chirilmadi: {failed} ta")


if __name__ == "__main__":
    main()
