import { adminDb } from '../firebase-admin.js'
import { LOW_STOCK_AT } from './orders.js'
import { linkoForgetProduct } from './linko.js'
import type { Staff } from '../admin-auth.js'

/**
 * Katalog amallari: mahsulot, kategoriya, promokod.
 *
 * Bot ham shu kolleksiyalarga yozadi (bot/firebase_db.py) — hujjat
 * shakli aynan bir xil saqlanadi, aks holda mini app eski va yangi
 * yozuvlarni turlicha o'qib qolardi.
 */

type Result = Record<string, unknown>

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function list(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((v) => String(v).trim()).filter(Boolean)
}

/** Bitta setga ko'pi bilan shuncha xil mahsulot. */
const MAX_BUNDLE = 30

export type BundleItem = { productId: string; quantity: number; name: string }

/**
 * Set tarkibi — bazadagi mahsulotlar va soni.
 *
 * Set o'zi oddiy mahsulot: o'z narxi (masalan 199 000), o'z Linko ID si
 * va qoldig'i bor. Tarkib faqat nima kirishini ko'rsatadi — narxga
 * ta'sir qilmaydi. Tekshiruv: mahsulot mavjud, setning o'zi emas, boshqa
 * set emas (set ichida set chalkashlik beradi), soni 1–99. Nomi
 * saqlanadi — buyurtmada kuryer nimani yig'ishini ko'rsin.
 */
async function readBundle(value: unknown, selfId: string): Promise<BundleItem[]> {
  if (!Array.isArray(value) || !value.length) return []
  const merged = new Map<string, number>()
  for (const raw of value) {
    const row = (raw ?? {}) as Record<string, unknown>
    const productId = text(row.productId) || String(row.productId ?? '').trim()
    const quantity = Math.round(num(row.quantity, 1))
    if (!productId || productId === selfId) continue
    merged.set(productId, Math.min(99, Math.max(1, (merged.get(productId) ?? 0) + Math.max(1, quantity))))
  }
  if (merged.size > MAX_BUNDLE) throw new Error(`Setga ko‘pi bilan ${MAX_BUNDLE} xil mahsulot qo‘shiladi`)

  const db = await adminDb()
  const ids = [...merged.keys()]
  const snaps = ids.length ? await db.getAll(...ids.map((id) => db.collection('products').doc(id))) : []
  const items: BundleItem[] = []
  for (const snap of snaps) {
    if (!snap.exists) throw new Error('Set tarkibidagi mahsulot topilmadi — ro‘yxatni yangilang')
    const data = snap.data() as { name?: string; bundle?: unknown[] }
    if (Array.isArray(data.bundle) && data.bundle.length) {
      throw new Error(`«${data.name}» o‘zi set — set ichiga set qo‘shilmaydi`)
    }
    items.push({ productId: snap.id, quantity: merged.get(snap.id) ?? 1, name: String(data.name || '') })
  }
  return items
}

/** Bot bilan bir xil: 6 xonali tasodifiy raqamli identifikator. */
function newNumericId(): string {
  return String(Math.floor(Math.random() * 900000) + 100000)
}

