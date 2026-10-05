import { adminDb } from '../firebase-admin.js'
import { escapeHtml, sendMessage } from '../telegram.js'
import { userLang } from '../i18n.js'
import { restoreStock } from '../stock.js'
import { orderLabel } from '../order-number.js'
import {
  WLCM_PROVIDERS, WLCM_STATE, WlcmError, activeProviders, confirmCard, createCardCheckout, createCheckout,
  orderStatus as wlcmOrderStatus, verifyWebhook, wlcmConfigured, type WebhookPayload, type WlcmProvider,
} from '../wlcm.js'
import { CodedError } from '../errors.js'
import {
  AWAITING_PAYMENT, adminTargets, applyStatusEffects, bumpOrdersSignal, notifyNewOrder,
  sendLiveStatus, type OrderDoc,
} from './orders.js'
import { pushOrderSafe } from './linko-orders.js'

/**
 * Onlayn to'lov (WLCM) — buyurtma hayot yo'li:
 *
 *   1. api/orders.ts buyurtmani «To'lov kutilmoqda» holatida yaratadi
 *      (qoldiq band qilinadi, xodimlarga hali xabar bormaydi) va
 *      `startPayment` to'lov sahifasini ochadi.
 *   2. Mijoz Click / Payme / Uzum da to'laydi.
 *   3. WLCM webhook yuboradi (api/payment.ts → `handleWebhook`):
 *        muvaffaqiyat → «Yangi», odatdagi oqim (admin, kuryer, Linko);
 *        to'lanmay bekor → «Bekor qilingan», qoldiq qaytadi.
 *   4. Webhook kechiksa — ilova kutish oynasidan `checkPayment` holatni
 *      WLCM'dan o'zi so'raydi; umuman kelmasa `expireUnpaidOrders` (cron)
 *      bekor qilishdan oldin yana bir bor tekshiradi.
 *   Uchalasi ham bitta joyda — `applyPaymentState`.
 */

/** Shuncha daqiqada to'lanmagan buyurtma bekor qilinadi. */
export const PAYMENT_TTL_MIN = 45

export type PaymentInfo = {
  provider: WlcmProvider
  externalId: string
  wlcmOrderId: number | null
  checkoutUrl: string | null
  state: number
  attempts: number
  createdAt: string
  paymentId?: string | null
  updatedAt?: string
  /** Karta bilan to'lovda: SMS kodni tasdiqlash uchun (karta raqamining o'zi saqlanmaydi). */
  transactionId?: string
  cid?: string
  otpPhone?: string | null
  /** «8600 •••• •••• 7878» — faqat oxirgi 4 raqam. */
  cardMask?: string
  cardType?: 'uzcard' | 'humo' | 'card'
}

/** Mijoz kiritgan karta — faqat so'rov davomida xotirada, hech qayerga yozilmaydi. */
export type CardInput = { number: string; expiry: string }

/**
 * Karta ma'lumotini tekshiradi va WLCM formatiga keltiradi.
 * Mijoz muddatni «OO/YY» (09/29) kiritadi, WLCM «YYOO» (2909) kutadi.
 */
export function readCard(value: unknown): { number: string; expireYYMM: string; mask: string; type: 'uzcard' | 'humo' | 'card' } | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const number = String(raw.number ?? '').replace(/\D/g, '')
  const expiry = String(raw.expiry ?? '').replace(/\D/g, '')
  if (!/^\d{16}$/.test(number)) return null
  if (!/^\d{4}$/.test(expiry)) return null
  const month = Number(expiry.slice(0, 2))
  if (month < 1 || month > 12) return null
  const type = number.startsWith('9860') ? 'humo' : /^(8600|5614)/.test(number) ? 'uzcard' : 'card'
  return {
    number,
    expireYYMM: expiry.slice(2) + expiry.slice(0, 2),
    mask: `${number.slice(0, 4)} •••• •••• ${number.slice(-4)}`,
    type,
  }
}

type PayOrder = OrderDoc & {
  paymentMethod?: string
  paymentStatus?: string | null
  paidAt?: string
  payment?: PaymentInfo
  total?: number
  createdAt?: string
}

