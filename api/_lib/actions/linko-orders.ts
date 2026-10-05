import { adminDb } from '../firebase-admin.js'
import { linkoGet, linkoPost, linkoToken, readLinkoSettings, type LinkoSettings } from '../linko.js'
import { isCashPayment } from '../pay-method.js'
import { orderLabel } from '../order-number.js'

/**
 * Buyurtmalarni Linko'ga yuborish.
 *
 * Yo'nalish katalogникiga TESKARI: katalog Linko'dan olinadi, buyurtma
 * esa Linko'ga yuboriladi. Ikkalasi bitta faylda bo'lsa chalkashardi,
 * shuning uchun alohida modul.
 *
 * Nima yuboriladi:
 *   1. MIJOZ — Linko'da «market» (savdo nuqtasi) bo'lib yoziladi.
 *      Telegram id si `service_id` bo'ladi: bir mijoz ikki marta
 *      yaratilmaydi, ma'lumoti esa har buyurtmada yangilanadi.
 *   2. BUYURTMA — mahsulotlar, narx, miqdor, to'lov turi va holati.
 *
 * Xato bo'lsa buyurtma YO'QOLMAYDI: sabab buyurtma hujjatiga yoziladi
 * (`linko.error`) va admin panelda qayta yuborish mumkin.
 */

type Result = Record<string, unknown>

type OrderProduct = {
  product?: { id?: number | string; name?: string; price?: number; originalPrice?: number; pack?: number }
  quantity?: number
}

type OrderDoc = {
  orderNumber?: string
  /** Toshkent sanasi — chek raqami har kuni #0001 dan boshlanadi. */
  orderDay?: string
  status?: string
  userId?: number
  total?: number
  paymentMethod?: string
  createdAt?: string
  products?: OrderProduct[]
  customer?: {
    name?: string
    phone?: string
    address?: string
    comment?: string
    location?: { lat: number; lng: number } | null
  }
  linko?: { orderId?: number; marketId?: number }
}

/**
 * MUSA holati → Linko holati.
 *
 * Linko to'rtta qiymatni qabul qiladi: `not_delivered`, `given`,
 * `delivered`, `cancelled`. Bizdagi «Yangi» va «Qabul qilindi» hali
 * yo'lga chiqmagan, shuning uchun ikkalasi ham `not_delivered`.
 */
const STATUS: Record<string, string> = {
  'Yangi': 'not_delivered',
  'Qabul qilindi': 'not_delivered',
  'Yetkazilmoqda': 'given',
  'Yetkazildi': 'delivered',
  'Bekor qilingan': 'cancelled',
  'Rad etildi': 'cancelled',
}

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** `2026-09-22` — Linko sanani shu ko'rinishda kutadi. */
function dateOnly(value?: string): string {
  const time = Date.parse(String(value || ''))
  return new Date(Number.isNaN(time) ? Date.now() : time).toISOString().slice(0, 10)
}

/** Sozlama to'liq bo'lmasa buyurtma yuborilmaydi — sababini aytamiz. */
function missingSetting(settings: LinkoSettings): string | null {
  if (!settings.sendOrders) return null
  if (!settings.baseUrl) return 'Linko manzili kiritilmagan'
  if (!linkoToken()) return 'LINKO_TOKEN sozlanmagan'
  if (!settings.agentId) return 'Agent tanlanmagan (Sozlamalar → Linko)'
  // Yetkazuvchi ixtiyoriy — buyurtma agentga tushadi (Abubakr talabi, 2026-09-25)
  if (!settings.orderStockId) return 'Sklad tanlanmagan (Sozlamalar → Linko)'
  return null
}

/**
 * Do'kon mahsuloti → Linko pozitsiyasi.
 *
 * Bitta mahsulotga bir nechta pozitsiya bog'langan bo'lishi mumkin
 * (ta'mlar). Buyurtmada bittasini ko'rsatish kerak — narx manbasi
 * bo'lgan «asosiy» pozitsiya olinadi, u bo'lmasa birinchisi.
 */
async function linkoProductId(productId: string): Promise<number | null> {
  const db = await adminDb()
  const snap = await db
    .collection('linko_products')
    .where('productIds', 'array-contains', productId)
    .get()
  if (snap.empty) return null

  const rows = snap.docs.map((doc) => doc.data() as { linkoId?: number; primary?: boolean })
  const primary = rows.find((row) => row.primary)
  return num((primary ?? rows[0]).linkoId) || null
}

