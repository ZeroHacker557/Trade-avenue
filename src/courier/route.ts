/**
 * Kuryer marshruti — buyurtmalarni bir-biriga YAQINLIGI bo'yicha tartiblash.
 *
 * Maqsad: 1 km'dan keyin 30 km emas, 5 km kelsin. Ya'ni har bir keyingi
 * manzil oldingisiga imkon qadar yaqin bo'lsin va kuryer shahar bo'ylab
 * u yoqdan-bu yoqqa sakrab yurmasin.
 *
 *   1. Eng yaqin qo'shni — turgan joydan eng yaqin manzil, undan keyin
 *      qolganlarning ichidan unga eng yaqini va hokazo.
 *   2. 2-opt — bir-birini kesib o'tgan yo'llarni «yechadi». Eng yaqin
 *      qo'shni ba'zan oxirida uzoq qaytishga majbur qiladi; 2-opt
 *      ketma-ketlikni teskari aylantirib umumiy yo'lni qisqartiradi.
 *
 * Masofa — to'g'ri chiziq (haversine). Yo'l tarmog'i hisobga olinmaydi,
 * lekin shahar ichida tartib uchun bu yetarli va tashqi API kerak emas.
 */

export type Point = { lat: number; lng: number }

const EARTH_KM = 6371

/** Ikki nuqta orasidagi masofa, km. */
export function distanceKm(a: Point, b: Point): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

export type RouteStop<T> = {
  item: T
  /**
   * Oldingi nuqtadan masofa, km. Birinchi to'xtashda — kuryerning
   * joyidan (joylashuv ma'lum bo'lsa). Koordinatasi yo'q buyurtmada null.
   */
  legKm: number | null
}

export type RoutePlan<T> = {
  stops: RouteStop<T>[]
  /** Butun yo'l, km (koordinatasizlar hisobga kirmaydi). */
  totalKm: number
}

/**
 * Marshrut tuzadi.
 *
 * `items` kelgan tartibi muhim: joylashuv noma'lum bo'lsa yo'l birinchi
 * elementdan boshlanadi (chaqiruvchi eng eskisini birinchi beradi).
 * Koordinatasi yo'q buyurtmalar oxiriga, o'z tartibida qo'shiladi.
 */
export function planRoute<T>(
  items: T[],
  pointOf: (item: T) => Point | null,
  start: Point | null,
): RoutePlan<T> {
  const located = items.filter((item) => pointOf(item))
  const unlocated = items.filter((item) => !pointOf(item))

  // ── 1. Eng yaqin qo'shni ──
  const left = [...located]
  const path: T[] = []
  let current: Point | null = start
  if (!current && left.length) {
    const first = left.shift() as T
    path.push(first)
    current = pointOf(first)
  }
  while (left.length && current) {
    let best = 0
    let bestKm = Infinity
    for (let i = 0; i < left.length; i++) {
      const km = distanceKm(current, pointOf(left[i]) as Point)
      if (km < bestKm) {
        bestKm = km
        best = i
      }
    }
    const [next] = left.splice(best, 1)
    path.push(next)
    current = pointOf(next)
  }

  // ── 2. 2-opt ──
  // Birinchi nuqta (kuryerning joyi yoki boshlang'ich buyurtma) qimirlamaydi,
  // yo'l ochiq — oxiridan boshga qaytilmaydi.
  const fixed = start ? [start] : []
  const points = () => [...fixed, ...path.map((item) => pointOf(item) as Point)]
  const offset = fixed.length
  const d = (a: Point | undefined, b: Point | undefined) => (a && b ? distanceKm(a, b) : 0)

  let improved = true
  let guard = 0
  while (improved && guard++ < 50) {
    improved = false
    const p = points()
    // i — teskari aylantiriladigan bo'lakning boshi (birinchi nuqtadan keyin)
    for (let i = 1; i < p.length - 1; i++) {
      for (let k = i + 1; k < p.length; k++) {
        const before = d(p[i - 1], p[i]) + d(p[k], p[k + 1])
        const after = d(p[i - 1], p[k]) + d(p[i], p[k + 1])
        if (after < before - 1e-9) {
          // path indekslari: p dagi indeks - offset
          const a = i - offset
          const b = k - offset
          const segment = path.slice(a, b + 1).reverse()
          path.splice(a, segment.length, ...segment)
          improved = true
          break
        }
      }
      if (improved) break
    }
  }

  // ── Masofalar ──
  const stops: RouteStop<T>[] = []
  let prev: Point | null = start
  let totalKm = 0
  for (const item of path) {
    const point = pointOf(item) as Point
    const legKm = prev ? distanceKm(prev, point) : null
    if (legKm !== null) totalKm += legKm
    stops.push({ item, legKm })
    prev = point
  }
  for (const item of unlocated) stops.push({ item, legKm: null })

  return { stops, totalKm }
}

/** «850 m», «1,2 km», «12 km». */
export function formatKm(km: number, lang: 'uz' | 'ru' = 'uz'): string {
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} ${lang === 'ru' ? 'м' : 'm'}`
  const value = km < 10 ? km.toFixed(1).replace('.', ',') : String(Math.round(km))
  return `${value} ${lang === 'ru' ? 'км' : 'km'}`
}

/* ─── Xarita havolalari ─────────────────────────────────────── */

const coord = (p: Point) => `${p.lat},${p.lng}`

/** Bitta manzilga Google Maps yo'nalishi. */
export function googleRouteTo(point: Point): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${coord(point)}&travelmode=driving`
}

/** Bitta manzilga Yandex xaritasi yo'nalishi (joriy joydan). */
export function yandexRouteTo(point: Point): string {
  return `https://yandex.uz/maps/?rtext=~${coord(point)}&rtt=auto`
}

/**
 * Bir nechta to'xtashli marshrut.
 *
 * Google telefonda ko'pi bilan 3 ta oraliq nuqtani qabul qiladi, shuning
 * uchun keyingi 4 ta manzil beriladi. Yandex cheklamaydi — hammasi.
 */
export const GOOGLE_MAX_STOPS = 4

export function googleMultiRoute(points: Point[]): string | null {
  const stops = points.slice(0, GOOGLE_MAX_STOPS)
  if (!stops.length) return null
  const destination = stops[stops.length - 1]
  const waypoints = stops.slice(0, -1).map(coord).join('|')
  return (
    `https://www.google.com/maps/dir/?api=1&destination=${coord(destination)}&travelmode=driving` +
    (waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : '')
  )
}

export function yandexMultiRoute(points: Point[]): string | null {
  if (!points.length) return null
  // Boshidagi «~» — joriy joylashuvdan boshlash
  return `https://yandex.uz/maps/?rtext=~${points.map(coord).join('~')}&rtt=auto`
}
