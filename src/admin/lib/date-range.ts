/**
 * Sana oraliqlari — buyurtmalarni kun bo'yicha filtrlash uchun.
 *
 * Komponentdan ajratilgan: React Fast Refresh faqat komponent
 * eksport qiladigan fayllarda ishlaydi.
 */
export type Range = 'today' | 'week' | 'month' | 'all' | string

/** Sana kaliti: ISO ning kun qismi, mahalliy vaqt bo'yicha. */
export function dayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Buyurtma shu oraliqqa kiradimi. */
export function inRange(createdAt: string, range: Range): boolean {
  if (range === 'all') return true

  const time = Date.parse(createdAt)
  if (!Number.isFinite(time)) return false

  // Aniq sana tanlangan
  if (range.includes('-')) return dayKey(new Date(time)) === range

  const start = new Date()
  start.setHours(0, 0, 0, 0)
  if (range === 'week') start.setDate(start.getDate() - 6)
  if (range === 'month') start.setDate(start.getDate() - 29)
  return time >= start.getTime()
}
