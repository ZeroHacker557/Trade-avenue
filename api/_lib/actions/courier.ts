import { adminDb } from '../firebase-admin.js'
import type { Staff } from '../admin-auth.js'
import { applyStatusEffects, bumpOrdersSignal, sendLiveStatus, type OrderDoc } from './orders.js'
import { supportOpen } from './support.js'
import { escapeHtml, sendMessage } from '../telegram.js'
import { userLang } from '../i18n.js'
import { cashSummary } from './cash.js'
import {
  distanceKm, endShiftLocation, etaFromPlan, lastKnownPoint, locationStatus, planStops,
  type Point,
} from './location.js'
import { canDeliver, courierPhone, shiftActive, tashkentMidnight } from '../courier-staff.js'
import { CodedError } from '../errors.js'
import { orderLabel, tashkentDay } from '../order-number.js'
import { isCashPayment } from '../pay-method.js'

/**
 * Kuryer amallari — mini app'dagi kuryer sahifasi uchun.
 *
 * Ikki yo'ldan chaqiriladi:
 *   • api/courier.ts — mini app (Telegram orqali kirgan kuryer)
 *   • api/admin/action.ts — botdagi eski «Oldim / Yetkazdim» tugmalari
 *
 * Holat o'zgargandan keyingi hamma ish (mijozga xabar, Linko, tarix,
 * boshqa kuryerlardagi xabarlar) `applyStatusEffects` da — admin panel
 * bilan bir xil yo'l. Kuryerni aniqlash — ../courier-staff.ts.
 */

type Body = Record<string, unknown>

const DAY_MS = 24 * 60 * 60 * 1000

function requireCourier(staff: Staff) {
  if (!canDeliver(staff)) throw new CodedError('COURIER_ONLY', 'Bu amal faqat kuryer uchun')
}

function orderIdOf(body: Body): string {
  const id = String(body.orderId || '').trim()
  if (!id) throw new CodedError('ORDER_MISSING', 'Buyurtma tanlanmagan')
  return id
}

/**
 * To'g'ridan-to'g'ri bitta manzilgacha taxminiy vaqt, daqiqa
 * (location.ts → etaFromPlan, oldingi manzillarsiz). Kuryer joylashuvi
 * yoki mijoz koordinatasi bo'lmasa — null.
 */
export function etaMinutes(from: Point | null, to: Point | null | undefined): number | null {
  if (!from || !to) return null
  return etaFromPlan({ stopsBefore: 0, viaKm: distanceKm(from, to) })
}

