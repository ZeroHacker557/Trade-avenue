import firebase_db
import urllib.parse

from config import FIREBASE_STORAGE_BUCKET

db = firebase_db.db
docs = db.collection("products").get()

for doc in docs:
    data = doc.to_dict()
    doc_id = doc.id
    images = data.get("images", [])
    new_images = []
    updated = False
    for img in images:
        if "storage.googleapis.com" in img:
            filename = img.split("products/")[-1]
            encoded = urllib.parse.quote(f"products/{filename}", safe="")
            new_url = f"https://firebasestorage.googleapis.com/v0/b/{FIREBASE_STORAGE_BUCKET}/o/{encoded}?alt=media"
            new_images.append(new_url)
            updated = True
        else:
            new_images.append(img)
    if updated:
        db.collection("products").document(doc_id).update({"images": new_images})
        print(f"Updated images for product {doc_id}")

print("Done fixing Firestore images!")
