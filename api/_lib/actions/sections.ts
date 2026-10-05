import { adminDb } from '../firebase-admin.js'

/**
 * Bo'limlar — kategoriya ichidagi guruhlar («Musa», «Future Fruit»...).
 *
 * `sections/{id}`: { name, category, order }. Mahsulot bo'limga
 * `products/{id}.sectionId` orqali bog'lanadi. Kategoriya NOM bilan
 * bog'lanadi — mahsulotlar ham kategoriyaga shunday bog'langan.
 */

type Result = Record<string, unknown>

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Firestore bitta batch'da 500 tadan ko'p yozuv qabul qilmaydi. */
const BATCH_LIMIT = 450

export async function sectionSave(body: Record<string, unknown>): Promise<Result> {
  const name = text(body.name)
  const category = text(body.category)
  if (!name) throw new Error('Bo‘lim nomi kerak')
  if (name.length > 60) throw new Error('Bo‘lim nomi juda uzun')
  if (!category) throw new Error('Kategoriya tanlanmagan')

  const db = await adminDb()
  const id = text(body.id)

  // Bir kategoriyada bir xil nomli ikki bo'lim bo'lsa, mijoz ilovasida
  // bir xil sarlavha ikki marta chiqib chalkashtirardi
  const same = await db.collection('sections').where('category', '==', category).get()
  const clash = same.docs.some(
    (doc) => doc.id !== id && String(doc.data().name).toLowerCase() === name.toLowerCase(),
  )
  if (clash) throw new Error('Bu kategoriyada shunday nomli bo‘lim bor')

  if (id) {
    const ref = db.collection('sections').doc(id)
    const existing = await ref.get()
    if (!existing.exists) throw new Error('Bo‘lim topilmadi')
    // Kategoriyasi o'zgarmaydi: ichidagi mahsulotlar eski kategoriyada qolib,
    // bo'lim ular uchun ko'rinmay qolardi
    await ref.set(
      { name, nameRu: text(body.nameRu), updatedAt: new Date().toISOString() },
      { merge: true },
    )
    return { id }
  }

  // Yangi bo'lim — kategoriyaning oxirida
  const order = same.docs.reduce((max, doc) => Math.max(max, Number(doc.data().order ?? -1)), -1) + 1
  const ref = await db.collection('sections').add({
    name,
    nameRu: text(body.nameRu),
    category,
    order,
    createdAt: new Date().toISOString(),
  })
  return { id: ref.id, created: true }
}

/**
 * Bo'limni o'chiradi. Mahsulotlar O'CHIRILMAYDI — bo'limsiz bo'lib qoladi.
 */
export async function sectionDelete(body: Record<string, unknown>): Promise<Result> {
  const id = text(body.id)
  if (!id) throw new Error('id kerak')

  const db = await adminDb()
  const linked = await db.collection('products').where('sectionId', '==', id).get()

  const batch = db.batch()
  batch.delete(db.collection('sections').doc(id))
  linked.docs.slice(0, BATCH_LIMIT).forEach((doc) => batch.set(doc.ref, { sectionId: null }, { merge: true }))
  await batch.commit()

  return { id, released: linked.size }
}

/**
 * Kategoriya ichidagi to'liq joylashuvni saqlaydi.
 *
 *   sections — bo'lim identifikatorlari, yuqoridan pastga
 *   items    — mahsulotlar yuqoridan pastga: { id, sectionId | null }
 *
 * Admin sudrab joylashtirgan holat bir batch bilan yoziladi: yarim
 * yozilib qolgan tartib ro'yxatni chalkashtirib yuborardi. Mahsulot
 * `order` qiymati kategoriya ichidagi o'rni (0, 1, 2...).
 *
 * Ishonchsiz ma'lumot tekshiriladi: faqat shu kategoriya mahsulotlari va
 * bo'limlari o'zgaradi, begona bo'lim identifikatori bo'limsiz deb olinadi.
 */
export async function catalogLayout(body: Record<string, unknown>): Promise<Result> {
  const category = text(body.category)
  if (!category) throw new Error('Kategoriya kerak')

  const sectionIds = Array.isArray(body.sections) ? body.sections.map((v) => String(v)) : []
  const items = Array.isArray(body.items)
    ? body.items
        .map((raw) => {
          const item = (raw ?? {}) as { id?: unknown; sectionId?: unknown }
          return { id: String(item.id ?? ''), sectionId: item.sectionId ? String(item.sectionId) : null }
        })
        .filter((item) => item.id)
    : []

  if (sectionIds.length + items.length > BATCH_LIMIT) throw new Error('Juda ko‘p element')

  const db = await adminDb()
  const [sectionSnap, productSnap] = await Promise.all([
    db.collection('sections').where('category', '==', category).get(),
    db.collection('products').where('category', '==', category).get(),
  ])
  const ownSections = new Set(sectionSnap.docs.map((doc) => doc.id))
  const ownProducts = new Set(productSnap.docs.map((doc) => doc.id))

  const batch = db.batch()
  let writes = 0

  sectionIds.forEach((id, index) => {
    if (!ownSections.has(id)) return
    batch.set(db.collection('sections').doc(id), { order: index }, { merge: true })
    writes++
  })

  items.forEach((item, index) => {
    if (!ownProducts.has(item.id)) return
    const sectionId = item.sectionId && ownSections.has(item.sectionId) ? item.sectionId : null
    batch.set(db.collection('products').doc(item.id), { order: index, sectionId }, { merge: true })
    writes++
  })

  if (writes) await batch.commit()
  return { writes }
}