/** Ilova yuborgan joylashuv — noto'g'ri bo'lsa hisobga olinmaydi. */
function pointOf(body: Body): { lat: number; lng: number } | null {
  const lat = Number(body.lat)
  const lng = Number(body.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  if (lat === 0 && lng === 0) return null
  return { lat, lng }
}

export type TakeOutcome = 'claimed' | 'already' | 'taken' | 'closed' | 'not_found'

/**
 * Buyurtmani kuryerga BAND qiladi — atomar.
 *
 * Bitta buyurtma bir necha kuryerga ketadi; ikkitasi bir vaqtda «Olaman»
 * bossa, tranzaksiya faqat bittasini o'tkazadi. Ikkinchisi `taken` oladi.
 *
 *   claimed   — endi shu kuryerniki, holat «Yetkazilmoqda»
 *   already   — shu kuryer allaqachon olgan (qayta bosdi)
 *   taken     — boshqa kuryer olib bo'lgan
 *   closed    — buyurtma bekor qilingan yoki hali tasdiqlanmagan
 *   not_found — buyurtma yo'q
 */
export async function courierTake(staff: Staff, body: Body) {
  requireCourier(staff)
  const orderId = orderIdOf(body)
  const db = await adminDb()
  const ref = db.collection('orders').doc(orderId)
  const now = new Date().toISOString()
  const by = { uid: staff.uid, name: staff.name, role: staff.role }

  /*
   * Kuryer qayerda: ilova yuborgan nuqta, bo'lmasa so'nggi ma'lum joyi
   * (Telegram jonli joylashuvi yoki ilova, 10 daqiqadan yangi). Ilova
   * GPS ruxsatini olmagan bo'lsa ham mijoz vaqtni bilsin.
   */
  const from: Point | null = pointOf(body) ?? (await lastKnownPoint(staff.uid))
  // Kuryer qo'lidagi boshqa buyurtmalar — yangi mijoz ulardan keyin bo'lishi mumkin
  const others = from
    ? (await db.collection('orders').where('courierId', '==', staff.uid).where('status', '==', 'Yetkazilmoqda').get()).docs
    : []
  let eta: number | null = null
  let stops = 0
  // Mijoz xaritasida ism yonida chiqadi — Xodimlar kartasi yoki bot kontakti
  const phone = await courierPhone(staff)

  const { outcome, order } = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) return { outcome: 'not_found' as TakeOutcome, order: null }
    const data = snap.data() as OrderDoc

    if (data.courierId && data.courierId !== staff.uid) {
      return { outcome: 'taken' as TakeOutcome, order: data }
    }
    if (data.courierId === staff.uid && (data.status === 'Yetkazilmoqda' || data.status === 'Yetkazildi')) {
      return { outcome: 'already' as TakeOutcome, order: data }
    }
    // Faqat tasdiqlangan buyurtma olinadi — bekor qilingani yoki hali
    // admin ko'rmagani kuryerga tegmaydi
    if (data.status !== 'Qabul qilindi') return { outcome: 'closed' as TakeOutcome, order: data }

    // Mijozga «taxminan 25 daqiqada» — kuryerning hozirgi joyidan, qo'lidagi
    // boshqa manzillarni ham hisobga olib (eng yaqin qo'shni tartibi)
    const target = data.customer?.location
    if (from && target && Number.isFinite(target.lat) && Number.isFinite(target.lng)) {
      const plan = planStops(from, [
        ...others.filter((doc) => doc.id !== orderId).map((doc) => {
          const loc = (doc.data() as OrderDoc).customer?.location
          return { id: doc.id, point: loc && Number.isFinite(loc.lat) ? { lat: loc.lat, lng: loc.lng } : null }
        }),
        { id: orderId, point: { lat: target.lat, lng: target.lng } },
      ]).get(orderId)
      if (plan) {
        eta = etaFromPlan(plan)
        stops = plan.stopsBefore
      }
    }
    tx.update(ref, {
      courierId: staff.uid,
      courierName: staff.name,
      // Mijoz ilovasidagi «Kuryer yo'lda» kartochkasida qo'ng'iroq tugmasi
      courierPhone: phone,
      status: 'Yetkazilmoqda',
      takenAt: now,
      etaMinutes: eta,
      etaStops: eta ? stops : null,
      etaAt: eta ? new Date(Date.parse(now) + eta * 60_000).toISOString() : null,
      statusUpdatedAt: now,
      statusUpdatedBy: by,
    })
    return { outcome: 'claimed' as TakeOutcome, order: data }
  })

  if (outcome === 'claimed' && order) {
    // Mijoz «Kuryer qayerda» xaritasida kuryerni darhol ko'radi —
    // applyStatusEffects → refreshCourierTracking
    await applyStatusEffects(
      orderId,
      { ...order, courierId: staff.uid, courierName: staff.name, etaMinutes: eta, etaStops: stops },
      'Yetkazilmoqda',
      by,
      now,
    )
  }

  return { outcome, courierName: order?.courierName ?? null, etaMinutes: eta, etaStops: eta ? stops : null }
}

export type DeliverOutcome = 'done' | 'already' | 'not_yours' | 'closed' | 'not_found'

/** Kuryer «Yetkazdim» bosganda — ham atomar. */
export async function courierDeliver(staff: Staff, body: Body) {
  requireCourier(staff)
  const orderId = orderIdOf(body)
  const db = await adminDb()
  const ref = db.collection('orders').doc(orderId)
  const now = new Date().toISOString()
  const by = { uid: staff.uid, name: staff.name, role: staff.role }

  const { outcome, order } = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) return { outcome: 'not_found' as DeliverOutcome, order: null }
    const data = snap.data() as OrderDoc

    if (data.courierId !== staff.uid) return { outcome: 'not_yours' as DeliverOutcome, order: data }
    if (data.status === 'Yetkazildi') return { outcome: 'already' as DeliverOutcome, order: data }
    // Biriktirilgan, lekin «Olaman» bosilmagan buyurtmani ham yetkazish mumkin
    if (data.status !== 'Yetkazilmoqda' && data.status !== 'Qabul qilindi') {
      return { outcome: 'closed' as DeliverOutcome, order: data }
    }

    tx.update(ref, {
      status: 'Yetkazildi',
      deliveredAt: now,
      statusUpdatedAt: now,
      statusUpdatedBy: by,
      /*
       * Naqd pul endi kuryer qo'lida — kassaga topshirilguncha «held».
       * Faqat shu paytdan yetkazilganlarga qo'yiladi: eski buyurtmalar
       * belgisiz qoladi, aks holda butun tarix «qarz» bo'lib chiqardi.
       */
      ...(isCashPayment(data.paymentMethod) ? { cashStatus: 'held', cashCourierId: staff.uid } : {}),
    })
    return { outcome: 'done' as DeliverOutcome, order: data }
  })

  if (outcome === 'done' && order) {
    await applyStatusEffects(orderId, order, 'Yetkazildi', by, now)
  }

  return { outcome }
}

