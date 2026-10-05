/**
 * Ochilish reklamasi — ilova ochilganda butun ekranni egallaydigan
 * 1–5 slayd (rasm yoki video), har birida ixtiyoriy havola tugmasi.
 *
 * Firestore: `ads/splash` (bitta hujjat). O'qish hammaga ochiq,
 * yozish faqat /api/admin/action (`ad.save`) orqali.
 *
 * Bu modul mijoz ilovasi ham, admin panel ham ishlatadi: o'qish
 * qoidasi va «qachon ko'rsatiladi» mantig'i ikkalasida bir xil bo'lsin.
 */

export type AdLink =
  | { kind: 'url'; url: string }
  /** `category` = ALL_CATEGORIES — butun katalog («Barchasi»). */
  | { kind: 'category'; category: string }
  /** Bo'lim — katalog o'sha bo'lim turgan kategoriyada ochilib, bo'limga suriladi. */
  | { kind: 'section'; sectionId: string }
  | { kind: 'product'; productId: string }

/**
 * «Barchasi» — butun katalog. Tarjima («Barchasi»/«Все») emas, belgi
 * saqlanadi: reklama qaysi tilda ochilsa ham bir xil ishlashi uchun.
 */
export const ALL_CATEGORIES = '*'

export type AdSlide = {
  id: string
  type: 'image' | 'video'
  url: string
  /** Rasm necha soniya turadi. Video o'z uzunligicha o'ynaydi. */
  seconds: number
  /** `textRu` bo'sh bo'lsa ruscha tilda ham o'zbekcha matn ko'rinadi. */
  button: { text: string; textRu?: string; link: AdLink } | null
}

/**
 * Qanchalik tez-tez chiqadi:
 *   always — ilova har ochilganda;
 *   daily  — kuniga bir marta;
 *   once   — bir marta (reklama o'zgartirilsa yana bir marta).
 */
export type AdFrequency = 'always' | 'daily' | 'once'

export type SplashAd = {
  active: boolean
  slides: AdSlide[]
  frequency: AdFrequency
  /** Reklama har saqlanganda yangilanadi — «once» shu bo'yicha qayta ko'rsatadi. */
  version: string
}

export const AD_LIMITS = {
  maxSlides: 5,
  minSeconds: 3,
  maxSeconds: 15,
  defaultSeconds: 5,
  /** Video shundan uzun bo'lsa ham shu vaqtda keyingi slaydga o'tiladi. */
  maxVideoSeconds: 30,
  buttonText: 28,
} as const

export const EMPTY_AD: SplashAd = { active: false, slides: [], frequency: 'daily', version: '' }

const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

/** https:// yoki t.me havolasi — boshqa sxemalar (javascript: va h.k.) qabul qilinmaydi. */
export function isSafeUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function readLink(raw: unknown): AdLink | null {
  const data = (raw ?? {}) as Record<string, unknown>
  const kind = str(data.kind)
  if (kind === 'url' && isSafeUrl(str(data.url))) return { kind, url: str(data.url) }
  if (kind === 'category' && str(data.category)) return { kind, category: str(data.category) }
  if (kind === 'section' && str(data.sectionId)) return { kind, sectionId: str(data.sectionId) }
  if (kind === 'product' && str(data.productId)) return { kind, productId: str(data.productId) }
  return null
}

function readSlide(raw: unknown, index: number): AdSlide | null {
  const data = (raw ?? {}) as Record<string, unknown>
  const type = data.type === 'video' ? 'video' : data.type === 'image' ? 'image' : null
  const url = str(data.url)
  if (!type || !isSafeUrl(url)) return null

  const seconds = Math.round(Number(data.seconds))
  const button = (data.button ?? null) as Record<string, unknown> | null
  const link = button ? readLink(button.link) : null
  const text = button ? str(button.text).slice(0, AD_LIMITS.buttonText) : ''
  const textRu = button ? str(button.textRu).slice(0, AD_LIMITS.buttonText) : ''

  return {
    id: str(data.id) || `s${index}`,
    type,
    url,
    seconds: Number.isFinite(seconds)
      ? Math.min(AD_LIMITS.maxSeconds, Math.max(AD_LIMITS.minSeconds, seconds))
      : AD_LIMITS.defaultSeconds,
    button: link && text ? { text, ...(textRu ? { textRu } : {}), link } : null,
  }
}

/** Firestore hujjatini xavfsiz shaklga keltiradi — buzuq slayd tashlab yuboriladi. */
export function readSplashAd(raw: unknown): SplashAd {
  const data = (raw ?? {}) as Record<string, unknown>
  const slides = (Array.isArray(data.slides) ? data.slides : [])
    .map(readSlide)
    .filter((s): s is AdSlide => s !== null)
    .slice(0, AD_LIMITS.maxSlides)
  const frequency = (['always', 'daily', 'once'] as const).find((f) => f === data.frequency) ?? 'daily'
  return { active: data.active === true, slides, frequency, version: str(data.version) }
}

/* ── Qachon ko'rsatiladi ─────────────────────────────────── */

const SEEN_KEY = 'musaAdSeen'

type Seen = { version: string; day: string }

const today = () => new Date().toDateString()

export function shouldShowAd(ad: SplashAd): boolean {
  if (!ad.active || ad.slides.length === 0) return false
  if (ad.frequency === 'always') return true
  let seen: Seen | null = null
  try {
    seen = JSON.parse(localStorage.getItem(SEEN_KEY) || 'null') as Seen | null
  } catch {
    // Xotira yopiq — ko'rsatamiz, lekin eslab qolmaymiz
  }
  if (!seen) return true
  if (ad.frequency === 'once') return seen.version !== ad.version
  return seen.day !== today() || seen.version !== ad.version
}

export function markAdSeen(ad: SplashAd) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify({ version: ad.version, day: today() } satisfies Seen))
  } catch {
    // Xotira yopiq — keyingi safar yana chiqadi, bu xato emas
  }
}
