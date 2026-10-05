import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '../firebase-admin.js'
import { LOW_STOCK_AT } from './orders.js'
import {
  linkoCount, linkoGet, linkoList, linkoToken, readLinkoSettings, tmOf,
} from '../linko.js'

/**
 * Linko (SFA) bilan katalog sinxroni: MAHSULOT, NARX va QOLDIQ
 * Linko'dan Trade Avenue'ga bir tomonlama ko'chiriladi.
 *
 * Nega oraliq `linko_products` to'plami bor?
 *
 * Linko'dagi har pozitsiya avtomatik do'konga chiqib ketmasligi kerak —
 * u yerda sotuvga chiqarilmaydiganlari ham bor. Shuning uchun avval
 * Linko katalogining NUSXASI olinadi, admin esa kerakli pozitsiyani
 * mavjud do'kon mahsulotiga bog'laydi yoki undan yangi mahsulot yaratadi.
 * Narx va qoldiq faqat BOG'LANGANLARIGA tushadi.
 *
 * Rasm, tavsif, tarjima va kategoriya bizning tomonda qoladi: Linko'da
 * ular yo'q, har sinxronda ustidan yozilsa admin mehnati yo'qolardi.
 */

type Result = Record<string, unknown>

const MIRROR = 'linko_products'

type LinkoProduct = {
  id: number
  name?: string
  code?: string | null
  vendor_code?: string | null
  service_id?: string | null
  type?: { id?: number; name?: string } | null
  measurement?: { name?: string } | null
  tm?: string | number
}

type LinkoPriceItem = {
  product_id: number
  price_list_id: number
  price?: string | number
  tm?: string | number
}

type LinkoBalance = {
  product?: { id?: number } | null
  stock?: { id?: number } | null
  balance?: string | number
  tm?: string | number
}