/** Mijozni Linko'da «market» sifatida yaratadi yoki yangilaydi. */
async function syncMarket(
  order: OrderDoc,
  settings: LinkoSettings,
): Promise<{ id: number | null; serviceId: string }> {
  const customer = order.customer ?? {}
  const serviceId = `musa-${order.userId ?? 'mehmon'}`

  const payload = [{
    service_id: serviceId,
    name: text(customer.name) || `Telegram mijoz ${order.userId ?? ''}`.trim(),
    is_confirmed: true,
    phone: text(customer.phone),
    address: text(customer.address),
    ...(customer.location
      ? { location: { lat: customer.location.lat, lon: customer.location.lng } }
      : {}),
    ...(settings.agentId ? { responsible_agent: { linko_id: settings.agentId } } : {}),
    ...(settings.priceListId ? { price_list: { linko_id: settings.priceListId } } : {}),
    // Mijoz turi («Telegram bot B2C») — mavjud mijozda ham keyingi buyurtmada yangilanadi
    ...(settings.marketTypeId ? { market_type: { linko_id: settings.marketTypeId } } : {}),
  }]

  const body = await linkoPost<{ results?: { id?: number }[]; errors?: unknown[] }>(
    'sync_market/', payload, settings,
  )
  if (body.errors?.length) {
    throw new Error(`Mijoz yozilmadi: ${JSON.stringify(body.errors).slice(0, 200)}`)
  }
  return { id: num(body.results?.[0]?.id) || null, serviceId }
}

/**
 * Buyurtmani Linko'ga yuboradi (yangi bo'lsa yaratadi, bor bo'lsa
 * holatini yangilaydi) va natijani buyurtma hujjatiga yozadi.
 */
export async function pushOrder(orderId: string, order: OrderDoc): Promise<Result> {
  const settings = await readLinkoSettings()
  if (!settings.sendOrders) return { ok: false, skipped: 'sendOrders' }

  /*
   * Onlayn to'lov: to'lanmagan buyurtma hali buyurtma emas. To'lov
   * kutilayotganda yoki to'lanmay bekor bo'lganda Linko'ga yubormaymiz
   * (u yerda yaratilmagan bo'lsa — keyin ham kerak emas).
   */
  const unpaidOnline = (order as { paymentMethod?: string }).paymentMethod === 'Onlayn'
    && !(order as { paidAt?: string }).paidAt
  if (unpaidOnline && !order.linko?.orderId) return { ok: false, skipped: 'unpaid' }

  const db = await adminDb()
  const save = (data: Record<string, unknown>) =>
    db.collection('orders').doc(orderId).set({ linko: data }, { merge: true })

  const problem = missingSetting(settings)
  if (problem) {
    await save({ error: problem, at: new Date().toISOString() })
    return { ok: false, error: problem }
  }

  try {
    // ── Mahsulotlar ──
    const lines: Record<string, unknown>[] = []
    const skipped: string[] = []

    for (const item of order.products ?? []) {
      const productId = String(item.product?.id ?? '')
      const amount = num(item.quantity, 1)
      if (!productId || amount <= 0) continue

      const linkoId = await linkoProductId(productId)
      if (!linkoId) {
        skipped.push(text(item.product?.name) || productId)
        continue
      }

      // O'ram: Linko'da hammasi DONADA — miqdor ×pack, narx ÷pack
      const pack = Math.max(1, Math.floor(num(item.product?.pack, 1)))
      const price = Math.round(num(item.product?.price) / pack)
      lines.push({
        product: { linko_id: linkoId },
        price,
        /*
         * `origin_price` hujjatda ixtiyoriy deb yozilgan, lekin API uni
         * TALAB qiladi (sinovda: «origin_price: This field is required»).
         * Aksiya bo'lmasa — sotuv narxining o'zi.
         */
        origin_price: Math.round(num(item.product?.originalPrice, num(item.product?.price)) / pack),
        amount: amount * pack,
      })
    }

    if (!lines.length) {
      const error = 'Buyurtmadagi mahsulotlar Linko bilan bog‘lanmagan'
      await save({ error, skipped, at: new Date().toISOString() })
      return { ok: false, error }
    }

    // ── Mijoz ──
    const market = await syncMarket(order, settings)

    // ── Buyurtma ──
    const cash = isCashPayment(text(order.paymentMethod))
    const payload = [{
      service_id: `musa-${orderId}`,
      ...(order.linko?.orderId ? { linko_id: order.linko.orderId } : {}),
      payment_type: cash ? 'cash' : 'bank',
      // Karta orqali to'lov Linko'da alohida nom bilan ko'rinadi
      custom_payment_type: cash ? 'cash' : 'karta',
      status: STATUS[text(order.status)] ?? 'not_delivered',
      comment: text(order.customer?.comment),
      date_delivery: dateOnly(order.createdAt),
      market: market.id ? { linko_id: market.id } : { service_id: market.serviceId },
      stock: { linko_id: settings.orderStockId },
      agent: { linko_id: settings.agentId },
      ...(settings.deliveryManId ? { delivery_man: { linko_id: settings.deliveryManId } } : {}),
      ...(settings.priceListId ? { price_list: { linko_id: settings.priceListId } } : {}),
      ...(settings.currencyId ? { linko_currency_id: settings.currencyId } : {}),
      // Chek raqami har kuni #0001 dan boshlanadi — Linko'da sana bilan
      service_order_number: order.orderDay
        ? `${text(order.orderNumber)} · ${text(order.orderDay).split('-').reverse().join('.')}`
        : text(order.orderNumber) || orderId,
      products: lines,
    }]

    const body = await linkoPost<{ results?: { id?: number }[]; errors?: unknown[] }>(
      'sync_order/', payload, settings,
    )
    if (body.errors?.length) {
      const raw = JSON.stringify(body.errors)
      // Linko yetkazuvchini talab qilsa — admin nima qilishni bilsin
      const error = /delivery_man/i.test(raw) && !settings.deliveryManId
        ? 'Linko yetkazuvchini talab qilyapti — Linko sozlamasida yetkazuvchi majburiy bo‘lmasligi kerak'
        : `Linko qabul qilmadi: ${raw.slice(0, 300)}`
      await save({ error, at: new Date().toISOString() })
      return { ok: false, error }
    }

    const linkoOrderId = num(body.results?.[0]?.id) || order.linko?.orderId || null
    await save({
      orderId: linkoOrderId,
      marketId: market.id,
      status: STATUS[text(order.status)] ?? 'not_delivered',
      syncedAt: new Date().toISOString(),
      ...(skipped.length ? { skipped } : {}),
      error: null,
    })
    return { ok: true, linkoOrderId, marketId: market.id, skipped }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Noma’lum xato'
    await save({ error: message, at: new Date().toISOString() })
    console.error('[linko] buyurtma yuborilmadi:', message)
    return { ok: false, error: message }
  }
}

