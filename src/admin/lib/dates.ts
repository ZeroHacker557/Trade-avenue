/**
 * Sana ko'rinishi. Brauzerning `uz-UZ` formati bir xil emas («2026 M09 28»,
 * «09-29»), shuning uchun o'zimiz yozamiz.
 */
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr']
const two = (n: number) => String(n).padStart(2, '0')

/** «29.09 21:18» */
export function shortDate(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return `${two(d.getDate())}.${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`
}

/** «28-sentabr 2026, 18:19» */
export function longDate(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getDate()}-${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${two(d.getHours())}:${two(d.getMinutes())}`
}

/** «01.10.2026 14:05» */
export function dateTime(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return `${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}`
}

/** «5 daqiqa oldin», «3 soat oldin», «2 kun oldin» */
export function ago(value: string | null | undefined, now = Date.now()): string {
  const t = value ? Date.parse(value) : NaN
  if (!Number.isFinite(t)) return ''
  const m = Math.max(0, Math.round((now - t) / 60000))
  if (m < 1) return 'hozirgina'
  if (m < 60) return `${m} daqiqa oldin`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} soat oldin`
  const d = Math.round(h / 24)
  return d < 31 ? `${d} kun oldin` : `${Math.round(d / 30)} oy oldin`
}