type MirrorDoc = {
  linkoId: number
  name: string
  code: string
  vendorCode: string
  typeName: string
  measurement: string
  /** Asosiy (sozlamadagi) narxlar ro'yxatidagi narx. */
  price: number
  /** Hamma ishlatiladigan ro'yxatlardagi narxlar: ro'yxat id → narx (dona). */
  prices?: Record<string, number>
  balances: Record<string, number>
  stock: number
  /**
   * Shu pozitsiya bog'langan do'kon mahsulotlari.
   *
   * Ikkala yo'nalish ham bo'ladi:
   *   • bir mahsulotga bir nechta pozitsiya — do'konda bitta kartochka,
   *     Linko'da to'rt xil ta'm alohida qator (qoldiq qo'shiladi);
   *   • bir pozitsiya bir nechta mahsulotga — Linko'da umumiy
   *     «BAMBUK 90GR», do'konda esa har ta'm alohida mahsulot
   *     (hammasiga o'sha narx va qoldiq tushadi).
   */
  productIds: string[]
  /** Eski yozuvlar — bitta mahsulot. O'qishda hisobga olinadi. */
  productId?: string | null
  /**
   * Shu pozitsiya do'kondagi mahsulotning NARXINI beradimi.
   *
   * Bitta mahsulotga bir nechta pozitsiya bog'lanishi mumkin (masalan
   * bir mahsulotning to'rt xil ta'mi Linko'da to'rt qator). Qoldiq
   * hammasining yig'indisi bo'ladi, narx esa bittasidan olinadi — aks
   * holda qaysi ta'mning narxi chiqishi tasodifga bog'liq bo'lardi.
   */
  primary: boolean
  updatedAt: string
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Qator bog'langan mahsulotlar — eski (`productId`) yozuvlar bilan ham ishlaydi. */
function rowProducts(data: Partial<MirrorDoc> | undefined): string[] {
  if (!data) return []
  if (Array.isArray(data.productIds)) return data.productIds.map(text).filter(Boolean)
  const single = text(data.productId)
  return single ? [single] : []
}

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function newNumericId(): string {
  return String(Math.floor(Math.random() * 900000) + 100000)
}

/** Nom bo'yicha solishtirish uchun — registr va ortiqcha bo'shliqlarsiz. */
function key(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Firestore bitta batch'da 500 tadan ko'p yozuvni qabul qilmaydi. */
const BATCH_LIMIT = 400

type Write = { ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }

async function commitAll(writes: Write[]): Promise<void> {
  if (!writes.length) return
  const db = await adminDb()
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = db.batch()
    for (const item of writes.slice(i, i + BATCH_LIMIT)) {
      batch.set(item.ref, item.data, { merge: true })
    }
    await batch.commit()
  }
}

/**
 * Do'kondagi mahsulotning narx va qoldig'ini unga bog'langan HAMMA
 * Linko pozitsiyasidan qayta hisoblaydi.
 *
 * Qoldiq — yig'indi: to'rt xil ta'mning qoldig'i qo'shilib, mijoz
 * «bor» deb ko'radi. Narx — «asosiy» pozitsiyadan; u belgilanmagan
 * bo'lsa eng qimmatidan olinadi, chunki arzonini ko'rsatib qimmatini
 * sotish mijozni aldash bo'lardi.
 */
async function applyToProduct(
  productId: string,
  rows: { price: number; stock: number; primary?: boolean }[],
  now: string,
): Promise<Write | null> {
  /*
   * Bitta ham bog'langan pozitsiya qolmasa mahsulotga TEGILMAYDI:
   * narx va qoldiq oxirgi sinxrondagi holatida qoladi va endi ularni
   * admin o'zi boshqaradi. Qoldiqni nolga tushirish xavfli bo'lardi —
   * tasodifan uzib qo'yilgan mahsulot do'kondan yo'qolib qolardi.
   */
  if (!productId || !rows.length) return null

  const db = await adminDb()
  /*
   * Mahsulot do'kondan o'chirilgan bo'lsa — yozilmaydi. `merge` bilan
   * yozish yo'q hujjatni YARATADI: ilgari o'chirilgan mahsulot har
   * sinxronda nomsiz «arvoh» bo'lib qaytib kelardi (faqat narx va qoldiq
   * bilan) va admin paneldagi reklama sahifasini yiqitardi.
   */
  const current = await db.collection('products').doc(productId).get()
  if (!current.exists) return null
  const stock = Math.max(0, Math.round(rows.reduce((sum, row) => sum + num(row.stock), 0)))
  const priced = rows.filter((row) => num(row.price) > 0)
  const primary = priced.find((row) => row.primary)
  const price = primary
    ? num(primary.price)
    : priced.reduce((max, row) => Math.max(max, num(row.price)), 0)

  /*
   * Narx ham, qoldiq ham o'zgarmagan — yozilmaydi. Har yozuv ilovani
   * ochib turgan HAR BIR mijoz va admin uchun qayta o'qish bo'lardi.
   */
  const was = current.data() ?? {}
  const samePrice = !(price > 0) || num(was.price) === price
  const sameStock = typeof was.stock === 'number' && was.stock === stock
  if (samePrice && sameStock && (was.lowStockAlerted === true) === (stock <= LOW_STOCK_AT)) return null

  return {
    ref: db.collection('products').doc(productId),
    data: {
      ...(price > 0 ? { price } : {}),
      stock,
      // Qoldiq to'ldirilgan bo'lsa ombor signali qaytadan yoqiladi
      lowStockAlerted: stock <= LOW_STOCK_AT,
      updatedAt: now,
    },
  }
}

/**
 * Do'konlar ishlatadigan narxlar ro'yxatlari: sozlamadagi asosiysi va
 * do'konlarniki (settings/shops.priceListIds — do'konlar sinxroni yozadi).
 */
async function priceListsInUse(settings: { priceListId: number }): Promise<number[]> {
  const db = await adminDb()
  const fromShops = (await db.collection('settings').doc('shops').get()).data()?.priceListIds
  const ids = [settings.priceListId, ...(Array.isArray(fromShops) ? fromShops.map(Number) : [])]
  return [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))]
}

/**
 * Mahsulotning har ro'yxatdagi narxi — «asosiy» pozitsiyadan, u bo'lmasa
 * eng qimmatidan (applyToProduct dagi qoida bilan bir xil).
 */
function listPricesOf(rows: MirrorDoc[]): Record<string, number> {
  const out: Record<string, number> = {}
  const lists = new Set(rows.flatMap((row) => Object.keys(row.prices ?? {})))
  for (const list of lists) {
    const priced = rows.filter((row) => num(row.prices?.[list]) > 0)
    const primary = priced.find((row) => row.primary)
    const price = primary ? num(primary.prices?.[list]) : priced.reduce((max, row) => Math.max(max, num(row.prices?.[list])), 0)
    if (price > 0) out[list] = Math.round(price)
  }
  return out
}