export function readProvider(value: unknown): WlcmProvider | null {
  const v = String(value || '').toLowerCase()
  return (WLCM_PROVIDERS as readonly string[]).includes(v) ? (v as WlcmProvider) : null
}

/**
 * Admin sozlamasi: onlayn to'lov yoqilganmi va qaysi usullar.
 * `userId` — kim so'rayapti: sinov rejimida faqat ega/adminlarga ochiq.
 */
export async function onlineSettings(userId?: number): Promise<{ enabled: boolean; providers: WlcmProvider[] }> {
  const db = await adminDb()
  const data = (await db.collection('settings').doc('payment').get()).data() || {}
  const testers: number[] = Array.isArray(data.onlineTesters) ? data.onlineTesters.map(Number) : []
  if (data.onlineTestOnly === true && !(userId && testers.includes(userId))) {
    return { enabled: false, providers: [] }
  }
  const providers = (Array.isArray(data.onlineProviders) ? data.onlineProviders : [])
    .map(readProvider)
    .filter((p): p is WlcmProvider => p !== null)
  // WLCM'da hozir o'chirilgan usul mijozga taklif qilinmaydi (so'rov yiqilsa — admin ro'yxati)
  let usable = providers
  try {
    const active = await activeProviders()
    usable = providers.filter((p) => active.includes(p))
  } catch (error) {
    console.warn('[payment] usullar ro‘yxati olinmadi:', error)
  }
  return {
    // Kalitlar sozlanmagan bo'lsa — admin yoqqan bo'lsa ham o'chiq
    enabled: data.online === true && wlcmConfigured() && usable.length > 0,
    providers: usable,
  }
}

export function siteUrl(): string {
  const direct = process.env.MINI_APP_URL
  if (direct) return direct.replace(/\/+$/, '')
  const panel = process.env.ADMIN_PANEL_URL
  try {
    if (panel) return new URL(panel).origin
  } catch {
    // pastdagi zaxira
  }
  return 'https://musa-delivery.vercel.app'
}

/** To'lovdan keyin mijoz qaytadigan sahifa (api/payment.ts GET). */
function returnUrl(orderId: string): string {
  return `${siteUrl()}/api/payment?return=${encodeURIComponent(orderId)}`
}

/**
 * To'lov sahifasini yaratadi (yoki qayta yaratadi) va buyurtmaga yozadi.
 *
 * `external_id` WLCM'da noyob bo'lishi kerak: birinchi urinish — buyurtma
 * id'si, keyingilari `id-2`, `id-3`… Webhook'da id `-` gacha qismdan
 * olinadi (Firestore id'larida `-` bo'lmaydi).
 */
export async function startPayment(orderId: string, order: PayOrder, provider: WlcmProvider): Promise<PaymentInfo> {
  const total = Number(order.total) || 0
  if (total <= 0) throw new Error('Buyurtma summasi noto‘g‘ri')

  const attempts = (Number(order.payment?.attempts) || 0) + 1
  const externalId = attempts === 1 ? orderId : `${orderId}-${attempts}`
  const checkout = await createCheckout({ externalId, amountSum: total, provider, returnUrl: returnUrl(orderId) })
  if (!checkout.checkoutUrl) throw new Error('To‘lov sahifasi yaratilmadi')

  const payment: PaymentInfo = {
    provider,
    externalId,
    wlcmOrderId: checkout.orderId,
    checkoutUrl: checkout.checkoutUrl,
    state: checkout.state,
    attempts,
    createdAt: new Date().toISOString(),
  }
  const db = await adminDb()
  await db.collection('orders').doc(orderId).set({ payment }, { merge: true })
  return payment
}

/**
 * Karta bilan to'lov: WLCM'da sessiya ochiladi va karta egasiga SMS kod
 * yuboriladi. Buyurtmaga faqat tasdiqlash uchun kerakli id'lar va karta
 * niqobi yoziladi — raqam va muddat yozilmaydi.
 */
