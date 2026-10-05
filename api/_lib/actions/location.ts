import { adminDb } from '../firebase-admin.js'
import type { Staff } from '../admin-auth.js'
import { canDeliver, courierPhone, shiftActive } from '../courier-staff.js'
import { CodedError } from '../errors.js'

/**
 * Kuryerning jonli joylashuvi.
 *
 *   courier_locations/{staffUid}  — admin xaritasi (faqat admin o'qiydi)
 *   order_tracking/{orderId}      — mijozning «Kuryer qayerda» xaritasi
 *                                   (faqat buyurtma egasi o'qiydi)
 *
 * Ikki manba bor:
 *   live — Telegram'ning «Jonli joylashuv»i: kuryer botga bir marta
 *          ulashadi, Telegram esa fonda yuborib turadi (mini app yopiq
 *          bo'lsa ham). Bot uni qabul qilib, xuddi shu shaklda yozadi
 *          (bot/firebase_db.py → save_courier_location).
 *   app  — mini app ochiq turganda ilovaning o'zi (har 30 soniyada).
 *
 * Maxfiylik: joylashuv faqat kuryer smenada bo'lsa YOKI qo'lida yo'ldagi
 * buyurtma bo'lsa saqlanadi. Smena tugab, yetkazadigani qolmasa —
 * admin xaritasidan ham o'chadi.
 *
 * Mijozga faqat «Yetkazilmoqda» holatidagi O'Z buyurtmasi bo'yicha
 * ko'rinadi. Buyurtma yopilishi bilan `order_tracking` o'chiriladi
 * (orders.ts → applyStatusEffects).
 */

type Body = Record<string, unknown>

export type Point = { lat: number; lng: number }

export type LocationPoint = Point & {
  accuracy?: number | null
  heading?: number | null
  speed?: number | null
}

export type LocationSource = 'live' | 'app'

/** Shundan eski joylashuv mijozga ham, vaqt hisobiga ham olinmaydi. */
export const LOCATION_FRESH_MS = 10 * 60_000

/** Ilova yuborgan nuqta — noto'g'ri bo'lsa rad etiladi. */
export function readPoint(body: Body): LocationPoint {
  const lat = Number(body.lat)
  const lng = Number(body.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) {
    throw new CodedError('BAD_LOCATION', 'Joylashuv noto‘g‘ri')
  }
  const num = (v: unknown) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null)
  return { lat, lng, accuracy: num(body.accuracy), heading: num(body.heading), speed: num(body.speed) }
}

/* ─── Marshrut: kim kimdan oldin ─────────────────────────────── */

/** Ikki nuqta orasidagi masofa, km (src/courier/route.ts dagi bilan bir xil). */
export function distanceKm(a: Point, b: Point): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)))
}

export type StopPlan = {
  /** Kuryer shu manzildan OLDIN boradigan boshqa manzillar soni. */
  stopsBefore: number
  /** Kuryerdan oldingi manzillar orqali shu manzilgacha, km (to'g'ri chiziqlar). */
  viaKm: number
}

/**
 * Kuryer manzillarni qaysi tartibda aylanadi — eng yaqin qo'shni.
 *
 * Kuryer ilovasi (src/courier/route.ts) bundan tashqari 2-opt bilan
 * tekislaydi; bu yerda taxminiy vaqt uchun eng yaqin qo'shni yetarli.
 * Koordinatasi yo'q buyurtma rejaga kirmaydi.
 */
export function planStops(from: Point, stops: { id: string; point: Point | null }[]): Map<string, StopPlan> {
  const plan = new Map<string, StopPlan>()
  const left = stops.filter((s): s is { id: string; point: Point } => s.point !== null)
  let at = from
  let km = 0
  let index = 0
  while (left.length) {
    let best = 0
    for (let i = 1; i < left.length; i++) {
      if (distanceKm(at, left[i].point) < distanceKm(at, left[best].point)) best = i
    }
    const [next] = left.splice(best, 1)
    km += distanceKm(at, next.point)
    plan.set(next.id, { stopsBefore: index, viaKm: Math.round(km * 100) / 100 })
    at = next.point
    index++
  }
  return plan
}

/** Har oldingi manzilda qancha vaqt ketadi (to'xtash, topshirish), daqiqa. */
export const STOP_MINUTES = 6

/**
 * Taxminiy yetib kelish vaqti, daqiqa — marshrut bo'yicha.
 *
 * Masofa × 1.4 (ko'chalar egri) / 25 km/soat + 5 daqiqa (mashinani
 * qo'yish, eshikgacha) + har oldingi manzil uchun 6 daqiqa. 10 dan kam
 * va 180 dan ko'p ko'rsatilmaydi — mijozga «2 daqiqa» deb va'da berish
 * xavfli. src/lib/tracking.ts → liveMinutes bilan bir xil asos.
 */