export async function productSave(body: Record<string, unknown>): Promise<Result> {
  const name = text(body.name)
  if (!name) throw new Error('Mahsulot nomi kerak')

  const price = num(body.price)
  if (price <= 0) throw new Error('Narx noldan katta bo‘lishi kerak')

  const category = text(body.category)
  if (!category) throw new Error('Kategoriya tanlanmagan')

  const db = await adminDb()
  const id = text(body.id) || newNumericId()
  const ref = db.collection('products').doc(id)
  const existing = await ref.get()

  const oldPrice = num(body.oldPrice, 0)
  const images = list(body.images)

  /*
   * Siqilgan nusxalar `images` bilan bir xil uzunlikda saqlanadi (bo'sh
   * satr — nusxa yo'q). Uzunligi mos kelmasa umuman yozilmaydi: noto'g'ri
   * tartibdagi nusxa boshqa mahsulot rasmini ko'rsatib qo'yardi, bo'sh
   * bo'lsa esa ilova shunchaki asl rasmni oladi.
   */
  const variant = (value: unknown): string[] => {
    if (!Array.isArray(value) || value.length !== images.length) return []
    return value.map((v) => (typeof v === 'string' ? v.trim() : ''))
  }

  // Bo'lim shu kategoriyaniki bo'lishi shart — aks holda bo'limsiz
  let sectionId: string | null = text(body.sectionId) || null
  if (sectionId) {
    const section = await db.collection('sections').doc(sectionId).get()
    if (!section.exists || section.data()?.category !== category) sectionId = null
  }

  const stock = Math.max(0, Math.round(num(body.stock)))
  // O'ram — shuncha donadan sotiladi (1 = oddiy). Setda ma'nosi yo'q.
  const packRaw = Math.floor(num(body.pack, 1))
  const pack = Number.isFinite(packRaw) && packRaw > 1 ? Math.min(packRaw, 1000) : 1

  const data: Record<string, unknown> = {
    id,
    name,
    price,
    // 0 — "eski narx yo'q"; mini app undefined kutadi
    oldPrice: oldPrice > price ? oldPrice : null,
    category,
    sectionId,
    images,
    thumbs: variant(body.thumbs),
    optimized: variant(body.optimized),
    // Nusxalar aynan shu rasmlardan — ilova mos kelmaganini ishlatmaydi
    variantSources: images,
    sizes: list(body.sizes),
    color: text(body.color),
    description: text(body.description),
    // Tarjimalar — mini app tanlangan tilda ko'rsatadi, bo'sh bo'lsa o'zbekcha
    nameRu: text(body.nameRu),
    nameEn: text(body.nameEn),
    descriptionRu: text(body.descriptionRu),
    descriptionEn: text(body.descriptionEn),
    discount: text(body.discount),
    // Bosh sahifadagi «Mashhur mahsulotlar» qatori
    popular: body.popular === true,
    // Set bo'lsa — tarkibi (narx o'zgarmaydi, setning o'z narxi). Faqat
    // forma yuborgan bo'lsa: Excel import va boshqalar tarkibni o'chirmasin
    ...('bundle' in body ? { bundle: await readBundle(body.bundle, id) } : {}),
    stock,
    ...('pack' in body ? { pack } : {}),
    // Qoldiq to'ldirildi — keyingi safar ombor signali yana ishlasin
    lowStockAlerted: stock <= LOW_STOCK_AT,
    updatedAt: new Date().toISOString(),
  }

  if (!existing.exists) {
    // Reyting va sharhlar soni faqat yaratilganda beriladi — keyin
    // ularni sharhlar tizimi boshqaradi, admin qo'lda tegmaydi.
    data.rating = 5
    data.reviews = 0
    data.createdAt = data.updatedAt
  }

  await ref.set(data, { merge: true })
  return { id, created: !existing.exists }
}

/** Mahsulotni mijozlarga ko'rsatish / yashirish (admin panelda qoladi). */
export async function productSetActive(body: Record<string, unknown>): Promise<Result> {
  const id = text(body.id)
  if (!id) throw new Error('id kerak')
  if (typeof body.active !== 'boolean') throw new Error('Holat noto‘g‘ri')
  const ref = (await adminDb()).collection('products').doc(id)
  if (!(await ref.get()).exists) throw new Error('Mahsulot topilmadi')
  await ref.set({ active: body.active, updatedAt: new Date().toISOString() }, { merge: true })
  return { id, active: body.active }
}

export async function productDelete(body: Record<string, unknown>): Promise<Result> {
  const id = text(body.id)
  if (!id) throw new Error('id kerak')
  await (await adminDb()).collection('products').doc(id).delete()
  // Linko bog'lanishi osilib qolmasin — keyingi sinxron mahsulotni qayta yaratmasin
  await linkoForgetProduct(id)
  return { id }
}

export async function categorySave(body: Record<string, unknown>): Promise<Result> {
  const name = text(body.name)
  if (!name) throw new Error('Kategoriya nomi kerak')

  const db = await adminDb()
  const id = text(body.id) || newNumericId()

  // Bir xil nomli kategoriya ikki marta bo'lmasin — mahsulotlar
  // kategoriyaga NOM bo'yicha bog'langan, dublikat filtrni buzadi.
  const clash = await db.collection('categories').where('name', '==', name).get()
  if (clash.docs.some((doc) => doc.id !== id)) {
    throw new Error('Bunday nomli kategoriya allaqachon bor')
  }

  await db.collection('categories').doc(id).set(
    // nameRu faqat ko'rinish uchun — mahsulotlar kategoriyaga `name` bilan
    // bog'langan, shuning uchun u o'zgarmaydi
    { id, name, nameRu: text(body.nameRu), icon: text(body.icon) || 'package' },
    { merge: true },
  )
  return { id }
}

