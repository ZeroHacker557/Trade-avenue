import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

/**
 * WLCM (Octagram / Paylov) — onlayn to'lov agregatori.
 *
 * Bitta ulanish orqali Click, Payme, Uzum va Paylov. Hujjat:
 * https://docs.wlcm.uz (sandbox: https://sandbox.wlcm.uz/api/v1).
 *
 * Kalitlar faqat muhit o'zgaruvchilarida (Vercel → Settings → Environment):
 *   WLCM_BASE_URL        — https://apidev.wlcm.uz/api/v1 (sandbox) yoki ishchi manzil
 *   WLCM_API_KEY         — onboarding orqali olingan kalit
 *   WLCM_API_SECRET      — maxfiy kalit (HMAC imzo uchun)
 *   WLCM_WEBHOOK_SECRET  — webhook imzosi kaliti. Uni BIZ tanlaymiz va webhook
 *                          ro'yxatdan o'tkazilganda (`registerWebhook`) WLCM'ga
 *                          beramiz; berilmasa API_SECRET.
 *
 * Har so'rov HMAC-SHA256 bilan imzolanadi:
 *   METHOD \n KANONIK_YO'L \n TIMESTAMP_MS \n SHA256(body)
 * Kanonik yo'l — URL'ning to'liq path qismi (`/api/v1/integrations/...`),
 * query bo'lsa saralangan holda qo'shiladi. Timestamp 300 soniyadan eski
 * bo'lsa server rad etadi.
 */

/**
 * To'lov usullari. `card` — Uzcard/Humo karta raqami ilovaning o'zida
 * kiritiladi va SMS kod bilan tasdiqlanadi (createCardCheckout + confirmCard).
 */
export const WLCM_PROVIDERS = ['click', 'payme', 'uzum', 'paylov', 'card'] as const
export type WlcmProvider = (typeof WLCM_PROVIDERS)[number]

/** To'lov holatlari (docs.wlcm.uz/states). */
export const WLCM_STATE = {
  CREATED: 0,
  INITIATING: 1,
  SUCCESS: 2,
  CANCELLED_BEFORE_PAYMENT: -1,
  CANCELLED: -2,
} as const

type Config = { base: string; key: string; secret: string; webhookSecret: string }

function config(): Config | null {
  const base = String(process.env.WLCM_BASE_URL || '').replace(/\/+$/, '')
  const key = String(process.env.WLCM_API_KEY || '')
  const secret = String(process.env.WLCM_API_SECRET || '')
  if (!base || !key || !secret) return null
  return { base, key, secret, webhookSecret: String(process.env.WLCM_WEBHOOK_SECRET || '') || secret }
}

/** Kalitlar sozlanganmi — sozlanmagan bo'lsa onlayn to'lov o'chiq turadi. */
export function wlcmConfigured(): boolean {
  return config() !== null
}

export class WlcmError extends Error {
  readonly status: number
  readonly body: unknown
  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.status = status
    this.body = body
  }
}

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex')

/** Saralangan va kodlangan query bilan yo'l — imzo shu satrdan olinadi. */
export function canonicalPath(url: URL): string {
  const params = [...url.searchParams.entries()].sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)))
  const query = new URLSearchParams(params).toString()
  return query ? `${url.pathname}?${query}` : url.pathname
}

export function signRequest(secret: string, method: string, path: string, timestamp: string, body: string): string {
  const message = `${method.toUpperCase()}\n${path}\n${timestamp}\n${sha256(body)}`
  // Kalit — maxfiy kalitning O'ZI (uning sha256 xeshi emas)
  return createHmac('sha256', secret).update(message).digest('hex')
}

/**
 * Imzolangan so'rov. `path` — bazadan keyingi qism (`/integrations/checkout`).
 * User-Agent ataylab: ularning Cloudflare'i standart «bot» belgilarini
 * bloklaydi (sinovda 403 / 1010).
 */
async function request<T>(method: 'GET' | 'POST' | 'PATCH', path: string, payload?: unknown): Promise<T> {
  const cfg = config()
  if (!cfg) throw new WlcmError('WLCM kalitlari sozlanmagan', 0, null)

  const url = new URL(cfg.base + path)
  const body = payload === undefined ? '' : JSON.stringify(payload)
  const timestamp = String(Date.now())
  const signature = signRequest(cfg.secret, method, canonicalPath(url), timestamp, body)

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'musa-shop/1.0',
      'X-API-Key': cfg.key,
      'X-Timestamp': timestamp,
      'X-Signature': signature,
    },
    ...(method !== 'GET' ? { body } : {}),
    signal: AbortSignal.timeout(15_000),
  })

  const text = await response.text()
  let data: unknown
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!response.ok) {
    const detail = (data as { detail?: unknown; message?: unknown } | null)?.detail
      ?? (data as { message?: unknown } | null)?.message
      ?? text.slice(0, 200)
    throw new WlcmError(`WLCM ${response.status}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`, response.status, data)
  }
  return data as T
}

