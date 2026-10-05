import { apiPost } from '../lib/api'

/** Server qaytaradigan buyurtma — api/_lib/actions/courier.ts → present(). */
export type CourierOrder = {
  id: string
  number: string
  status: string
  createdAt: string | null
  takenAt: string | null
  deliveredAt: string | null
  /** Admin aynan shu kuryerga biriktirgan. */
  assignedToMe: boolean
  customer: {
    name: string
    phone: string
    address: string
    comment: string
    recipientName: string
    recipientPhone: string
    location: { lat: number; lng: number } | null
  }
  /** `image` — kichik nusxa (~480px), faqat tafsilotlar oynasida ko'rinadi. */
  items: {
    name: string
    quantity: number
    price: number
    size: string | null
    image: string | null
    /** Set bo'lsa — tarkibi (nimani yig'ish kerak). */
    bundle?: { name: string; quantity: number }[]
  }[]
  total: number
  paymentMethod: string
  /** Toshkent sanasi — chek raqami har kuni #0001 dan boshlanadi. */
  orderDay: string | null
  subtotal: number
  discount: number
  promoCode: string | null
  deliveryFee: number
  paymentStatus: string | null
  courierName: string | null
  /** «Yetib keldim» bosilgan vaqt — mijozga xabar ketgan. */
  arrivedAt: string | null
  etaAt: string | null
  /** Naqd pul: kuryerda / topshirilgan / kassa qabul qilgan. */
  cashStatus: 'held' | 'pending' | 'settled' | null
  /** Bosilgan muammo tugmalari (kod). */
  problems: string[]
}

export type CashHandover = {
  id: string
  amount: number
  count: number
  status: 'pending' | 'confirmed' | 'rejected'
  createdAt: string
  decidedAt: string | null
  note: string | null
}

export type CourierCash = {
  held: { amount: number; count: number }
  pending: { amount: number; count: number }
  handovers: CashHandover[]
}

export type CourierReview = { number: string; at: string | null; stars: number; tags: string[]; comment: string }

export type CourierBucket = { delivered: number; cash: number; card: number }

export type CourierOverview = {
  profile: {
    name: string
    phone: string | null
    telegramId: number | null
    /** Smena: «Ishdaman» — yangi buyurtma xabarlari keladi. */
    onShift: boolean
    rating: { count: number; average: number | null }
  }
  reviews: CourierReview[]
  cash: CourierCash
  /** Oxirgi joylashuv: `live` — Telegram jonli ulashishi, `app` — ochiq ilova. */
  location: { at: string | null; source: 'live' | 'app' | null; liveUntil: string | null }
  available: CourierOrder[]
  active: CourierOrder[]
  done: CourierOrder[]
  recent: CourierOrder[]
  stats: { today: CourierBucket; week: CourierBucket; month: CourierBucket; total: number }
  serverTime: string
}

export type TakeOutcome = 'claimed' | 'already' | 'taken' | 'closed' | 'not_found'
export type DeliverOutcome = 'done' | 'already' | 'not_yours' | 'closed' | 'not_found'
export type ProblemCode = 'no_answer' | 'no_address' | 'refused'

/**
 * Faqat `vite dev` da: `?courierDemo` bilan kuryer sahifasini soxta
 * ma'lumot bilan ko'rish. Productionda bu shox butunlay kesib tashlanadi.
 */
export const DEMO = import.meta.env.DEV && new URLSearchParams(location.search).has('courierDemo')

export async function fetchOverview(): Promise<CourierOverview> {
  if (DEMO) return (await import('./demo')).demoOverview()
  return apiPost<CourierOverview>('/api/courier', { action: 'overview' })
}

/**
 * Buyurtmani olish. Joylashuv berilsa, server mijozga «taxminan 15
 * daqiqada» deb yozadi.
 */
export async function takeOrder(
  orderId: string,
  point: { lat: number; lng: number } | null = null,
): Promise<{ outcome: TakeOutcome; courierName: string | null; etaMinutes?: number | null }> {
  if (DEMO) return (await import('./demo')).demoTake(orderId)
  return apiPost('/api/courier', { action: 'take', orderId, ...(point ?? {}) })
}

/** «Yetib keldim» — mijozga «Kuryer eshik oldida» xabari. */
export async function arriveOrder(orderId: string): Promise<{ outcome: string }> {
  if (DEMO) return (await import('./demo')).demoArrive(orderId)
  return apiPost('/api/courier', { action: 'arrived', orderId })
}

export async function setShift(on: boolean): Promise<{ onShift: boolean }> {
  if (DEMO) return (await import('./demo')).demoShift(on)
  return apiPost('/api/courier', { action: 'shift', on })
}

export async function reportProblem(
  orderId: string,
  code: ProblemCode,
): Promise<{ threadId: string; customerNotified: boolean }> {
  if (DEMO) return (await import('./demo')).demoProblem(orderId, code)
  return apiPost('/api/courier', { action: 'problem', orderId, code })
}

/** Ochiq ilova joylashuvi — admin xaritasi va mijoz kuzatuvi uchun. */
export async function sendLocation(point: { lat: number; lng: number }): Promise<void> {
  if (DEMO) return
  await apiPost('/api/courier', { action: 'location', ...point })
}

export async function handOverCash(): Promise<{ amount: number; count: number }> {
  if (DEMO) return (await import('./demo')).demoHandover()
  return apiPost('/api/courier', { action: 'cash.handover' })
}

export async function deliverOrder(orderId: string): Promise<{ outcome: DeliverOutcome }> {
  if (DEMO) return (await import('./demo')).demoDeliver(orderId)
  return apiPost('/api/courier', { action: 'deliver', orderId })
}