export async function categoryDelete(body: Record<string, unknown>): Promise<Result> {
  const id = text(body.id)
  if (!id) throw new Error('id kerak')

  const db = await adminDb()
  const snap = await db.collection('categories').doc(id).get()
  if (!snap.exists) throw new Error('Kategoriya topilmadi')

  const name = String(snap.data()?.name || '')
  const used = await db.collection('products').where('category', '==', name).limit(1).get()
  if (!used.empty) {
    throw new Error('Bu kategoriyada mahsulotlar bor — avval ularni ko‘chiring')
  }

  await db.collection('categories').doc(id).delete()
  return { id }
}

export async function promoSave(body: Record<string, unknown>): Promise<Result> {
  const code = text(body.code).toUpperCase()
  if (!code) throw new Error('Promokod kerak')
  if (!/^[A-Z0-9_-]{3,24}$/.test(code)) {
    throw new Error('Promokod 3–24 ta lotin harfi, raqam, - yoki _ dan iborat bo‘lsin')
  }

  const percent = Math.round(num(body.discountPercent))
  if (percent < 1 || percent > 90) throw new Error('Chegirma 1–90% oralig‘ida bo‘lsin')

  const db = await adminDb()
  const id = text(body.id)

  const clash = await db.collection('promocodes').where('code', '==', code).get()
  if (clash.docs.some((doc) => doc.id !== id)) {
    throw new Error('Bunday promokod allaqachon bor')
  }

  const data: Record<string, unknown> = {
    code,
    discountPercent: percent,
    active: body.active !== false,
    // 0 — cheksiz
    maxUses: Math.max(0, Math.round(num(body.maxUses))),
    expiresAt: text(body.expiresAt) || null,
  }

  if (id) {
    await db.collection('promocodes').doc(id).set(data, { merge: true })
    return { id }
  }

  data.usageCount = 0
  data.createdAt = new Date().toISOString()
  const ref = await db.collection('promocodes').add(data)
  return { id: ref.id, created: true }
}

export async function promoDelete(body: Record<string, unknown>): Promise<Result> {
  const id = text(body.id)
  if (!id) throw new Error('id kerak')
  await (await adminDb()).collection('promocodes').doc(id).delete()
  return { id }
}

/** Xodim rolini tekshirish katalog amallari uchun bir joyda. */
export function requireCatalogAccess(staff: Staff) {
  if (staff.role === 'courier') throw new Error('Kuryer katalogni o‘zgartira olmaydi')
}


/**
 * Mahsulot yoki kategoriya tartibini saqlaydi.
 *
 * Ro'yxatdagi joylashuv `order` maydoniga yoziladi (0, 1, 2...).
 * Mijoz ilovasi shu maydon bo'yicha saralaydi, ya'ni katalogdagi
 * tartibni do'kon o'zi belgilaydi.
 *
 * Bitta batch bilan yoziladi: yarim yozilib qolgan tartib ro'yxatni
 * chalkashtirib yuborardi.
 */
export async function orderSave(body: Record<string, unknown>): Promise<Result> {
  const entity = text(body.entity)
  if (entity !== 'product' && entity !== 'category') {
    throw new Error('entity noto‘g‘ri')
  }

  const ids = Array.isArray(body.ids) ? body.ids.map((v) => String(v)) : []
  if (!ids.length) throw new Error('Tartib bo‘sh')
  if (ids.length > 500) throw new Error('Juda ko‘p element')

  const db = await adminDb()
  const collection = entity === 'product' ? 'products' : 'categories'
  const batch = db.batch()

  ids.forEach((id, index) => {
    batch.set(db.collection(collection).doc(id), { order: index }, { merge: true })
  })

  await batch.commit()
  return { count: ids.length }
}


/** Excel orqali o'zgartirish mumkin bo'lgan maydonlar. Rasmlar ATAYLAB yo'q. */
const BULK_FIELDS = [
  'name', 'nameRu', 'nameEn', 'description', 'descriptionRu', 'descriptionEn',
  'price', 'oldPrice', 'category', 'sectionId', 'stock', 'sizes', 'color', 'discount', 'popular',
] as const
type BulkField = (typeof BULK_FIELDS)[number]

/**
 * Excel'dan yuklangan o'zgarishlarni qo'llaydi.
 *
 *   items — [{ id, patch: { price: 45000, nameRu: '…' } }]
 *
 * Admin panel faylni o'qib, faqat HAQIQATDAN o'zgargan maydonlarni
 * yuboradi. Server baribir hammasini qayta tekshiradi: brauzerdan kelgan
 * ma'lumotga ishonib bo'lmaydi. Rasm maydonlari qabul qilinmaydi —
 * Excel'da rasm yo'q va ular tasodifan o'chib ketmasligi kerak.
 *
 * Bitta noto'g'ri qator butun yuklashni to'xtatmaydi: u `failed` ga
 * tushadi, qolganlari yoziladi.
 */