/**
 * Do'kon narxlari: `price_lists/{ro'yxat}.prices[mahsulot]` — DONA narxi.
 *
 * Har ro'yxat bitta hujjat: mini app faqat o'z do'konining ro'yxatini
 * o'qiydi (Rules: `pl` claim), boshqa do'konlar narxini ko'rmaydi. Server
 * buyurtmada narxni shu yerdan oladi (api/orders.ts). Ro'yxatda bo'lmagan
 * mahsulot — mahsulotning o'z (asosiy) narxida.
 */
export async function syncListPrices(productIds: string[]): Promise<number> {
  const ids = [...new Set(productIds.filter(Boolean))]
  if (!ids.length) return 0
  const db = await adminDb()
  const grouped = await linkedRows(ids)
  const updates = new Map<string, Record<string, unknown>>()
  const now = new Date().toISOString()
  const lists = new Set<string>()
  const perProduct = new Map<string, Record<string, number>>()
  for (const id of ids) {
    const prices = listPricesOf(grouped.get(id) ?? [])
    perProduct.set(id, prices)
    Object.keys(prices).forEach((list) => lists.add(list))
  }
  // Mahsulot ro'yxatdan chiqib ketgan bo'lsa (uzildi) — o'sha ro'yxatdan ham o'chadi
  const existing = await db.collection('price_lists').get()
  existing.docs.forEach((doc) => lists.add(doc.id))
  for (const list of lists) {
    const prices: Record<string, unknown> = {}
    for (const id of ids) {
      const price = perProduct.get(id)?.[list]
      prices[id] = price && price > 0 ? price : FieldValue.delete()
    }
    updates.set(list, { prices, updatedAt: now })
  }
  for (const [list, data] of updates) {
    await db.collection('price_lists').doc(list).set(data, { merge: true })
  }
  return updates.size
}

/** Nusxadagi hamma qatorni mahsulot bo'yicha guruhlaydi. */
async function linkedRows(only?: string[]): Promise<Map<string, MirrorDoc[]>> {
  const db = await adminDb()
  let docs: FirebaseFirestore.QueryDocumentSnapshot[]
  if (only) {
    /*
     * Tejamkor yo'l (har 30 daqiqalik sinxron): butun nusxani (500+ hujjat)
     * o'qimay, faqat shu mahsulotlarga bog'langan qatorlar. Firestore
     * `array-contains-any` / `in` bir so'rovda 30 tagacha qiymat oladi.
     * Eski yozuvlar (`productId` — bitta) ham hisobga olinadi.
     */
    const ids = [...new Set(only.filter(Boolean))]
    const seen = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>()
    for (let i = 0; i < ids.length; i += 30) {
      const chunk = ids.slice(i, i + 30)
      const [many, single] = await Promise.all([
        db.collection(MIRROR).where('productIds', 'array-contains-any', chunk).get(),
        db.collection(MIRROR).where('productId', 'in', chunk).get(),
      ])
      for (const doc of [...many.docs, ...single.docs]) seen.set(doc.id, doc)
    }
    docs = [...seen.values()]
  } else {
    docs = (await db.collection(MIRROR).get()).docs
  }
  const map = new Map<string, MirrorDoc[]>()
  for (const doc of docs) {
    const data = doc.data() as MirrorDoc
    for (const id of rowProducts(data)) {
      if (only && !only.includes(id)) continue
      map.set(id, [...(map.get(id) ?? []), data])
    }
  }
  return map
}

/**
 * Ulanishni tekshiradi va admin panel uchun ma'lumotnoma qaytaradi:
 * narxlar ro'yxatlari, skladlar, Linko'da nechta mahsulot bor va
 * nechtasi katalogimiz bilan bog'langan.
 */