/* ─── Ro'yxat va statistika ──────────────────────────────────── */

type RawOrder = OrderDoc & {
  createdAt?: string
  takenAt?: string
  deliveredAt?: string
  statusUpdatedAt?: string
  assignedAt?: string
  orderDay?: string
  subtotal?: number
  discount?: number
  promoCode?: string | null
  deliveryFee?: number
  paymentStatus?: string | null
  arrivedAt?: string | null
  etaAt?: string | null
  cashStatus?: 'held' | 'pending' | 'settled'
  problems?: { code: string; at: string }[]
  products?: {
    product?: {
      name?: string
      price?: number
      images?: string[]
      thumbs?: string[]
      variantSources?: string[]
      /** Set bo'lsa — tarkibi (api/orders.ts yozadi). */
      bundle?: { name?: string; quantity?: number }[]
    }
    quantity?: number
    size?: string | null
    color?: string | null
  }[]
}

/**
 * Mahsulotning kichik rasmi — src/utils/product-image.ts → productThumb
 * bilan bir xil qoida: siqilgan nusxa faqat o'sha asl rasmdan yasalgan
 * bo'lsa olinadi, aks holda asl rasm.
 */
function thumbOf(product: { images?: string[]; thumbs?: string[]; variantSources?: string[] } = {}) {
  const original = product.images?.[0] || ''
  const fresh = original && product.variantSources?.[0] === original
  return (fresh && product.thumbs?.[0]) || original || null
}

/** Kuryerga kerakli qismi — ichki maydonlar (dispatch xabarlari va h.k.) chiqmaydi. */
function present(id: string, order: RawOrder, uid: string) {
  const customer = order.customer || {}
  const location = customer.location
  return {
    id,
    number: order.orderNumber || `#${id.slice(0, 6)}`,
    status: order.status || '',
    createdAt: order.createdAt || null,
    takenAt: order.takenAt || null,
    deliveredAt: deliveredAt(order),
    assignedToMe: order.courierId === uid,
    customer: {
      name: customer.name || '',
      phone: customer.phone || '',
      address: customer.address || '',
      comment: customer.comment || '',
      recipientName: customer.recipientName || '',
      recipientPhone: customer.recipientPhone || '',
      location:
        location && typeof location.lat === 'number' && typeof location.lng === 'number'
          ? { lat: location.lat, lng: location.lng }
          : null,
    },
    items: (order.products || []).map((line) => ({
      name: line.product?.name || '',
      quantity: Number(line.quantity) || 1,
      price: Number(line.product?.price) || 0,
      size: line.size || null,
      image: thumbOf((line.product ?? {}) as Parameters<typeof thumbOf>[0]),
      // Set — kuryer nimani yig'ishini ko'rsin
      bundle: ((line.product as { bundle?: { name?: string; quantity?: number }[] } | undefined)?.bundle ?? [])
        .map((b) => ({ name: String(b?.name || ''), quantity: Number(b?.quantity) || 1 })),
    })),
    total: Number(order.total) || 0,
    paymentMethod: order.paymentMethod || 'Naqd',
    // Chek uchun — hisob-kitob tarkibi va kim yetkazgani
    orderDay: order.orderDay || null,
    subtotal: Number(order.subtotal) || 0,
    discount: Number(order.discount) || 0,
    promoCode: order.promoCode || null,
    deliveryFee: Number(order.deliveryFee) || 0,
    paymentStatus: order.paymentStatus || null,
    courierName: order.courierName || null,
    arrivedAt: order.arrivedAt || null,
    etaAt: order.etaAt || null,
    etaStops: typeof order.etaStops === 'number' ? order.etaStops : null,
    cashStatus: order.cashStatus || null,
    problems: Array.isArray(order.problems) ? order.problems.map((p) => String(p.code)) : [],
  }
}

