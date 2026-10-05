import { adminDb } from './firebase-admin.js'

/**
 * Linko (SFA) External API bilan ishlash.
 *
 * Hujjat: https://{server}.linko.uz/docs/
 *
 * Ikki narsa ajratilgan:
 *   • TOKEN — muhit o'zgaruvchisida (`LINKO_TOKEN`). Bazaga yozilmaydi:
 *     `settings` hujjatlarini tizimga kirgan har bir mijoz o'qiy oladi.
 *   • Qolgan sozlama (manzil, narxlar ro'yxati, sklad) — `settings/linko`
 *     hujjatida, chunki uni admin panel orqali o'zgartirish kerak.
 */
const API_PREFIX = '/api/v1/integration/external-api/'

/** Bir so'rovda API beradigan eng ko'p yozuv. */
const PAGE_SIZE = 1000

/** Bir sinxronlashda o'qiladigan eng ko'p yozuv — cheksiz sikldan himoya. */
const MAX_RECORDS = 20000

export type LinkoSettings = {
  /** `https://nom.linko.uz` ko'rinishida, oxirida `/` siz. */
  baseUrl: string
  /** Qaysi narxlar ro'yxatidan narx olinadi. 0 — tanlanmagan. */
  priceListId: number
  /** Qaysi skladlar qoldig'i hisobga olinadi. Bo'sh — hammasi. */
  stockIds: number[]

  /*
   * ── Buyurtmalarni Linko'ga yuborish ──
   * Linko buyurtmada agent, yetkazuvchi va skladni TALAB qiladi,
   * shuning uchun ular oldindan tanlanadi.
   */
  sendOrders: boolean
  agentId: number
  deliveryManId: number
  /** Buyurtma qaysi sklad hisobidan yoziladi. */
  orderStockId: number
  /** Valyuta (1 — SUM). */
  currencyId: number
  /**
   * Botdan kelgan mijozning Linko'dagi turi («Тип клиента»), masalan
   * «Telegram bot B2C». 0 — ko'rsatilmaydi (Linko o'zi «Розничный» qo'yadi).
   */
  marketTypeId: number
  /** Oxirgi sinxronlash kursorlari (Linko `tm` qiymatlari). */
  lastProductTm: number
  lastPriceTm: number
  lastBalanceTm: number
  lastSyncAt: string | null
  lastReport: string | null
}

export const LINKO_DEFAULTS: LinkoSettings = {
  baseUrl: '',
  priceListId: 0,
  stockIds: [],
  sendOrders: false,
  agentId: 0,
  deliveryManId: 0,
  orderStockId: 0,
  currencyId: 1,
  marketTypeId: 0,
  lastProductTm: 0,
  lastPriceTm: 0,
  lastBalanceTm: 0,
  lastSyncAt: null,
  lastReport: null,
}

export async function readLinkoSettings(): Promise<LinkoSettings> {
  const db = await adminDb()
  const snap = await db.collection('settings').doc('linko').get()
  const data = (snap.data() || {}) as Partial<LinkoSettings>
  return {
    ...LINKO_DEFAULTS,
    ...data,
    // Muhit o'zgaruvchisi zaxira sifatida — hujjat hali yaratilmagan bo'lsa
    baseUrl: String(data.baseUrl || process.env.LINKO_BASE_URL || '').replace(/\/+$/, ''),
    stockIds: Array.isArray(data.stockIds) ? data.stockIds.map(Number).filter(Number.isFinite) : [],
  }
}

export function linkoToken(): string {
  return String(process.env.LINKO_TOKEN || '').trim()
}

export class LinkoError extends Error {
  status: number
  constructor(message: string, status = 0) {
    super(message)
    this.name = 'LinkoError'
    this.status = status
  }
}

/**
 * Bitta GET so'rov.
 *
 * Linko xatolarni ham 200 bilan qaytarmaydi — holat kodi bo'yicha
 * aniq xabar beramiz: admin nima qilish kerakligini bilsin.
 */