export async function linkoStatus(): Promise<Result> {
  const settings = await readLinkoSettings()
  const hasToken = Boolean(linkoToken())

  if (!settings.baseUrl || !hasToken) {
    return { connected: false, hasToken, settings, reason: hasToken ? 'baseUrl' : 'token' }
  }

  type LinkoUser = {
    id: number
    first_name?: string
    second_name?: string
    is_active?: boolean
    job?: { name?: string }
  }

  const [products, priceLists, stocks, users] = await Promise.all([
    linkoCount('products', settings),
    linkoList<{ id: number; name?: string }>('price_lists/', {}, settings),
    linkoList<{ id: number; name?: string }>('stocks/', {}, settings),
    // Buyurtma yuborishda agent va yetkazuvchi ko'rsatilishi shart
    linkoList<LinkoUser>('users/', {}, settings),
  ])

  const person = (user: LinkoUser) => ({
    id: user.id,
    name: [user.first_name, user.second_name].filter(Boolean).join(' ').trim() || `#${user.id}`,
    job: text(user.job?.name),
  })
  const active = users.filter((user) => user.is_active !== false)

  const db = await adminDb()
  const mirror = await db.collection(MIRROR).get()
  const linked = mirror.docs.filter((doc) => rowProducts(doc.data()).length).length

  return {
    connected: true,
    hasToken,
    settings,
    products,
    priceLists: priceLists.map((p) => ({ id: p.id, name: text(p.name) || `#${p.id}` })),
    stocks: stocks.map((s) => ({ id: s.id, name: text(s.name) || `#${s.id}` })),
    users: active.map(person),
    mirror: { total: mirror.size, linked },
  }
}

export async function linkoSettingsSave(
  _staff: unknown,
  body: Record<string, unknown>,
): Promise<Result> {
  const baseUrl = text(body.baseUrl).replace(/\/+$/, '')
  if (baseUrl && !/^https?:\/\/[^\s/]+$/i.test(baseUrl)) {
    throw new Error('Manzil `https://nom.linko.uz` ko‘rinishida bo‘lsin')
  }

  /*
   * FAQAT kelgan maydonlar yangilanadi.
   *
   * Panelda ikki karta bor — ulanish va buyurtma yuborish. Hammasini
   * birdan yozsak, bir kartadagi «Saqlash» ikkinchisining sozlamasini
   * nolga tushirib yuborardi.
   */
  const update: Record<string, unknown> = {}

  if ('baseUrl' in body) update.baseUrl = baseUrl
  if ('priceListId' in body) update.priceListId = Math.round(num(body.priceListId))
  if (Array.isArray(body.stockIds)) {
    update.stockIds = [...new Set(body.stockIds.map((v) => Math.round(num(v))).filter((v) => v > 0))]
  }
  if ('sendOrders' in body) update.sendOrders = body.sendOrders === true
  if ('agentId' in body) update.agentId = Math.round(num(body.agentId))
  if ('deliveryManId' in body) update.deliveryManId = Math.round(num(body.deliveryManId))
  if ('orderStockId' in body) update.orderStockId = Math.round(num(body.orderStockId))
  if ('currencyId' in body) update.currencyId = Math.round(num(body.currencyId)) || 1
  if ('marketTypeId' in body) update.marketTypeId = Math.max(0, Math.round(num(body.marketTypeId)))

  const db = await adminDb()
  await db.collection('settings').doc('linko').set(update, { merge: true })
  return { ok: true, saved: Object.keys(update) }
}

/**
 * Linko'dan mahsulot, narx va qoldiqni tortadi.
 *
 * Odatda ORTTIRMA: oxirgi sinxrondagi `tm` dan keyin o'zgarganlari
 * olinadi (Linko hujjati shuni tavsiya qiladi). `full: true` bilan
 * hammasi qaytadan o'qiladi — masalan narxlar ro'yxati almashtirilganda.
 *
 * Ikki narsa amalda shunday ekani tekshirildi (sfademo):
 *   • `last_tm` INKLYUZIV — chegaradagi yozuv keyingi safar ham keladi.
 *     Zarari yo'q: yozuv `merge` bilan ustiga yoziladi, natija o'zgarmaydi.
 *   • Narx yozuvlarida `tm` bo'sh bo'lishi mumkin. Unda kursor siljimaydi
 *     va o'sha narxlar ro'yxati har safar to'liq o'qiladi — bu ataylab:
 *     narx o'zgarishini o'tkazib yuborgandan ko'ra qayta o'qigan yaxshi.
 */
