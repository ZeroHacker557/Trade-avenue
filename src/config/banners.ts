/**
 * Bosh sahifa bannerlari (admin panel → «Bosh sahifa bannerlari»).
 *
 * `settings/home.banners` da saqlanadi. Ilovadagi asosiy banner
 * («Uydagidek ta'm — bir necha daqiqada») doim birinchi turadi; admin
 * qo'shgan faol bannerlar undan keyin karuselda almashadi.
 * Server: api/_lib/actions/home.ts.
 */

export type BannerLayout = 'side' | 'full'
export type BannerTheme = 'green' | 'yellow' | 'red' | 'blue' | 'dark' | 'cream'
export type BannerTarget = 'none' | 'catalog' | 'category' | 'section' | 'product' | 'url'

export type HomeBanner = {
  id: string
  active: boolean
  /** side — matn chapda, rasm o'ngda (asosiy banner kabi); full — rasm butun bannerda. */
  layout: BannerLayout
  theme: BannerTheme
  image: string
  badge: string
  badgeRu: string
  title: string
  titleRu: string
  subtitle: string
  subtitleRu: string
  cta: string
  ctaRu: string
  target: BannerTarget
  /** Kategoriya nomi, bo'lim id'si yoki mahsulot id'si — `target` ga qarab. */
  value: string
  url: string
}

export const BANNER_THEMES: Record<BannerTheme, { label: string; bg: string; ink: string; ctaBg: string; ctaInk: string; badgeBg: string; badgeInk: string }> = {
  green: {
    label: 'Yashil',
    bg: 'radial-gradient(120% 90% at 78% 45%, rgb(242 201 76 / 0.26) 0%, transparent 60%), linear-gradient(135deg, #0a7a3d 0%, #04331c 100%)',
    ink: '#ffffff', ctaBg: '#ffffff', ctaInk: '#056130', badgeBg: '#ffffff', badgeInk: '#056130',
  },
  yellow: {
    label: 'Sariq',
    bg: 'radial-gradient(120% 90% at 78% 45%, rgb(255 255 255 / 0.35) 0%, transparent 60%), linear-gradient(135deg, #ffd84d 0%, #f2a900 100%)',
    ink: '#10231a', ctaBg: '#0a7a3d', ctaInk: '#ffffff', badgeBg: '#10231a', badgeInk: '#ffd84d',
  },
  red: {
    label: 'Qizil',
    bg: 'radial-gradient(120% 90% at 78% 45%, rgb(255 190 120 / 0.3) 0%, transparent 60%), linear-gradient(135deg, #e8453c 0%, #7f110d 100%)',
    ink: '#ffffff', ctaBg: '#ffd43b', ctaInk: '#10231a', badgeBg: '#ffffff', badgeInk: '#b3261e',
  },
  blue: {
    label: 'Ko‘k',
    bg: 'radial-gradient(120% 90% at 78% 45%, rgb(120 200 255 / 0.3) 0%, transparent 60%), linear-gradient(135deg, #2f80ed 0%, #0b2e73 100%)',
    ink: '#ffffff', ctaBg: '#ffffff', ctaInk: '#0b3d91', badgeBg: '#ffd43b', badgeInk: '#10231a',
  },
  dark: {
    label: 'To‘q',
    bg: 'radial-gradient(120% 90% at 78% 45%, rgb(242 201 76 / 0.2) 0%, transparent 60%), linear-gradient(135deg, #1f2a33 0%, #0a0f14 100%)',
    ink: '#ffffff', ctaBg: '#ffd43b', ctaInk: '#10231a', badgeBg: '#ffd43b', badgeInk: '#10231a',
  },
  cream: {
    label: 'Krem',
    bg: 'radial-gradient(120% 90% at 78% 45%, rgb(255 255 255 / 0.6) 0%, transparent 60%), linear-gradient(135deg, #fff8e7 0%, #fde2a4 100%)',
    ink: '#10231a', ctaBg: '#0a7a3d', ctaInk: '#ffffff', badgeBg: '#0a7a3d', badgeInk: '#ffffff',
  },
}

const LAYOUTS: BannerLayout[] = ['side', 'full']
const TARGETS: BannerTarget[] = ['none', 'catalog', 'category', 'section', 'product', 'url']
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '')

/** Bazadagi xom ro'yxat → toza bannerlar (noma'lum qiymatlar standartga tushadi). */
export function readBanners(value: unknown): HomeBanner[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((b): b is Record<string, unknown> => Boolean(b) && typeof b === 'object')
    .map((b, i) => ({
      id: str(b.id, 40) || `b${i}`,
      active: b.active !== false,
      layout: LAYOUTS.includes(b.layout as BannerLayout) ? (b.layout as BannerLayout) : 'side',
      theme: (b.theme as BannerTheme) in BANNER_THEMES ? (b.theme as BannerTheme) : 'green',
      image: str(b.image, 1000),
      badge: str(b.badge, 40),
      badgeRu: str(b.badgeRu, 40),
      title: str(b.title, 90),
      titleRu: str(b.titleRu, 90),
      subtitle: str(b.subtitle, 140),
      subtitleRu: str(b.subtitleRu, 140),
      cta: str(b.cta, 30),
      ctaRu: str(b.ctaRu, 30),
      target: TARGETS.includes(b.target as BannerTarget) ? (b.target as BannerTarget) : 'catalog',
      value: str(b.value, 200),
      url: str(b.url, 500),
    }))
}

/** Tilga qarab matn: ruscha bo'lmasa o'zbekchasi. */
export const pickLang = (uz: string, ru: string, lang: string) => (lang === 'ru' && ru.trim() ? ru : uz)