export async function startCardPayment(
  orderId: string,
  order: PayOrder,
  card: NonNullable<ReturnType<typeof readCard>>,
): Promise<PaymentInfo> {
  const total = Number(order.total) || 0
  if (total <= 0) throw new Error('Buyurtma summasi noto‘g‘ri')

  const attempts = (Number(order.payment?.attempts) || 0) + 1
  const externalId = attempts === 1 ? orderId : `${orderId}-${attempts}`
  const session = await createCardCheckout({
    externalId,
    amountSum: total,
    cardNumber: card.number,
    expireYYMM: card.expireYYMM,
    returnUrl: returnUrl(orderId),
  })

  const payment: PaymentInfo = {
    provider: 'card',
    externalId,
    wlcmOrderId: session.orderId,
    checkoutUrl: null,
    state: session.state,
    attempts,
    createdAt: new Date().toISOString(),
    transactionId: session.transactionId,
    cid: session.cid,
    otpPhone: session.otpPhone,
    cardMask: card.mask,
    cardType: card.type,
  }
  const db = await adminDb()
  await db.collection('orders').doc(orderId).set({ payment }, { merge: true })
  return payment
}

/**
 * SMS kodni tasdiqlaydi. To'lov o'tsa — buyurtma odatdagi yo'l bilan «Yangi»
 * bo'ladi (applyPaymentState). Noto'g'ri kod — `INVALID_OTP`.
 */
export async function confirmCardPayment(orderId: string, otp: string): Promise<{ result: string }> {
  const code = String(otp || '').replace(/\D/g, '')
  if (code.length < 4 || code.length > 8) throw new CodedError('INVALID_OTP', 'SMS kod noto‘g‘ri')

  const db = await adminDb()
  const order = (await db.collection('orders').doc(orderId).get()).data() as PayOrder | undefined
  const payment = order?.payment
  if (!order || payment?.provider !== 'card' || !payment.transactionId || !payment.cid) {
    throw new CodedError('NOT_AWAITING', 'Bu buyurtma karta to‘lovini kutmayapti')
  }
  if (order.paidAt) return { result: 'noop' }

  try {
    const confirmed = await confirmCard({ transactionId: payment.transactionId, cid: payment.cid, otp: code })
    if (!confirmed.success) throw new CodedError('INVALID_OTP', 'SMS kod noto‘g‘ri')
  } catch (error) {
    if (error instanceof CodedError) throw error
    if (error instanceof WlcmError && error.status === 400) throw new CodedError('INVALID_OTP', 'SMS kod noto‘g‘ri yoki eskirgan')
    throw error
  }

  // Holatni WLCM'dan tasdiqlab olamiz; kechiksa — tasdiqlash javobiga ishonamiz
  const checked = await checkPayment(orderId).catch(() => ({ ok: false, result: 'unknown' }))
  if (checked.result === 'paid' || checked.result === 'noop') return { result: 'paid' }
  return applyPaymentState(orderId, { state: WLCM_STATE.SUCCESS, amount: order.total, paymentId: payment.paymentId ?? null })
}

/** Webhook summasi — so'mda ham, tiyinda ham kelishi mumkin; ikkalasini qabul qilamiz. */
function amountMatches(amount: unknown, total: number): boolean {
  const value = Number(String(amount ?? '').replace(',', '.'))
  if (!Number.isFinite(value) || value <= 0) return false
  return Math.abs(value - total) < 1 || Math.abs(value - total * 100) < 1
}

async function alertAdmins(text: string): Promise<void> {
  try {
    for (const chatId of await adminTargets()) await sendMessage(chatId, text)
  } catch (error) {
    console.error('[payment] adminlarga xabar ketmadi:', error)
  }
}

const SYSTEM = { uid: 'wlcm', name: 'Onlayn to‘lov', role: 'system' }

/** Webhook manzili — admin «Webhookni ulash» tugmasi shuni WLCM'ga beradi. */
export function webhookUrl(): string {
  return `${siteUrl()}/api/payment?hook=wlcm`
}

/**
 * WLCM webhook. Imzo tekshiriladi, keyin holat buyurtmaga qo'llanadi.
 * Takroriy webhook zararsiz: holat allaqachon qo'llangan bo'lsa hech narsa qilmaydi.
 */