export async function linkoPull(
  _staff: unknown,
  body: Record<string, unknown> = {},
): Promise<Result> {
  const settings = await readLinkoSettings()
  const full = body.full === true
  const db = await adminDb()

  const productParams: Record<string, string | number> = {}
  if (!full && settings.lastProductTm) productParams.last_tm = settings.lastProductTm
  const products = await linkoList<LinkoProduct>('products/', productParams, settings)

  /*
   * Narxlar — har ro'yxat alohida (do'konlar turli narx ro'yxatida).
   * Asosiysi mahsulotning `price` maydoniga, hammasi `price_lists/` ga.
   */
  const listIds = await priceListsInUse(settings)
  const priceTms: Record<string, number> = { ...settings.priceTms }
  const pricesByList = new Map<number, Map<number, number>>()
  let pricesRead = 0
  for (const list of listIds) {
    const params: Record<string, string | number> = { price_list: list }
    const cursor = num(priceTms[String(list)]) || (list === settings.priceListId ? settings.lastPriceTm : 0)
    if (!full && cursor) params.last_tm = cursor
    const items = await linkoList<LinkoPriceItem>('price_list_items/', params, settings)
    pricesRead += items.length
    const map = new Map<number, number>()
    for (const item of items) {
      if (!item?.product_id || item.price_list_id !== list) continue
      map.set(item.product_id, Math.round(num(item.price)))
    }
    pricesByList.set(list, map)
    priceTms[String(list)] = items.reduce((max, row) => Math.max(max, tmOf(row?.tm)), full ? 0 : cursor)
  }

  const balanceParams: Record<string, string | number> = {}
  if (!full && settings.lastBalanceTm) balanceParams.last_tm = settings.lastBalanceTm
  const balances = await linkoList<LinkoBalance>('product_balances/', balanceParams, settings)

  // ── O'zgargan pozitsiyalarni bitta ro'yxatga yig'amiz ──
  const touched = new Set<number>()
  const infoById = new Map<number, LinkoProduct>()
  for (const product of products) {
    if (!product?.id) continue
    infoById.set(product.id, product)
    touched.add(product.id)
  }

  const priceById = pricesByList.get(settings.priceListId) ?? new Map<number, number>()
  for (const map of pricesByList.values()) for (const id of map.keys()) touched.add(id)

  const balanceById = new Map<number, Record<string, number>>()
  for (const row of balances) {
    const productId = Number(row?.product?.id)
    const stockId = Number(row?.stock?.id)
    if (!Number.isFinite(productId) || !Number.isFinite(stockId)) continue
    const current = balanceById.get(productId) ?? {}
    current[String(stockId)] = num(row.balance)
    balanceById.set(productId, current)
    touched.add(productId)
  }

  const now = new Date().toISOString()

  if (!touched.size) {
    const report = 'O‘zgarish yo‘q'
    await db.collection('settings').doc('linko').set(
      { lastSyncAt: now, lastReport: report },
      { merge: true },
    )
    await db.collection('settings').doc('linko').set({ priceTms }, { merge: true })
    return { ok: true, changed: 0, products: 0, prices: 0, balances: 0, updatedProducts: 0, report }
  }

  // ── Nusxadagi eski holat: bog'lanish va boshqa skladlar qoldig'i ──
  const ids = [...touched]
  const mirrorSnaps = await db.getAll(...ids.map((id) => db.collection(MIRROR).doc(String(id))))
  const existing = new Map<number, Partial<MirrorDoc>>()
  mirrorSnaps.forEach((snap, index) => {
    if (snap.exists) existing.set(ids[index], snap.data() as Partial<MirrorDoc>)
  })

  const mirrorWrites: Write[] = []
  // Shu sinxronda tegilgan mahsulotlar — keyin ularning hammasi
  // bog'langan pozitsiyalar bo'yicha qayta hisoblanadi
  const affected = new Set<string>()

  for (const id of ids) {
    const old = existing.get(id) ?? {}
    const info = infoById.get(id)

    /*
     * Qoldiq skladlar kesimida saqlanadi. Orttirma sinxronda faqat
     * O'ZGARGAN sklad keladi, jami esa hamma sklad bo'yicha hisoblanadi —
     * shuning uchun eskisi o'chirilmaydi, ustiga yoziladi.
     */
    const stockMap = { ...(old.balances ?? {}), ...(balanceById.get(id) ?? {}) }
    const selected = settings.stockIds.length ? settings.stockIds.map(String) : Object.keys(stockMap)
    const stock = Math.max(
      0,
      Math.round(selected.reduce((sum, stockId) => sum + num(stockMap[stockId]), 0)),
    )

    const price = priceById.has(id) ? (priceById.get(id) as number) : num(old.price)
    const listPrices: Record<string, number> = { ...(old.prices ?? {}) }
    for (const [list, map] of pricesByList) if (map.has(id)) listPrices[String(list)] = map.get(id) as number
    const productIds = rowProducts(old)

    // Hech narsa o'zgarmagan — qayta yozilmaydi (mahsulot ham qayta hisoblanmaydi)
    const name = text(info?.name) || text(old.name)
    const unchanged = existing.has(id)
      && num(old.price) === price
      && num(old.stock) === stock
      && JSON.stringify(old.prices ?? {}) === JSON.stringify(listPrices)
      && text(old.name) === name
      && JSON.stringify(old.balances ?? {}) === JSON.stringify(stockMap)
    if (unchanged) continue

    mirrorWrites.push({
      ref: db.collection(MIRROR).doc(String(id)),
      data: {
        linkoId: id,
        name: text(info?.name) || text(old.name),
        code: text(info?.code) || text(old.code),
        vendorCode: text(info?.vendor_code) || text(old.vendorCode),
        typeName: text(info?.type?.name) || text(old.typeName),
        measurement: text(info?.measurement?.name) || text(old.measurement),
        price,
        prices: listPrices,
        balances: stockMap,
        stock,
        productIds,
        updatedAt: now,
      },
    })

    for (const productId of productIds) affected.add(productId)
  }

  // Avval nusxa yangilanadi, keyin do'kon mahsulotlari — hisob yangi
  // qiymatlar bo'yicha ketishi uchun
  await commitAll(mirrorWrites)

  const grouped = await linkedRows([...affected])
  const productWrites: Write[] = []
  for (const productId of affected) {
    const write = await applyToProduct(productId, grouped.get(productId) ?? [], now)
    if (write) productWrites.push(write)
  }
  await commitAll(productWrites)
  // Do'kon narxlari (har ro'yxat) — shu mahsulotlar uchun qayta hisoblanadi
  await syncListPrices([...affected])

  // ── Kursorlar: keyingi safar faqat yangisi keladi ──
  const maxTm = (rows: { tm?: string | number }[], current: number) =>
    rows.reduce((max, row) => Math.max(max, tmOf(row?.tm)), full ? 0 : current)

  const report =
    `${products.length} mahsulot, ${pricesRead} narx (${listIds.length} ro‘yxat), ${balances.length} qoldiq o‘qildi; ` +
    `${productWrites.length} ta do‘kon mahsuloti yangilandi`

  await db.collection('settings').doc('linko').set(
    {
      lastProductTm: maxTm(products, settings.lastProductTm),
      lastPriceTm: num(priceTms[String(settings.priceListId)]) || settings.lastPriceTm,
      priceTms,
      lastBalanceTm: maxTm(balances, settings.lastBalanceTm),
      lastSyncAt: now,
      lastReport: report,
    },
    { merge: true },
  )

  return {
    ok: true,
    changed: touched.size,
    products: products.length,
    prices: pricesRead,
    balances: balances.length,
    updatedProducts: productWrites.length,
    report,
  }
}