/** Yetkazilgan vaqt. Eski buyurtmalarda `deliveredAt` yo'q — holat vaqti olinadi. */
function deliveredAt(order: RawOrder): string | null {
  if (order.status !== 'Yetkazildi') return null
  return order.deliveredAt || order.statusUpdatedAt || order.createdAt || null
}

/** Toshkent bo'yicha bugungi kun boshidan `daysBack` kun oldingi vaqt (ms). */
function tashkentDayStart(daysBack = 0): number {
  return tashkentMidnight() - daysBack * DAY_MS
}

/** Oxirgi `n` kunning Toshkent sanalari: bugun, kecha, … */
function lastDays(n: number): string[] {
  const days: string[] = []
  for (let i = 0; i < n; i++) days.push(tashkentDay(new Date(Date.now() - i * DAY_MS)))
  return days
}

/** Kuryer ilovasi ko'rsatadigan tarix chuqurligi, kun. Firestore `in` ko'pi 30 ta qiymat oladi. */
const HISTORY_DAYS = 30

type Bucket = { delivered: number; cash: number; card: number }

function bucket(orders: RawOrder[], since: number): Bucket {
  const result: Bucket = { delivered: 0, cash: 0, card: 0 }
  for (const order of orders) {
    const at = Date.parse(deliveredAt(order) || '')
    if (!Number.isFinite(at) || at < since) continue
    result.delivered++
    const total = Number(order.total) || 0
    // Karta va onlayn — naqdsiz
    if (isCashPayment(order.paymentMethod)) result.cash += total
    else result.card += total
  }
  return result
}

/**
 * Kuryer sahifasining hamma ma'lumoti — bitta so'rovda.
 *
 *   available — olish mumkin: tasdiqlangan, hech kimga tegmagan yoki
 *               aynan shu kuryerga biriktirilgan
 *   active    — shu kuryerda, yo'lda
 *   done      — bugun yetkazganlari
 *   stats     — bugun / 7 kun / 30 kun
 *   recent    — oxirgi 30 ta yetkazilgan
 *
 * Tartiblash (yaqinlik bo'yicha) ilovada: kuryerning joylashuvi faqat
 * telefonda ma'lum.
 *
 * Bu so'rov har buyurtma o'zgarishida (signals/orders) qayta keladi,
 * shuning uchun kuryerning BUTUN tarixi o'qilmaydi: yo'ldagilar,
 * oxirgi 30 kun yetkazilganlari va kassaga topshirilmaganlari. Jami son
 * — `count()` bilan, hujjatlarni yuklamasdan.
 */
export async function courierOverview(staff: Staff) {
  requireCourier(staff)
  const db = await adminDb()
  const byMe = db.collection('orders').where('courierId', '==', staff.uid)

  const [ready, onWay, recentDelivered, unsettled, deliveredCount, staffSnap] = await Promise.all([
    db.collection('orders').where('status', '==', 'Qabul qilindi').get(),
    byMe.where('status', '==', 'Yetkazilmoqda').get(),
    byMe.where('status', '==', 'Yetkazildi').where('orderDay', 'in', lastDays(HISTORY_DAYS)).get(),
    byMe.where('cashStatus', 'in', ['held', 'pending']).get(),
    byMe.where('status', '==', 'Yetkazildi').count().get(),
    db.collection('staff').doc(staff.uid).get(),
  ])
  const staffData = (staffSnap.data() || {}) as {
    onShift?: boolean; shiftSince?: string
  }

  const available = ready.docs
    .filter((doc) => {
      const owner = (doc.data() as RawOrder).courierId
      return !owner || owner === staff.uid
    })
    .map((doc) => present(doc.id, doc.data() as RawOrder, staff.uid))

  const toRows = (snap: typeof onWay) => snap.docs.map((doc) => ({ id: doc.id, data: doc.data() as RawOrder }))
  const delivered = toRows(recentDelivered)
  const today = tashkentDayStart(0)

  const active = toRows(onWay).map((o) => present(o.id, o.data, staff.uid))

  const byDeliveredDesc = (a: { data: RawOrder }, b: { data: RawOrder }) =>
    String(deliveredAt(b.data)).localeCompare(String(deliveredAt(a.data)))

  const done = delivered
    .filter((o) => Date.parse(deliveredAt(o.data) || '') >= today)
    .sort(byDeliveredDesc)
    .map((o) => present(o.id, o.data, staff.uid))

  const recent = [...delivered]
    .sort(byDeliveredDesc)
    .slice(0, 30)
    .map((o) => present(o.id, o.data, staff.uid))

  const all = delivered.map((o) => o.data)

  return {
    profile: {
      name: staff.name,
      phone: staff.phone ?? null,
      telegramId: staff.telegramId ?? null,
      // Kechagi smena 00:00 da o'zi yopiladi
      onShift: shiftActive(staffData),
    },
    cash: await cashSummary(staff.uid, toRows(unsettled)),
    // Telegram jonli joylashuvi yoqilganmi — ilova eslatma ko'rsatadi
    location: await locationStatus(staff.uid),
    available,
    active,
    done,
    recent,
    stats: {
      today: bucket(all, today),
      week: bucket(all, tashkentDayStart(6)),
      month: bucket(all, tashkentDayStart(29)),
      total: Number(deliveredCount.data().count) || all.length,
    },
    serverTime: new Date().toISOString(),
  }
}