export type Checkout = { orderId: number | null; checkoutUrl: string | null; state: number; externalId: string }

/**
 * To'lov yaratadi va mijoz ochadigan sahifa havolasini qaytaradi.
 * `amountSum` — so'mda; API tiyinda kutadi (×100).
 */
export async function createCheckout(input: {
  externalId: string
  amountSum: number
  provider: WlcmProvider
  returnUrl: string
}): Promise<Checkout> {
  const data = await request<{
    order_id?: number
    external_id?: string
    state?: number
    checkout_url?: string | null
    message?: string | null
  }>('POST', '/integrations/checkout', {
    external_id: input.externalId,
    amount: Math.round(input.amountSum * 100),
    payment_provider: input.provider,
    return_url: input.returnUrl,
  })
  return {
    orderId: typeof data?.order_id === 'number' ? data.order_id : null,
    checkoutUrl: data?.checkout_url || null,
    state: Number(data?.state ?? 0),
    externalId: String(data?.external_id || input.externalId),
  }
}

export type CardCheckout = {
  orderId: number | null
  externalId: string
  state: number
  transactionId: string
  cid: string
  /** Kod yuborilgan raqam — yulduzchali (+9989*****67). */
  otpPhone: string | null
}

/**
 * Karta bilan to'lov: karta raqami va muddati (YYMM, masalan 2909 — 2029-yil
 * sentyabr; sandbox'da tekshirildi) yuboriladi, egasiga SMS kod ketadi.
 *
 * MUHIM: karta ma'lumoti hech qayerga yozilmaydi va xatoga qo'shilmaydi —
 * WLCM'ning 422 javobi kiritilgan qiymatlarni qaytaradi, shuning uchun xato
 * matni bu yerda umumiy qilib almashtiriladi.
 */
export async function createCardCheckout(input: {
  externalId: string
  amountSum: number
  cardNumber: string
  expireYYMM: string
  returnUrl: string
}): Promise<CardCheckout> {
  let data: {
    order_id?: number
    external_id?: string
    state?: number
    transaction_id?: string | null
    cid?: string | null
    otp_sent_phone?: string | null
  }
  try {
    data = await request('POST', '/integrations/checkout', {
      external_id: input.externalId,
      amount: Math.round(input.amountSum * 100),
      payment_provider: 'card',
      card_number: input.cardNumber,
      expire_date: input.expireYYMM,
      return_url: input.returnUrl,
    })
  } catch (error) {
    const status = error instanceof WlcmError ? error.status : 0
    const detail = error instanceof WlcmError ? (error.body as { detail?: unknown } | null)?.detail : null
    // Faqat raqamsiz qisqa matn qoladi — karta raqami xatoga tushmasin
    const safe = typeof detail === 'string' && !/\d{4}/.test(detail) ? detail.slice(0, 120) : 'card_rejected'
    throw new WlcmError(`WLCM ${status}: ${safe}`, status, { detail: safe })
  }
  if (!data?.transaction_id || !data?.cid) throw new WlcmError('WLCM: karta sessiyasi ochilmadi', 0, null)
  return {
    orderId: typeof data.order_id === 'number' ? data.order_id : null,
    externalId: String(data.external_id || input.externalId),
    state: Number(data.state ?? 0),
    transactionId: String(data.transaction_id),
    cid: String(data.cid),
    otpPhone: data.otp_sent_phone ? String(data.otp_sent_phone) : null,
  }
}

/**
 * SMS kodni tasdiqlash. `alreadyPaid` — oldin tasdiqlangan (takroriy bosish).
 * Noto'g'ri yoki eskirgan kod — `invalid_otp` (400).
 */
export async function confirmCard(input: { transactionId: string; cid: string; otp: string }): Promise<{ success: boolean; alreadyPaid: boolean }> {
  const data = await request<{ success?: boolean; message?: string | null }>('POST', '/integrations/payment/card/confirm', {
    transaction_id: input.transactionId,
    cid: input.cid,
    otp: input.otp,
  })
  return { success: data?.success === true, alreadyPaid: data?.message === 'Already paid' }
}

/** Hamkor ma'lumoti — kalitlar ishlayotganini tekshirish uchun. */
export async function wlcmMe(): Promise<unknown> {
  // Hujjatda ikki xil yo'l ko'rsatilgan — ikkalasini sinaymiz
  try {
    return await request('GET', '/partners/me')
  } catch (error) {
    if (error instanceof WlcmError && error.status === 404) return request('GET', '/integrations/me')
    throw error
  }
}

