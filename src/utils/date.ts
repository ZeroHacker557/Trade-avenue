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

const DAY_NAMES: Record<'uz' | 'ru', string[]> = {
  uz: ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'],
  ru: ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'],
}
const DAY_SHORT: Record<'uz' | 'ru', string[]> = {
  uz: ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'],
  ru: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
}
const MONTH_FULL: Record<'uz' | 'ru', string[]> = {
  uz: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
}

/** Yetkazish sanasi «2026-10-07» → «7-oktabr, chorshanba» / «7 октября, среда». */
export function formatDeliveryDay(day: string | undefined, lang: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day ?? '')
  if (!match) return day ?? ''
  const l = lang === 'ru' ? 'ru' : 'uz'
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  const month = MONTH_FULL[l][date.getUTCMonth()]
  const weekday = DAY_NAMES[l][date.getUTCDay()]
  return l === 'ru' ? `${date.getUTCDate()} ${month}, ${weekday}` : `${date.getUTCDate()}-${month}, ${weekday}`
}

/** Hafta kunlari qisqa: [2, 4] → «Se, Pa». */
export function formatWeekdays(days: number[], lang: string): string {
  const l = lang === 'ru' ? 'ru' : 'uz'
  // Dushanbadan boshlab tartiblanadi
  return [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DAY_SHORT[l][d]).join(', ')
}