/* ─── Smena ─────────────────────────────────────────────────── */

/**
 * «Ishdaman / Dam olyapman». Yangi buyurtma xabari faqat ishdagi
 * kuryerlarga boradi (orders.ts → dispatchToCouriers).
 */
export async function courierShift(staff: Staff, body: Body) {
  requireCourier(staff)
  const on = body.on === true
  const now = new Date().toISOString()
  await (await adminDb()).collection('staff').doc(staff.uid).set(
    on ? { onShift: true, shiftSince: now } : { onShift: false, shiftEndedAt: now },
    { merge: true },
  )

  // Smena tugadi — dam olayotgan kuryer xaritada kuzatilmaydi
  if (!on) {
    const { liveWasOn } = await endShiftLocation(staff.uid)
    if (liveWasOn && staff.telegramId) {
      await sendMessage(staff.telegramId, STOP_LIVE_TEXT).catch(() => undefined)
    }
  }

  // Smena boshlandi, jonli joylashuv esa yoqilmagan — bot qanday qilishni eslatadi
  if (on && staff.telegramId) {
    const loc = await locationStatus(staff.uid)
    const live = loc.source === 'live' && Date.now() - Date.parse(loc.at || '') < 5 * 60_000
    if (!live) await sendMessage(staff.telegramId, SHARE_LIVE_TEXT).catch(() => undefined)
  }
  return { onShift: on }
}

/** Jonli joylashuvni yoqish yo'riqnomasi (bot ham /joylashuv da shuni beradi). */
const SHARE_LIVE_TEXT =
  '📍 <b>Smena boshlandi!</b>\n\n' +
  'Admin va mijozlar sizni xaritada ko‘rishi uchun shu chatga <b>jonli joylashuv</b> yuboring — ' +
  'ilova yopiq bo‘lsa ham Telegram uni o‘zi yangilab turadi:\n\n' +
  '1. Pastdagi 📎 tugmasini bosing\n' +
  '2. «Joylashuv» (Location) ni tanlang\n' +
  '3. «Jonli joylashuvni ulashish» → <b>«Men o‘chirgunimcha»</b>\n\n' +
  '<i>Smena tugaganda xabardagi «Ulashishni to‘xtatish» ni bosing.</i>'

/** Smena tugaganda — jonli ulashishni to'xtatishni faqat kuryerning o'zi qila oladi. */
export const STOP_LIVE_TEXT =
  '🌙 <b>Smena tugadi.</b> Joylashuvingiz endi saqlanmaydi.\n\n' +
  'Telegram jonli joylashuvni baribir ulashib turibdi — shu chatdagi joylashuv xabari ostidagi ' +
  '<b>«Ulashishni to‘xtatish»</b> ni bosing.'

/* ─── «Yetib keldim» ────────────────────────────────────────── */

const ARRIVED_TEXT = {
  uz: (n: string) => `📍 <b>Kuryer eshik oldida!</b>\n${n} buyurtmangizni kutib oling.`,
  ru: (n: string) => `📍 <b>Курьер у двери!</b>\nВстречайте заказ ${n}.`,
}
const ARRIVED_NOTIF = { uz: 'Kuryer eshik oldida', ru: 'Курьер у двери' }

export type ArrivedOutcome = 'done' | 'already' | 'not_yours' | 'closed' | 'not_found'