export async function handleWebhook(
  payload: WebhookPayload,
  headerSignature?: string,
): Promise<{ ok: boolean; result: string }> {
  if (!verifyWebhook(payload, headerSignature)) return { ok: false, result: 'bad_signature' }

  const externalId = String(payload.external_id || '')
  const orderId = externalId.split('-')[0]
  const state = Number(payload.state)
  if (!orderId || !Number.isFinite(state)) return { ok: false, result: 'bad_payload' }

  return applyPaymentState(orderId, {
    state,
    amount: payload.amount,
    paymentId: payload.payment_id != null ? String(payload.payment_id) : null,
  })
}

/**
 * To'lov holatini WLCM'dan so'raydi va buyurtmaga qo'llaydi (webhook kechiksa).
 * Faqat to'lov kutilayotgan buyurtma uchun ma'noli; aks holda hech narsa qilmaydi.
 */
export async function checkPayment(orderId: string): Promise<{ ok: boolean; result: string }> {
  const db = await adminDb()
  const order = (await db.collection('orders').doc(orderId).get()).data() as PayOrder | undefined
  const wlcmOrderId = order?.payment?.wlcmOrderId
  if (!order || !wlcmOrderId) return { ok: true, result: 'no_payment' }
  if (order.paidAt || order.status !== AWAITING_PAYMENT) return { ok: true, result: 'noop' }

  const status = await wlcmOrderStatus(wlcmOrderId)
  const state = status.isPaid
    ? WLCM_STATE.SUCCESS
    : status.isCancelled ? WLCM_STATE.CANCELLED_BEFORE_PAYMENT : status.state
  if (state !== WLCM_STATE.SUCCESS && state !== WLCM_STATE.CANCELLED_BEFORE_PAYMENT) {
    return { ok: true, result: 'pending' }
  }
  return applyPaymentState(orderId, { state, amount: status.amount, paymentId: order.payment?.paymentId ?? null })
}

/**
 * To'lov holatini buyurtmaga qo'llash — webhook, holat so'rovi va cron uchun bitta yo'l.
 */
