/**
 * Chek raqami har kuni #0001 dan boshlanadi (api/_lib/order-number.ts),
 * shuning uchun raqam yonida doim to'liq sana yuradi: «#0005 · 23.09.2026».
 * Aks holda kechagi #0005 bugungisi bilan adashib ketardi.
 */

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** Toshkent bo'yicha bugungi sana: «2026-09-24». */
export function tashkentToday(now = Date.now()): string {
  return new Date(now + TASHKENT_OFFSET_MS).toISOString().slice(0, 10)
}

/** «2026-09-23» → «23.09». */
export function shortDay(day: string): string {
  return `${day.slice(8, 10)}.${day.slice(5, 7)}`
}

/** «2026-09-23» → «23.09.2026». */
export function fullDay(day: string): string {
  return `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`
}

/**
 * «#0005 · 23.09.2026». `orderDay` bo'lmasa (eski yoki endigina yaratilgan
 * buyurtma) kun `createdAt` dan Toshkent vaqti bilan olinadi.
 */
export function datedNumber(number: string, orderDay: string | null | undefined, createdAt?: string | null): string {
  let day = orderDay && DAY_RE.test(orderDay) ? orderDay : ''
  if (!day && createdAt) {
    const t = Date.parse(createdAt)
    if (Number.isFinite(t)) day = tashkentToday(t)
  }
  return day ? `${number} · ${fullDay(day)}` : number
}