/** Kuryer manzilga yetib keldi — mijozga bir marta xabar. */
export async function courierArrived(staff: Staff, body: Body) {
  requireCourier(staff)
  const orderId = orderIdOf(body)
  const db = await adminDb()
  const ref = db.collection('orders').doc(orderId)
  const now = new Date().toISOString()

  const { outcome, order } = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) return { outcome: 'not_found' as ArrivedOutcome, order: null }
    const data = snap.data() as RawOrder
    if (data.courierId !== staff.uid) return { outcome: 'not_yours' as ArrivedOutcome, order: data }
    if (data.status !== 'Yetkazilmoqda') return { outcome: 'closed' as ArrivedOutcome, order: data }
    if (data.arrivedAt) return { outcome: 'already' as ArrivedOutcome, order: data }
    tx.update(ref, { arrivedAt: now })
    return { outcome: 'done' as ArrivedOutcome, order: data }
  })

  if (outcome === 'done' && order?.userId) {
    try {
      const lang = await userLang(order.userId)
      const label = orderLabel(order, orderId)
      await db.collection('notifications').add({
        userId: order.userId,
        title: ARRIVED_NOTIF[lang],
        body: label,
        date: now,
        read: false,
        type: 'order',
        orderId,
      })
      // Jonli holat xabari yangilanadi (hali «Yo'lda» bosqichi, sarlavha — eshik oldida)
      await sendLiveStatus(orderId, order.userId, 'Yetkazilmoqda', lang, ARRIVED_TEXT[lang](escapeHtml(label)))
    } catch (error) {
      console.error('[courier] «yetib keldim» xabari ketmadi:', error)
    }
    await bumpOrdersSignal()
  }

  return { outcome, arrivedAt: outcome === 'done' ? now : order?.arrivedAt ?? null }
}

/* ─── Tez muammo tugmalari ──────────────────────────────────── */

export const PROBLEMS = {
  no_answer: '📵 Mijoz javob bermayapti',
  no_address: '🗺 Manzil topilmadi',
  refused: '✋ Mijoz buyurtmani rad etdi',
} as const
export type ProblemCode = keyof typeof PROBLEMS

const CALL_ME = {
  uz: (n: string) => `📞 <b>Kuryer sizga qo‘ng‘iroq qilyapti</b>\n${n} buyurtmangiz bo‘yicha — iltimos, telefonga javob bering.`,
  ru: (n: string) => `📞 <b>Курьер звонит вам</b>\nПо заказу ${n} — пожалуйста, ответьте на звонок.`,
}

/**
 * Kuryer bir bosishda muammo haqida xabar beradi.
 *
 * Shu buyurtma bo'yicha qo'llab-quvvatlash chatiga tayyor matn yoziladi
 * (adminlarga Telegram ham boradi). «Javob bermayapti» da mijozning
 * o'ziga ham bot yozadi — ko'pincha shu yetarli bo'ladi.
 */
export async function courierProblem(staff: Staff, body: Body) {
  requireCourier(staff)
  const orderId = orderIdOf(body)
  const code = String(body.code || '') as ProblemCode
  if (!(code in PROBLEMS)) throw new CodedError('PROBLEM_TYPE', 'Muammo turi noto‘g‘ri')

  const db = await adminDb()
  const ref = db.collection('orders').doc(orderId)
  const snap = await ref.get()
  if (!snap.exists) throw new CodedError('ORDER_GONE', 'Buyurtma topilmadi')
  const order = snap.data() as RawOrder
  const mine = order.courierId === staff.uid
  const open = !order.courierId && order.status === 'Qabul qilindi'
  if (!mine && !open) throw new CodedError('ORDER_NOT_YOURS', 'Bu buyurtma sizga biriktirilmagan')

  const at = new Date().toISOString()
  const problems = [...(Array.isArray(order.problems) ? order.problems : []), { code, at, by: staff.uid }]
  await ref.set({ problems }, { merge: true })

  const note = String(body.note || '').trim().slice(0, 500)
  const { threadId } = await supportOpen(staff, {
    orderId,
    text: `⚠️ ${PROBLEMS[code]}` + (note ? `\n${note}` : ''),
  })

  let customerNotified = false
  if (code === 'no_answer' && order.userId) {
    const lang = await userLang(order.userId)
    const label = escapeHtml(orderLabel(order, orderId))
    customerNotified = (await sendMessage(order.userId, CALL_ME[lang](label))).ok
  }

  return { threadId, customerNotified }
}