async function applyPaymentState(
  orderId: string,
  input: { state: number; amount: unknown; paymentId: string | null },
): Promise<{ ok: boolean; result: string }> {
  const { state } = input
  const payload = { amount: input.amount, payment_id: input.paymentId }
  const db = await adminDb()
  const ref = db.collection('orders').doc(orderId)
  const now = new Date().toISOString()

  // Holat o'zgarishi tranzaksiyada — parallel ikki webhook bir martagina o'tadi
  const outcome = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) return { kind: 'missing' as const }
    const order = snap.data() as PayOrder
    const payment = {
      ...(order.payment || {}),
      state,
      paymentId: payload.payment_id ?? order.payment?.paymentId ?? null,
      updatedAt: now,
    }

    if (state === WLCM_STATE.SUCCESS) {
      if (order.paidAt) return { kind: 'noop' as const, order }
      if (!amountMatches(payload.amount, Number(order.total) || 0)) {
        tx.set(ref, { payment, paymentStatus: 'Tekshirish kerak' }, { merge: true })
        return { kind: 'mismatch' as const, order }
      }
      const reopened = order.status !== AWAITING_PAYMENT
      tx.set(ref, {
        payment,
        paidAt: now,
        paymentStatus: 'Tolangan',
        // Kutilayotgan buyurtma endi haqiqiy buyurtma. Vaqt tugab bekor
        // bo'lgan bo'lsa holatiga tegmaymiz — admin qaror qiladi.
        ...(reopened ? {} : { status: 'Yangi', statusUpdatedAt: now }),
      }, { merge: true })
      return { kind: reopened ? ('late' as const) : ('paid' as const), order }
    }

    if (state === WLCM_STATE.CANCELLED_BEFORE_PAYMENT) {
      if (order.paidAt || order.status !== AWAITING_PAYMENT) {
        tx.set(ref, { payment }, { merge: true })
        return { kind: 'noop' as const, order }
      }
      tx.set(ref, {
        payment,
        status: 'Bekor qilingan',
        statusUpdatedAt: now,
        paymentStatus: 'Rad etildi',
        cancelReason: 'payment_cancelled',
      }, { merge: true })
      return { kind: 'cancelled' as const, order }
    }

    if (state === WLCM_STATE.CANCELLED) {
      tx.set(ref, { payment, paymentStatus: 'Qaytarildi', refundedAt: now }, { merge: true })
      return { kind: 'refunded' as const, order }
    }

    // 0 / 1 — jarayonda
    tx.set(ref, { payment }, { merge: true })
    return { kind: 'noop' as const, order }
  })

  if (outcome.kind === 'missing') return { ok: true, result: 'order_not_found' }
  const order = outcome.order
  const label = escapeHtml(orderLabel(order, orderId))

  if (outcome.kind === 'paid') {
    await ref.collection('history').add({ at: now, from: AWAITING_PAYMENT, to: 'Yangi', by: SYSTEM })
    const fresh = (await ref.get()).data() || {}
    // Endi odatdagi yangi buyurtma: adminlar, kuryer ilovalari, Linko
    await notifyNewOrder(orderId, fresh)
    await bumpOrdersSignal()
    await pushOrderSafe(orderId, fresh)
    if (order.userId) {
      const lang = await userLang(order.userId)
      const text = lang === 'ru'
        ? `💳 Оплата получена!\n🆕 Ваш заказ <b>${label}</b> принят.`
        : `💳 To‘lov qabul qilindi!\n🆕 <b>${label}</b> buyurtmangiz qabul qilindi.`
      await sendLiveStatus(orderId, order.userId, 'Yangi', lang, text)
    }
  } else if (outcome.kind === 'cancelled') {
    // Mijozning o'zi to'lovni bekor qildi — unga xabar shart emas
    await applyStatusEffects(orderId, order, 'Bekor qilingan', SYSTEM, now, { customerNotice: false })
  } else if (outcome.kind === 'late') {
    await alertAdmins(`⚠️ <b>${label}</b> — to‘lov bekor qilingan buyurtmaga keldi (${escapeHtml(String(payload.amount))}). Buyurtmani tiklang yoki pulni qaytaring.`)
  } else if (outcome.kind === 'mismatch') {
    await alertAdmins(`⚠️ <b>${label}</b> — to‘lov summasi mos emas: keldi ${escapeHtml(String(payload.amount))}, buyurtma ${Number(order.total) || 0}. Tekshiring.`)
  } else if (outcome.kind === 'refunded') {
    await alertAdmins(`↩️ <b>${label}</b> — onlayn to‘lov qaytarildi.`)
  }

  return { ok: true, result: outcome.kind }
}

/**
 * To'lanmay qolgan onlayn buyurtmalar — `PAYMENT_TTL_MIN` dan keyin bekor.
 * Qoldiq omborga qaytadi. Cron (api/linko-cron.ts) chaqiradi.
 */
export async function expireUnpaidOrders(): Promise<{ expired: number }> {
  const db = await adminDb()
  const cutoff = new Date(Date.now() - PAYMENT_TTL_MIN * 60_000).toISOString()
  const snap = await db.collection('orders').where('status', '==', AWAITING_PAYMENT).get()

  let expired = 0
  for (const doc of snap.docs) {
    const order = doc.data() as PayOrder
    if (String(order.createdAt || '') > cutoff) continue
    // Bekor qilishdan oldin — balki to'langan-u webhook kelmagan
    try {
      const checked = await checkPayment(doc.id)
      if (checked.result === 'paid' || checked.result === 'cancelled') continue
    } catch (error) {
      console.warn('[payment] holat tekshirilmadi:', doc.id, error)
    }
    const now = new Date().toISOString()
    const changed = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref)
      const data = fresh.data() as PayOrder | undefined
      if (!data || data.status !== AWAITING_PAYMENT || data.paidAt) return false
      tx.set(doc.ref, {
        status: 'Bekor qilingan',
        statusUpdatedAt: now,
        paymentStatus: 'Rad etildi',
        cancelReason: 'payment_timeout',
      }, { merge: true })
      return true
    })
    if (!changed) continue
    expired++
    await restoreStock(doc.id)
    await doc.ref.collection('history').add({ at: now, from: AWAITING_PAYMENT, to: 'Bekor qilingan', by: SYSTEM })
  }
  return { expired }
}