/**
 * Linko pozitsiyasi bilan do'kon mahsulotlari orasidagi bog'lanish.
 *
 * Ikkala yo'nalish ham qo'llab-quvvatlanadi:
 *
 *   • BIR MAHSULOTGA BIR NECHTA POZITSIYA — do'konda bitta kartochka,
 *     Linko'da har ta'm alohida qator. Qoldiq qo'shiladi, narx esa
 *     «asosiy» deb belgilangan pozitsiyadan olinadi.
 *
 *   • BIR POZITSIYA BIR NECHTA MAHSULOTGA — Linko'da umumiy
 *     «BAMBUK 90GR», do'konda esa har ta'm alohida mahsulot. Hammasiga
 *     o'sha narx va qoldiq tushadi (Linko ta'mlarni ajratmaydi).
 *
 * Chaqirish usullari:
 *   { linkoId, productIds: [...] }  — ro'yxatni AYNAN shunday qilib qo'yadi
 *   { linkoId, productId }          — ro'yxatga bittasini qo'shadi
 *   { linkoId, category, name }     — yangi mahsulot yaratib bog'laydi
 *   { linkoId, makePrimary: true }  — narx shu pozitsiyadan olinsin
 *   { linkoId, unlink: true }       — hamma bog'lanishni uzadi
 */
