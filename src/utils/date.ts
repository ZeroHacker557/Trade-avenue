// Sana yordamchilari.
// Baza'da hamma sanalar ISO 8601 formatida saqlanadi. Eski yozuvlarda
// formatlangan matn ("22.08.2026", "22 Aug, 14:30") uchraydi — ular
// buzilmasligi uchun parse qila olmagan qiymat o'zgarishsiz qaytariladi.

const MONTHS = ['yan', 'fev', 'mar', 'apr', 'may', 'iyun', 'iyul', 'avg', 'sen', 'okt', 'noy', 'dek']

/** Saralash uchun: ISO yoki eski dd.mm.yyyy formatini millisekundga aylantiradi. */
export function parseDate(value?: string): number {
  if (!value) return 0

  const iso = Date.parse(value)
  if (!Number.isNaN(iso)) return iso

  // Eski format: "22.08.2026"
  const legacy = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (legacy) {
    const parsed = Date.parse(`${legacy[3]}-${legacy[2]}-${legacy[1]}T00:00:00`)
    if (!Number.isNaN(parsed)) return parsed
  }

  return 0
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** "23 avg, 14:05" */
export function formatDateTime(value?: string): string {
  const ms = parseDate(value)
  if (!ms) return value ?? ''
  const d = new Date(ms)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "23 avg 2026" */
export function formatDate(value?: string): string {
  const ms = parseDate(value)
  if (!ms) return value ?? ''
  const d = new Date(ms)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** Buyurtma kartochkasi uchun: "23 avg, 2026 • 14:05" */
export function formatOrderDate(value?: string): string {
  const ms = parseDate(value)
  if (!ms) return value ?? ''
  const d = new Date(ms)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${d.getFullYear()} • ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "14:05" — bo'sh yoki noto'g'ri qiymatda bo'sh qator. */
export function formatTime(value?: string | null): string {
  const ms = parseDate(value ?? undefined)
  if (!ms) return ''
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
