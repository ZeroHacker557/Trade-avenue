import { adminDb } from './firebase-admin.js'

/**
 * Bekor qilingan buyurtmadagi miqdorni omborga qaytaradi.
 *
 * Buyurtma yaratilganda qoldiq darhol kamayadi (api/orders.ts), shuning
 * uchun bekor qilish yoki rad etishda uni qaytarish SHART — aks holda
 * omborda bor mahsulot bazada "sotilgan" bo'lib qolaveradi.
 *
 * Ikki marta qaytarib yubormaslik uchun buyurtmaga `stockRestored`
 * bayrog'i qo'yiladi: mijoz bekor qilgan buyurtmani admin keyin "Rad
 * etildi" ga o'tkazsa ham qoldiq ikkinchi marta oshmaydi. Hammasi
 * bitta tranzaksiyada — parallel ikki so'rov ham bir martagina o'tadi.
 */
export async function restoreStock(orderId: string): Promise<boolean> {
  const db = await adminDb()

  return db.runTransaction(async (tx) => {
    const orderRef = db.collection('orders').doc(orderId)
    const orderSnap = await tx.get(orderRef)
    if (!orderSnap.exists) return false

    const order = orderSnap.data() as FirebaseFirestore.DocumentData
    if (order.stockRestored === true) return false

    const items = Array.isArray(order.products) ? order.products : []
    const restore = new Map<string, number>()
    for (const item of items) {
      const id = String(item?.product?.id ?? '')
      if (!id) continue
      // O'ramli qatorda bitta «dona» = pack ta dona
      restore.set(id, (restore.get(id) || 0) + (Number(item?.quantity) || 0) * (Number(item?.product?.pack) || 1))
    }

    const refs = [...restore.keys()].map((id) => db.collection('products').doc(id))
    const snaps = refs.length ? await tx.getAll(...refs) : []

    for (const snap of snaps) {
      if (!snap.exists) continue
      const data = snap.data() as FirebaseFirestore.DocumentData
      // Qoldiq yuritilmaydigan eski mahsulotlarga tegmaymiz
      if (typeof data.stock !== 'number') continue
      tx.update(snap.ref, { stock: data.stock + (restore.get(snap.id) || 0) })
    }

    tx.update(orderRef, { stockRestored: true, stockRestoredAt: new Date().toISOString() })
    return true
  })
}