export async function linkoGet<T>(
  resource: string,
  params: Record<string, string | number> = {},
  settings?: LinkoSettings,
): Promise<T> {
  const config = settings ?? (await readLinkoSettings())
  const token = linkoToken()
  if (!config.baseUrl) throw new LinkoError('Linko manzili kiritilmagan (Sozlamalar → Linko)')
  if (!token) throw new LinkoError('LINKO_TOKEN muhit o‘zgaruvchisi sozlanmagan')

  const url = new URL(config.baseUrl + API_PREFIX + resource)
  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && value !== undefined && value !== null) url.searchParams.set(key, String(value))
  }

  let response: Response
  try {
    response = await fetch(url, {
      headers: { Authorization: `External ${token}`, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    throw new LinkoError(
      `Linko serveriga ulanib bo‘lmadi: ${error instanceof Error ? error.message : 'tarmoq xatosi'}`,
    )
  }

  if (response.status === 403) {
    const body = (await response.json().catch(() => null)) as { detail?: string } | null
    throw new LinkoError(
      `Linko ruxsat bermadi: ${body?.detail || 'token noto‘g‘ri'}. ` +
        'Tokenni va server manzilini tekshiring yoki Linko yordamidan external-api ni yoqishni so‘rang.',
      403,
    )
  }
  if (!response.ok) {
    throw new LinkoError(`Linko xatosi (${response.status})`, response.status)
  }

  return (await response.json()) as T
}

/**
 * POST so'rov — Linko'ga ma'lumot yuborish (`sync_*` endpointlari).
 *
 * Linko qisman muvaffaqiyatni qaytaradi: `{ results: [...], errors: [...] }`.
 * Shuning uchun javob to'liq qaytariladi, chaqiruvchi `errors` ni o'zi
 * tekshiradi — bittasi o'tmagani qolganini bekor qilmaydi.
 */
export async function linkoPost<T>(
  resource: string,
  body: unknown,
  settings?: LinkoSettings,
): Promise<T> {
  const config = settings ?? (await readLinkoSettings())
  const token = linkoToken()
  if (!config.baseUrl) throw new LinkoError('Linko manzili kiritilmagan (Sozlamalar → Linko)')
  if (!token) throw new LinkoError('LINKO_TOKEN muhit o‘zgaruvchisi sozlanmagan')

  let response: Response
  try {
    response = await fetch(config.baseUrl + API_PREFIX + resource, {
      method: 'POST',
      headers: { Authorization: `External ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (error) {
    throw new LinkoError(
      `Linko serveriga ulanib bo‘lmadi: ${error instanceof Error ? error.message : 'tarmoq xatosi'}`,
    )
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new LinkoError(`Linko rad etdi (${response.status}): ${text.slice(0, 200)}`, response.status)
  }

  return (await response.json()) as T
}

/** `*_count/` endpointlari — jami nechta yozuv borligi. */
export async function linkoCount(resource: string, settings?: LinkoSettings): Promise<number> {
  const body = await linkoGet<{ count?: number }>(`${resource}_count/`, {}, settings)
  return Number(body?.count) || 0
}

/**
 * Hamma sahifani o'qiydi.
 *
 * To'xtash sharti hujjatdagidek: qaytgan yozuvlar soni `limit` dan kam
 * bo'lsa — ma'lumot tugagan. Qo'shimcha `MAX_RECORDS` chegarasi bor,
 * chunki serverless funksiya cheksiz ishlay olmaydi.
 */
export async function linkoList<T>(
  resource: string,
  params: Record<string, string | number> = {},
  settings?: LinkoSettings,
): Promise<T[]> {
  const config = settings ?? (await readLinkoSettings())
  const all: T[] = []

  for (let offset = 0; offset < MAX_RECORDS; offset += PAGE_SIZE) {
    const body = await linkoGet<{ results?: T[] }>(
      resource,
      { ...params, limit: PAGE_SIZE, offset },
      config,
    )
    const rows = Array.isArray(body?.results) ? body.results : []
    all.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }

  return all
}

/** Linko `tm` ni songa aylantiradi — u matn ham, son ham bo'lib keladi. */
export function tmOf(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/* ─── Diagnostika (faqat o'qish) ─────────────────────────────── */

type ProbeResult = { path: string; method: string; status: number; body: unknown }

async function probeOne(
  method: 'GET' | 'OPTIONS',
  path: string,
  config: LinkoSettings,
  limit = 12000,
): Promise<ProbeResult> {
  try {
    const response = await fetch(config.baseUrl + path, {
      method,
      headers: { Authorization: `External ${linkoToken()}`, Accept: 'application/json' },
    })
    const text = await response.text()
    let body: unknown = text.slice(0, limit)
    try {
      body = JSON.parse(text)
    } catch {
      // HTML yoki matn — qisqartirilgan holda qoladi
    }
    const json = JSON.stringify(body)
    if (json.length > limit) body = json.slice(0, limit) + '…'
    return { path, method, status: response.status, body }
  } catch (error) {
    return { path, method, status: 0, body: error instanceof Error ? error.message : 'tarmoq xatosi' }
  }
}

/**
 * Linko qoldiq nega ayirilmayotganini aniqlash uchun — FAQAT O'QISH
 * (GET/OPTIONS). Hech narsa yozmaydi. api/linko-cron.ts `?probe=1`
 * orqali, CRON_SECRET bilan chaqiriladi.
 *
 *   docs      — API hujjati (qaysi maydon qoldiqni ayiradi)
 *   root      — mavjud bo'limlar ro'yxati
 *   syncOrder — sync_order qabul qiladigan maydonlar (OPTIONS)
 *   balance   — mahsulot qoldig'ining XOM qatori (hamma maydonlar)
 *   order     — Linko'dagi buyurtma (bir necha taxminiy manzil)
 */
export async function linkoProbe(params: { product?: string; order?: string; path?: string }) {
  const config = await readLinkoSettings()
  if (!config.baseUrl || !linkoToken()) return { ok: false, error: 'Linko sozlanmagan' }
  const product = Number(params.product) || 0
  const order = Number(params.order) || 0
  const ext = API_PREFIX

  // Ixtiyoriy bitta manzil — faqat Linko API ichida, faqat GET
  if (params.path) {
    const safe = /^[a-z0-9_/-]*(\?[a-z0-9_=&.,-]*)?$/i.test(params.path) && !params.path.includes('..')
    if (!safe) return { ok: false, error: 'Manzil noto‘g‘ri' }
    return { ok: true, result: await probeOne('GET', '/api/v1/integration/' + params.path.replace(/^\/+/, ''), config, 40000) }
  }

  const [docs, root, syncOrder, syncOrderGet] = await Promise.all([
    probeOne('GET', '/api/v1/integration/docs/', config, 40000),
    probeOne('GET', ext, config),
    probeOne('OPTIONS', ext + 'sync_order/', config),
    probeOne('GET', ext + 'sync_order/?limit=2', config),
  ])

  // Mahsulot qoldig'ining xom qatorlari — hamma sahifalardan shu mahsulot
  const balanceRows: unknown[] = []
  let balanceSample: unknown = null
  if (product) {
    for (let offset = 0; offset < MAX_RECORDS; offset += PAGE_SIZE) {
      const page = await probeOne('GET', `${ext}product_balances/?limit=${PAGE_SIZE}&offset=${offset}`, config, 5_000_000)
      const rows = ((page.body as { results?: { product?: { id?: number } }[] })?.results) ?? []
      if (!balanceSample && rows[0]) balanceSample = rows[0]
      balanceRows.push(...rows.filter((r) => Number(r?.product?.id) === product))
      if (rows.length < PAGE_SIZE) break
    }
  }

  /*
   * Oxirgi kunlardagi buyurtmalar (`last_tm` bo'yicha): bizning (service_id
   * «ta-») buyurtmalarimiz va taqqoslash uchun agentlar kiritgan oddiy
   * buyurtmalardan bir nechtasi — qaysi maydon farq qilishini ko'rish uchun.
   */
  const since = Math.floor(Date.now() / 1000) - 3 * 86400
  const ourOrders: unknown[] = []
  const agentOrders: unknown[] = []
  let scanned = 0
  for (let offset = 0; offset < MAX_RECORDS && (order || ourOrders.length < 10); offset += PAGE_SIZE) {
    const page = await probeOne('GET', `${ext}orders/?last_tm=${since}&limit=${PAGE_SIZE}&offset=${offset}`, config, 50_000_000)
    const rows = ((page.body as { results?: { id?: number; service_id?: string | null; status?: string }[] })?.results) ?? []
    scanned += rows.length
    for (const row of rows) {
      const mine = String(row.service_id ?? '').startsWith('ta-') || (order && row.id === order)
      if (mine) ourOrders.push(row)
      else if (agentOrders.length < 3 && (row.status === 'delivered' || row.status === 'given')) agentOrders.push(row)
    }
    if (rows.length < PAGE_SIZE) break
  }

  return {
    ok: true, docs, root, syncOrder, syncOrderGet, balanceSample, balanceRows,
    orders: { since, scanned, ours: ourOrders.slice(-10), agents: agentOrders },
  }
}