export async function linkoLink(_staff: unknown, body: Record<string, unknown>): Promise<Result> {
  const linkoId = Math.round(num(body.linkoId))
  if (!linkoId) throw new Error('linkoId kerak')

  const db = await adminDb()
  const mirrorRef = db.collection(MIRROR).doc(String(linkoId))
  const mirrorSnap = await mirrorRef.get()
  if (!mirrorSnap.exists) throw new Error('Bu pozitsiya nusxada yo‘q — avval sinxronlang')
  const mirror = mirrorSnap.data() as MirrorDoc

  const now = new Date().toISOString()
  const before = rowProducts(mirror)

  /** O'zgarishdan keyin tegilgan mahsulotlarni qayta hisoblaydi. */
  const recalc = async (ids: string[]) => {
    const grouped = await linkedRows()
    const writes: Write[] = []
    for (const id of new Set(ids)) {
      const write = await applyToProduct(id, grouped.get(id) ?? [], now)
      if (write) writes.push(write)
    }
    await commitAll(writes)
    await syncListPrices(ids)
  }

  // ── Uzish ──
  if (body.unlink === true) {
    await mirrorRef.set({ productIds: [], productId: null, primary: false, updatedAt: now }, { merge: true })
    await promotePrimary(before, linkoId)
    await recalc(before)
    return { ok: true, unlinked: true }
  }

  // ── Faqat «asosiy» belgisini o'zgartirish ──
  if (body.makePrimary === true && !body.productId && !Array.isArray(body.productIds)) {
    if (!before.length) throw new Error('Avval mahsulotga bog‘lang')
    await clearPrimary(before, linkoId)
    await mirrorRef.set({ primary: true, updatedAt: now }, { merge: true })
    await recalc(before)
    return { ok: true, primary: true }
  }

  let next: string[]
  let created = false

  if (Array.isArray(body.productIds)) {
    // Ro'yxat to'liq almashtiriladi — panel shu usulni ishlatadi
    next = [...new Set(body.productIds.map(text).filter(Boolean))]
    for (const id of next) {
      const product = await db.collection('products').doc(id).get()
      if (!product.exists) throw new Error('Mahsulot topilmadi')
    }
  } else if (text(body.productId)) {
    const id = text(body.productId)
    const product = await db.collection('products').doc(id).get()
    if (!product.exists) throw new Error('Mahsulot topilmadi')
    next = [...new Set([...before, id])]
  } else {
    // ── Linko pozitsiyasidan yangi mahsulot ──
    const category = text(body.category)
    if (!category) throw new Error('Kategoriya tanlanmagan')
    const categories = await db.collection('categories').where('name', '==', category).limit(1).get()
    if (categories.empty) throw new Error(`«${category}» kategoriyasi yo‘q`)
    if (!mirror.price) throw new Error('Narx yo‘q — avval narxlar ro‘yxatini tanlab sinxronlang')

    const fresh = newNumericId()
    await db.collection('products').doc(fresh).set({
      id: Number(fresh),
      name: text(body.name) || mirror.name,
      price: mirror.price,
      oldPrice: null,
      category,
      sectionId: null,
      // Rasm va tavsif bizning tomonda qo'shiladi — Linko'da ular yo'q
      images: [],
      thumbs: [],
      optimized: [],
      variantSources: [],
      description: '',
      stock: mirror.stock,
      lowStockAlerted: mirror.stock <= LOW_STOCK_AT,
      popular: false,
      rating: 5,
      reviews: 0,
      createdAt: now,
      updatedAt: now,
    })
    next = [...new Set([...before, fresh])]
    created = true
  }

  /*
   * Narx manbasi. Qo'shilayotgan mahsulotlardan birortasida hali
   * asosiy pozitsiya bo'lmasa, shu qator asosiy bo'ladi — aks holda
   * mahsulot narxsiz qolardi.
   */
  const grouped = await linkedRows()
  const needsPrimary = next.some((id) =>
    (grouped.get(id) ?? []).every((row) => row.linkoId === linkoId || !row.primary),
  )
  const primary = body.makePrimary === true || mirror.primary === true || needsPrimary

  if (primary) await clearPrimary(next, linkoId)

  await mirrorRef.set(
    { productIds: next, productId: next[0] ?? null, primary, updatedAt: now },
    { merge: true },
  )

  await recalc([...before, ...next])
  return { ok: true, productIds: next, created, primary, linkedCount: next.length }
}