export async function productBulkUpdate(body: Record<string, unknown>): Promise<Result> {
  const items = Array.isArray(body.items) ? body.items : []
  if (!items.length) throw new Error('O‘zgarish yo‘q')
  if (items.length > 400) throw new Error('Bir martada 400 tadan ko‘p mahsulot yuborilmaydi')

  const db = await adminDb()
  const [categorySnap, sectionSnap] = await Promise.all([
    db.collection('categories').get(),
    db.collection('sections').get(),
  ])
  const categories = new Set(categorySnap.docs.map((d) => String(d.data().name)))
  const sections = new Map(sectionSnap.docs.map((d) => [d.id, String(d.data().category)]))

  const refs = items.map((raw) => db.collection('products').doc(text((raw as { id?: unknown })?.id)))
  const snaps = refs.length ? await db.getAll(...refs) : []

  const batch = db.batch()
  const updated: string[] = []
  const failed: { id: string; error: string }[] = []

  items.forEach((raw, i) => {
    const { id: rawId, patch: rawPatch } = (raw ?? {}) as { id?: unknown; patch?: Record<string, unknown> }
    const id = text(rawId)
    try {
      if (!id) throw new Error('ID yo‘q')
      const snap = snaps[i]
      if (!snap.exists) throw new Error('Bunday ID li mahsulot yo‘q')
      const current = snap.data() || {}
      const patch = rawPatch && typeof rawPatch === 'object' ? rawPatch : {}

      const data: Record<string, unknown> = {}
      for (const key of Object.keys(patch) as BulkField[]) {
        if (!BULK_FIELDS.includes(key)) continue
        const value = patch[key]
        switch (key) {
          case 'price': {
            const price = num(value)
            if (price <= 0) throw new Error('Narx noldan katta bo‘lishi kerak')
            data.price = Math.round(price)
            break
          }
          case 'oldPrice': {
            const old = num(value, 0)
            data.oldPrice = old > 0 ? Math.round(old) : null
            break
          }
          case 'stock': {
            const stock = num(value, NaN)
            if (!Number.isFinite(stock) || stock < 0) throw new Error('Qoldiq 0 yoki undan katta butun son bo‘lsin')
            const rounded = Math.round(stock)
            data.stock = rounded
            // Chegaradan yuqori bo'lsa signal qaytadan yoqiladi
            data.lowStockAlerted = rounded <= LOW_STOCK_AT
            break
          }
          case 'category': {
            const category = text(value)
            if (!categories.has(category)) throw new Error(`«${category}» kategoriyasi yo‘q`)
            data.category = category
            break
          }
          case 'sectionId':
            data.sectionId = text(value) || null
            break
          case 'sizes':
            data.sizes = list(value)
            break
          case 'popular':
            data.popular = value === true
            break
          case 'name': {
            const name = text(value)
            if (!name) throw new Error('Nomi bo‘sh bo‘lmasin')
            data.name = name
            break
          }
          default:
            data[key] = text(value)
        }
      }

      // Bo'lim yangi (yoki eski) kategoriyaga mos kelishi shart
      const category = String(data.category ?? current.category ?? '')
      const sectionId = 'sectionId' in data ? data.sectionId : current.sectionId
      if (sectionId && sections.get(String(sectionId)) !== category) {
        if ('sectionId' in data) throw new Error('Bo‘lim boshqa kategoriyaga tegishli')
        data.sectionId = null // kategoriya almashdi — eski bo'lim endi mos emas
      }
      // Eski narx joriy narxdan katta bo'lmasa — ma'nosiz, ko'rsatilmaydi
      const price = Number(data.price ?? current.price)
      const oldPrice = 'oldPrice' in data ? data.oldPrice : current.oldPrice
      if (oldPrice !== null && oldPrice !== undefined && Number(oldPrice) <= price) data.oldPrice = null

      if (!Object.keys(data).length) return
      data.updatedAt = new Date().toISOString()
      batch.set(refs[i], data, { merge: true })
      updated.push(id)
    } catch (error) {
      failed.push({ id: id || `#${i + 1}`, error: error instanceof Error ? error.message : 'Xato' })
    }
  })

  if (updated.length) await batch.commit()
  return { updated, failed }
}