/**
 * Buyurtma yaratilganda yoki holati o'zgarganda chaqiriladi.
 *
 * Xato tashlamaydi — Linko ishlamayotgani do'kondagi buyurtmani
 * to'xtatib qo'ymasligi kerak.
 */
export async function pushOrderSafe(orderId: string, order: OrderDoc): Promise<void> {
  try {
    await pushOrder(orderId, order)
  } catch (error) {
    console.error('[linko] buyurtma yuborishda kutilmagan xato:', error)
  }
}

/**
 * Bitta buyurtmani Linko'ga yuboradi.
 *
 * Kuryer botdagi «Oldim»/«Yetkazdim» tugmasini bosganda holat
 * Firestore'ga TO'G'RIDAN-TO'G'RI yoziladi (ikki kuryer bir buyurtmani
 * olib qo'ymasligi uchun atomar tranzaksiya kerak). Shu sababli u yo'l
 * `order.status` amalidan o'tmaydi va Linko'ga xabar bormay qolardi —
 * bot shu amalni alohida chaqiradi.
 */
export async function linkoPushOrder(_staff: unknown, body: Record<string, unknown>): Promise<Result> {
  const orderId = text(body.orderId)
  if (!orderId) throw new Error('orderId kerak')

  const db = await adminDb()
  const snap = await db.collection('orders').doc(orderId).get()
  if (!snap.exists) throw new Error('Buyurtma topilmadi')

  return pushOrder(orderId, snap.data() as OrderDoc)
}

/**
 * Yuborilmay qolganlarini qayta yuboradi — admin paneldagi tugma.
 *
 * Linko o'chiq bo'lgan yoki sozlama to'liq bo'lmagan paytdagi
 * buyurtmalar shu tariqa tiklanadi.
 */
/**
 * Botdan kelgan ESKI mijozlarning turini bir martada yangilaydi (sozlamadagi
 * `marketTypeId`, masalan «Telegram bot B2C»).
 *
 * Faqat tur o'zgaradi. Linko ismni majburiy talab qiladi, shuning uchun
 * mijozning Linko'dagi HOZIRGI ismi o'qib olinadi va o'zgarmasdan qaytadi
 * (qo'lda o'zgartirilgan nom ustidan yozilmasin). Agent, narx ro'yxati,
 * manzil yuborilmaydi. Mijozlar — Linko'ga tushgan buyurtmalardagi
 * `userId` lar (`service_id: musa-<id>`); Linko'da ular buyurtmadagi ism
 * bo'yicha qidiriladi va `service_id` bilan aniq ajratiladi.
 * `userId` berilsa — faqat o'sha mijoz (sinov uchun).
 */