export function etaFromPlan(plan: StopPlan): number {
  const minutes = Math.round((plan.viaKm * 1.4 * 60) / 25 + 5 + plan.stopsBefore * STOP_MINUTES)
  return Math.min(180, Math.max(10, minutes))
}

type OrderLite = { status?: string; userId?: number; customer?: { location?: Point | null } }

function orderPoint(order: OrderLite): Point | null {
  const loc = order.customer?.location
  return loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng) ? { lat: loc.lat, lng: loc.lng } : null
}

/** Kuryerning yo'ldagi buyurtmalari. */
async function activeOrders(uid: string) {
  const db = await adminDb()
  const snap = await db.collection('orders').where('courierId', '==', uid).where('status', '==', 'Yetkazilmoqda').get()
  return snap.docs.map((doc) => ({ id: doc.id, data: doc.data() as OrderLite }))
}

/**
 * Yo'ldagi har buyurtma mijozi uchun kuzatuv: kuryer qayerda va undan
 * oldin nechta manzil bor (mijoz boshqa mijozlarning joyini ko'rmaydi —
 * faqat soni va umumiy masofa).
 */
async function writeTracking(
  staff: Pick<Staff, 'uid' | 'name'> & { phone?: string | null },
  point: LocationPoint,
  source: LocationSource,
  at: string,
  orders: { id: string; data: OrderLite }[],
): Promise<number> {
  const db = await adminDb()
  const plan = planStops(point, orders.map((o) => ({ id: o.id, point: orderPoint(o.data) })))
  const batch = db.batch()
  let tracked = 0
  for (const order of orders) {
    if (!order.data.userId) continue
    const stop = plan.get(order.id)
    batch.set(db.collection('order_tracking').doc(order.id), {
      userId: order.data.userId,
      courierUid: staff.uid,
      courierName: staff.name,
      // Mijoz xaritasida ism yonida raqam — buyurtmada yozilmagan bo'lsa ham
      courierPhone: staff.phone ?? null,
      lat: point.lat,
      lng: point.lng,
      heading: point.heading ?? null,
      source,
      at,
      stopsBefore: stop?.stopsBefore ?? 0,
      viaKm: stop?.viaKm ?? null,
    })
    tracked++
  }
  if (tracked) await batch.commit()
  return tracked
}

/** Smena ochiqmi (00:00 da o'zi yopiladi). */
async function onShift(uid: string): Promise<boolean> {
  const snap = await (await adminDb()).collection('staff').doc(uid).get()
  return shiftActive((snap.data() || {}) as { onShift?: unknown; shiftSince?: unknown })
}

/**
 * Joylashuvni yozadi: kuryer hujjati va uning yo'ldagi har buyurtmasi
 * uchun kuzatuv hujjati.
 *
 * `liveUntil` — Telegram jonli ulashishi qachongacha (faqat `live`).
 * Ilova manbasi jonli ulashishni «bosib» ketmasin: jonli ulashish
 * yaqinda kelgan bo'lsa, ilova nuqtasi yozilmaydi.
 */
export async function saveCourierLocation(
  staff: Pick<Staff, 'uid' | 'name' | 'telegramId'> & { phone?: string | null },
  point: LocationPoint,
  source: LocationSource,
  liveUntil: string | null = null,
) {
  const db = await adminDb()
  const at = new Date().toISOString()
  const ref = db.collection('courier_locations').doc(staff.uid)
  // Xodimlar kartasidagi raqam, bo'lmasa botga ulashgan kontakt
  const phone = await courierPhone(staff)

  const orders = await activeOrders(staff.uid)
  // Dam olayotgan va yetkazadigani yo'q kuryerning joyi saqlanmaydi
  if (!orders.length && !(await onShift(staff.uid))) return { saved: false, reason: 'off_shift', tracked: 0 }

  if (source === 'app') {
    const prev = (await ref.get()).data() as { source?: string; at?: string } | undefined
    const recentLive = prev?.source === 'live' && Date.now() - Date.parse(prev.at || '') < 60_000
    if (recentLive) return { saved: false, reason: 'live', tracked: 0 }
  }

  await ref.set({
    uid: staff.uid,
    name: staff.name,
    telegramId: staff.telegramId ?? null,
    // Admin xaritasida qo'ng'iroq tugmasi — oddiy admin `staff` ni o'qiy olmaydi
    phone,
    lat: point.lat,
    lng: point.lng,
    accuracy: point.accuracy ?? null,
    heading: point.heading ?? null,
    speed: point.speed ?? null,
    source,
    at,
    ...(source === 'live' ? { liveUntil } : {}),
  }, { merge: true })

  const tracked = await writeTracking({ ...staff, phone }, point, source, at, orders)
  return { saved: true, tracked }
}

