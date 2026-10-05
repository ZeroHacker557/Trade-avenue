/*
 * Chek raqami KUNLIK: har kuni Toshkent vaqti bilan 00:00 da #0001 dan
 * qayta boshlanadi. Har kunning o'z hisoblagichi bor
 * (`counters/orders-2026-09-23`), shuning uchun kun almashganda hech
 * narsani «nolga tushirish» kerak emas — yangi sana yangi hujjat.
 *
 * Raqam kunlar orasida takrorlanadi, buyurtmaning haqiqiy kaliti esa
 * hujjat identifikatori. Qaysi kunniki ekanini `orderDay` aytadi.
 */
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000

/** Toshkent bo'yicha sana: «2026-09-23». */
export function tashkentDay(date = new Date()): string {
  return new Date(date.getTime() + TASHKENT_OFFSET_MS).toISOString().slice(0, 10)
}

/** 7 → «#0007». 9999 dan oshsa ham kesilmaydi: «#10000». */
export function formatDailyNumber(n: number): string {
  return `#${String(n).padStart(4, '0')}`
}

/** «2026-09-23» → «23.09.2026». Noto'g'ri qiymatda bo'sh satr. */
export function fullDay(day: string | null | undefined): string {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return ''
  return `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`
}

/**
 * Xabarlardagi buyurtma yorlig'i: «#0005 · 23.09.2026». Raqam har kuni
 * takrorlanadi, shuning uchun doim to'liq sana bilan — aks holda kechagi
 * #0005 bugungisi bilan adashib ketardi.
 */
export function orderLabel(
  order: { orderNumber?: string | null; orderDay?: string | null; createdAt?: string | null },
  id: string,
): string {
  const number = order.orderNumber || `#${id.slice(0, 6)}`
  const created = order.createdAt ? Date.parse(order.createdAt) : NaN
  const day = fullDay(order.orderDay) || (Number.isFinite(created) ? fullDay(tashkentDay(new Date(created))) : '')
  return day ? `${number} · ${day}` : number
}