/* ─── Kalitsiz endpointlar ──────────────────────────────────── */

async function publicGet<T>(path: string): Promise<T> {
  const cfg = config()
  const base = cfg?.base || String(process.env.WLCM_BASE_URL || '').replace(/\/+$/, '')
  if (!base) throw new WlcmError('WLCM_BASE_URL sozlanmagan', 0, null)
  const response = await fetch(base + path, {
    headers: { Accept: 'application/json', 'User-Agent': 'musa-shop/1.0' },
    signal: AbortSignal.timeout(10_000),
  })
  const text = await response.text()
  let data: unknown
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!response.ok) throw new WlcmError(`WLCM ${response.status}`, response.status, data)
  return data as T
}

/** Hamkor uchun hozir yoqilgan to'lov usullari (nomlari kichik harfda). */
export async function activeProviders(): Promise<string[]> {
  const list = await publicGet<{ name?: string; is_active?: boolean }[]>('/payments/providers')
  return (Array.isArray(list) ? list : [])
    .filter((p) => p?.is_active)
    .map((p) => String(p.name || '').toLowerCase())
}

export type WlcmOrderStatus = { state: number; isPaid: boolean; isCancelled: boolean; amount: number | null }

/**
 * To'lov holati — WLCM'dagi buyurtma id'si bo'yicha (checkout javobidagi `order_id`).
 * Webhook kelmay qolsa yoki kechiksa shu bilan tekshiramiz.
 */
export async function orderStatus(wlcmOrderId: number): Promise<WlcmOrderStatus> {
  const data = await publicGet<{
    state?: number | string
    is_paid?: boolean
    is_cancelled?: boolean
    amount?: number | string
    status_explanation?: { state?: number | string }
  }>(`/orders/${encodeURIComponent(String(wlcmOrderId))}/status`)
  // Summa so'mda keladi (sandbox'da tekshirildi: 100000 tiyinlik to'lov → 1000.0).
  // Holat raqami to'langanda faqat `status_explanation.state` da bo'ladi.
  const amount = Number(data?.amount)
  return {
    state: Number(data?.state ?? data?.status_explanation?.state ?? 0),
    isPaid: data?.is_paid === true,
    isCancelled: data?.is_cancelled === true,
    amount: Number.isFinite(amount) ? amount : null,
  }
}

/* ─── Webhook ro'yxati ────────────────────────────────────────── */

export type WlcmWebhook = { id: number; url: string; is_active?: boolean }

export async function listWebhooks(): Promise<WlcmWebhook[]> {
  const data = await request<WlcmWebhook[] | { results?: WlcmWebhook[] }>('GET', '/partners/me/webhooks')
  return Array.isArray(data) ? data : (data?.results ?? [])
}

/** Webhook manzilini imzo siri bilan ro'yxatdan o'tkazadi (bor bo'lsa — yangilaydi). */
export async function registerWebhook(url: string, secret: string): Promise<WlcmWebhook> {
  const existing = (await listWebhooks()).find((w) => w.url === url)
  if (existing) {
    return request<WlcmWebhook>('PATCH', `/partners/me/webhooks/${existing.id}`, { url, secret_key: secret, is_active: true })
  }
  return request<WlcmWebhook>('POST', '/partners/me/webhooks', { url, secret_key: secret })
}

export type FiscalItem = { title: string; price: number; count: number; code?: string; package_code?: string }

/** Soliq cheki (OFD). Standart holatda chekni wlcm o'zi shakllantiradi. */
export async function registerFiscal(externalId: string, items: FiscalItem[]): Promise<unknown> {
  return request('POST', '/fiscalization/register', { external_id: externalId, items })
}

export type WebhookPayload = {
  external_id?: string
  order_id?: string | number
  payment_id?: string | number
  amount?: string | number
  state?: string | number
  provider?: string
  timestamp?: string | number
  signature?: string
}

/**
 * `{order_id}:{payment_id}:{state}:{timestamp}` ning HMAC-SHA256 imzosi.
 * Imzo tanada (`signature`) va `X-Webhook-Signature` sarlavhasida keladi.
 */
export function verifyWebhook(payload: WebhookPayload, headerSignature?: string): boolean {
  const cfg = config()
  const received = typeof payload?.signature === 'string' && payload.signature ? payload.signature : headerSignature
  if (!cfg || !received) return false
  const message = `${payload.order_id}:${payload.payment_id}:${payload.state}:${payload.timestamp}`
  const expected = createHmac('sha256', cfg.webhookSecret).update(message).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(String(received).trim().toLowerCase())
  return a.length === b.length && timingSafeEqual(a, b)
}