/** Shu mahsulotlarga bog'langan BOSHQA qatorlardan «asosiy» olib tashlanadi. */
async function clearPrimary(productIds: string[], keepLinkoId: number): Promise<void> {
  if (!productIds.length) return
  const grouped = await linkedRows()
  const db = await adminDb()
  const seen = new Set<number>()
  for (const id of productIds) {
    for (const row of grouped.get(id) ?? []) {
      if (row.linkoId === keepLinkoId || !row.primary || seen.has(row.linkoId)) continue
      seen.add(row.linkoId)
      await db.collection(MIRROR).doc(String(row.linkoId)).set({ primary: false }, { merge: true })
    }
  }
}

/**
 * Asosiy pozitsiya uzilganda narx manbasiz qolmasligi uchun
 * qolganlardan biri asosiy qilinadi.
 */
async function promotePrimary(productIds: string[], removedLinkoId: number): Promise<void> {
  if (!productIds.length) return
  const grouped = await linkedRows()
  const db = await adminDb()
  for (const id of productIds) {
    const rows = (grouped.get(id) ?? []).filter((row) => row.linkoId !== removedLinkoId)
    if (!rows.length || rows.some((row) => row.primary)) continue
    await db.collection(MIRROR).doc(String(rows[0].linkoId)).set({ primary: true }, { merge: true })
  }
}

/**
 * Nomi aynan mos tushadiganlarni o'zi bog'laydi.
 *
 * Bir nechta mahsulot bir xil nomga ega bo'lsa — tegilmaydi: qaysi
 * biri kerakligini admin o'zi aytsin.
 */
export async function linkoAutoLink(): Promise<Result> {
  const db = await adminDb()
  const [mirrorSnap, productSnap] = await Promise.all([
    db.collection(MIRROR).get(),
    db.collection('products').get(),
  ])

  const byName = new Map<string, string[]>()
  for (const doc of productSnap.docs) {
    const name = key(String(doc.data().name || ''))
    if (!name) continue
    byName.set(name, [...(byName.get(name) ?? []), doc.id])
  }

  const taken = new Set(mirrorSnap.docs.flatMap((doc) => rowProducts(doc.data())))

  const writes: Write[] = []
  const now = new Date().toISOString()
  let linked = 0

  for (const doc of mirrorSnap.docs) {
    const data = doc.data() as MirrorDoc
    if (rowProducts(data).length) continue
    const matches = byName.get(key(String(data.name || '')))
    if (!matches || matches.length !== 1) continue
    const productId = matches[0]
    if (taken.has(productId)) continue

    taken.add(productId)
    linked++
    // Nomi aynan mos tushgan yagona pozitsiya — o'zi asosiy bo'ladi
    writes.push({
      ref: doc.ref,
      data: { productIds: [productId], productId, primary: true, updatedAt: now },
    })
    writes.push({
      ref: db.collection('products').doc(productId),
      data: {
        ...(num(data.price) > 0 ? { price: num(data.price) } : {}),
        stock: num(data.stock),
        lowStockAlerted: num(data.stock) <= LOW_STOCK_AT,
        updatedAt: now,
      },
    })
  }

  await commitAll(writes)
  await syncListPrices(writes.filter((w) => w.ref.parent.id === 'products').map((w) => w.ref.id))
  return { ok: true, linked }
}

/**
 * Mahsulot o'chirildi — unga bog'langan Linko pozitsiyalaridan uziladi.
 * Aks holda bog'lanish osilib qolib, panelda yo'q mahsulotga «bog'langan»
 * ko'rinardi. Xato tashlamaydi: o'chirish baribir amalga oshsin.
 */
export async function linkoForgetProduct(productId: string): Promise<number> {
  try {
    const db = await adminDb()
    const snap = await db.collection(MIRROR).get()
    const now = new Date().toISOString()
    let changed = 0
    for (const doc of snap.docs) {
      const before = rowProducts(doc.data())
      if (!before.includes(productId)) continue
      const next = before.filter((id) => id !== productId)
      await doc.ref.set(
        {
          productIds: next,
          productId: next[0] ?? null,
          ...(next.length ? {} : { primary: false }),
          updatedAt: now,
        },
        { merge: true },
      )
      changed++
    }
    return changed
  } catch (error) {
    console.error('[linko] o‘chirilgan mahsulot bog‘lanishi uzilmadi:', error)
    return 0
  }
}

/** Ulanish tekshiruvi — bitta yengil so'rov. */
export async function linkoPing(): Promise<Result> {
  const settings = await readLinkoSettings()
  const body = await linkoGet<{ count?: number }>('products_count/', {}, settings)
  return { ok: true, products: Number(body?.count) || 0 }
}