export async function linkoSyncMarketTypes(body: Record<string, unknown> = {}): Promise<Result> {
  const settings = await readLinkoSettings()
  if (!settings.marketTypeId) return { ok: false, error: 'Mijoz turi (marketTypeId) sozlanmagan' }

  const db = await adminDb()
  const snap = await db.collection('orders').where('linko.marketId', '>', 0).get()
  const only = text(String(body.userId ?? ''))

  // Mijoz → buyurtmalardagi ismlari (qidiruv uchun)
  const names = new Map<string, Set<string>>()
  for (const doc of snap.docs) {
    const data = doc.data() as OrderDoc
    const id = String(data.userId ?? '')
    if (!id || (only && id !== only)) continue
    const set = names.get(id) ?? new Set<string>()
    const name = text(data.customer?.name)
    if (name) set.add(name)
    names.set(id, set)
  }

  type MarketRow = {
    id?: number
    name?: string
    service_id?: string | null
    market_type?: { id?: number } | null
    market_phones?: { phone?: string }[]
    address?: string | null
    location?: { lat?: number; lon?: number } | null
    responsible_agent?: { id?: number } | null
  }
  let updated = 0
  let already = 0
  const notFound: string[] = []
  const errors: string[] = []

  for (const [id, candidates] of names) {
    const serviceId = `musa-${id}`
    let row: MarketRow | undefined
    for (const name of candidates) {
      const res = await linkoGet<{ results?: MarketRow[] }>('markets/', { search: name, limit: 50 }, settings)
      row = res.results?.find((m) => m.service_id === serviceId)
      if (row) break
    }
    if (!row?.name) {
      notFound.push(id)
      continue
    }
    if (row.market_type?.id === settings.marketTypeId) {
      already++
      continue
    }
    try {
      /*
       * Linko qisqa so'rovni («ism + tur») «Ошибка сервера» bilan rad etadi —
       * shuning uchun mijozning Linko'dagi HOZIRGI qiymatlari o'zgarmasdan
       * qaytariladi, faqat tur yangi.
       */
      const phone = row.market_phones?.find((p) => p?.phone)?.phone
      const res = await linkoPost<{ results?: unknown[]; errors?: unknown[] }>('sync_market/', [{
        service_id: serviceId,
        name: row.name,
        is_confirmed: true,
        ...(phone ? { phone } : {}),
        ...(row.address ? { address: row.address } : {}),
        ...(row.location?.lat != null && row.location?.lon != null
          ? { location: { lat: row.location.lat, lon: row.location.lon } }
          : {}),
        ...(row.responsible_agent?.id ? { responsible_agent: { linko_id: row.responsible_agent.id } } : {}),
        ...(settings.priceListId ? { price_list: { linko_id: settings.priceListId } } : {}),
        market_type: { linko_id: settings.marketTypeId },
      }], settings)
      if (res.errors?.length) errors.push(`${id}: ${JSON.stringify(res.errors).slice(0, 200)}`)
      else updated++
    } catch (error) {
      errors.push(`${id}: ${error instanceof Error ? error.message.slice(0, 200) : 'xato'}`)
    }
  }
  return { ok: errors.length === 0, users: names.size, updated, already, notFound, errors: errors.slice(0, 5) }
}

export async function linkoPushOrders(_staff: unknown, body: Record<string, unknown>): Promise<Result> {
  const settings = await readLinkoSettings()
  if (!settings.sendOrders) return { ok: true, skipped: 'sendOrders', sent: 0, failed: 0 }
  const days = Math.min(90, Math.max(1, Math.round(num(body.days, 7))))
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const db = await adminDb()
  const snap = await db.collection('orders').where('createdAt', '>=', since).get()

  let sent = 0
  let failed = 0
  let skipped = 0
  const errors: string[] = []

  for (const doc of snap.docs) {
    const order = doc.data() as OrderDoc
    // Allaqachon yuborilgan va holati o'zgarmaganlarini qayta yubormaymiz
    const already = order.linko?.orderId
    const sameStatus = (order.linko as { status?: string } | undefined)?.status ===
      (STATUS[text(order.status)] ?? 'not_delivered')
    if (already && sameStatus) {
      skipped++
      continue
    }

    const result = await pushOrder(doc.id, order)
    if (result.ok) sent++
    else if (result.skipped) skipped++
    else {
      failed++
      errors.push(`${orderLabel(order, doc.id)}: ${String(result.error || '').slice(0, 120)}`)
    }
  }

  const summary = { at: new Date().toISOString(), sent, failed, skipped, checked: snap.size, errors: errors.slice(0, 5) }
  // Panel «Avtomatik yuborish» kartasida oxirgi natija ko'rinadi
  await db.collection('settings').doc('linko').set({ lastOrderPush: summary }, { merge: true })
  return { ok: true, ...summary, days }
}