/** Mini app: ochiq turganda joylashuv (smenadagi kuryer). */
export async function courierLocation(staff: Staff, body: Body) {
  if (!canDeliver(staff)) throw new CodedError('COURIER_ONLY', 'Bu amal faqat kuryer uchun')
  return saveCourierLocation(staff, readPoint(body), 'app')
}

type StoredLocation = { lat?: number; lng?: number; heading?: number | null; source?: string; at?: string; name?: string }

/** So'nggi ma'lum joylashuv — 10 daqiqadan eski bo'lsa null. */
export async function lastKnownPoint(uid: string): Promise<(LocationPoint & { source: LocationSource; at: string }) | null> {
  const snap = await (await adminDb()).collection('courier_locations').doc(uid).get()
  const loc = snap.data() as StoredLocation | undefined
  if (!loc?.lat || !loc.lng || !loc.at || Date.now() - Date.parse(loc.at) > LOCATION_FRESH_MS) return null
  return {
    lat: loc.lat,
    lng: loc.lng,
    heading: loc.heading ?? null,
    source: loc.source === 'live' ? 'live' : 'app',
    at: loc.at,
  }
}

/**
 * Kuryerning buyurtmalari o'zgardi (oldi, yetkazdi, bekor bo'ldi) —
 * so'nggi ma'lum joyidan kuzatuv qayta yoziladi: yangi olingan
 * buyurtma mijozi kuryerni darhol ko'radi, qolganlarida «sizdan oldin
 * N ta manzil» yangilanadi.
 *
 * Smena tugagan va yetkazadigani qolmagan bo'lsa — joylashuv o'chadi.
 * Xato tashlamaydi.
 */
export async function refreshCourierTracking(uid: string) {
  try {
    const db = await adminDb()
    const orders = await activeOrders(uid)
    if (!orders.length) {
      if (!(await onShift(uid))) await db.collection('courier_locations').doc(uid).delete()
      return
    }
    const snap = await db.collection('courier_locations').doc(uid).get()
    const loc = snap.data() as StoredLocation | undefined
    const point = await lastKnownPoint(uid)
    if (!point) return
    const staff = ((await db.collection('staff').doc(uid).get()).data() || {}) as { phone?: string; telegramId?: number }
    const phone = await courierPhone(staff)
    await writeTracking({ uid, name: loc?.name || 'Kuryer', phone }, point, point.source, point.at, orders)
  } catch (error) {
    console.error('[location] kuzatuv yangilanmadi:', error)
  }
}

/**
 * Smena tugadi. Yo'lda buyurtma bo'lmasa, joylashuv admin xaritasidan
 * darhol o'chadi. Qaytaradi: Telegram jonli ulashishi hali yoniqmi —
 * shunda bot kuryerga uni to'xtatishni eslatadi (to'xtatishni faqat
 * kuryerning o'zi qila oladi).
 */
export async function endShiftLocation(uid: string): Promise<{ liveWasOn: boolean; cleared: boolean }> {
  const db = await adminDb()
  const ref = db.collection('courier_locations').doc(uid)
  const loc = (await ref.get()).data() as StoredLocation | undefined
  const liveWasOn = loc?.source === 'live' && Date.now() - Date.parse(loc.at || '') < LOCATION_FRESH_MS
  const busy = (await activeOrders(uid)).length > 0
  if (!busy && loc) await ref.delete()
  return { liveWasOn, cleared: !busy }
}

/** Buyurtma yopildi — mijoz kuryerning joyini endi ko'rmasin. */
export async function clearOrderTracking(orderId: string) {
  try {
    await (await adminDb()).collection('order_tracking').doc(orderId).delete()
  } catch (error) {
    console.error('[location] kuzatuv o‘chirilmadi:', error)
  }
}

/** Kuryer profili uchun: jonli ulashish holati. */
export async function locationStatus(uid: string) {
  const snap = await (await adminDb()).collection('courier_locations').doc(uid).get()
  const loc = snap.data() as { source?: string; at?: string; liveUntil?: string | null } | undefined
  if (!loc?.at) return { at: null, source: null, liveUntil: null }
  return { at: loc.at, source: loc.source ?? null, liveUntil: loc.liveUntil ?? null }
}
