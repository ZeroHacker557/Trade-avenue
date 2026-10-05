import { adminDb } from '../firebase-admin.js'
import type { Staff } from '../admin-auth.js'

/**
 * Bosh sahifa bannerlari — `settings/home.banners`.
 *
 * Ilovadagi asosiy banner kodda turadi va doim birinchi; bu yerdagilar
 * undan keyin karuselda almashadi (src/components/home/HeroCarousel.tsx).
 * Ro'yxat butunligicha saqlanadi — tartib ham shu ro'yxatdagi tartib.
 * Tur va o'qish: src/config/banners.ts.
 */

const MAX = 10
const LAYOUTS = ['side', 'full']
const THEMES = ['green', 'yellow', 'red', 'blue', 'dark', 'cream']
const TARGETS = ['none', 'catalog', 'category', 'section', 'product', 'url']

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

function readBanner(raw: unknown, index: number) {
  const b = (raw ?? {}) as Record<string, unknown>
  const n = index + 1
  const image = str(b.image, 1000)
  if (image && !/^https:\/\/\S+$/i.test(image)) throw new Error(`${n}-banner: rasm havolasi noto‘g‘ri`)
  const layout = LAYOUTS.includes(String(b.layout)) ? String(b.layout) : 'side'
  if (layout === 'full' && !image) throw new Error(`${n}-banner: «To‘liq rasm» uchun rasm yuklang`)

  const title = str(b.title, 90)
  if (!title && !image) throw new Error(`${n}-banner: sarlavha yoki rasm kerak`)

  const target = TARGETS.includes(String(b.target)) ? String(b.target) : 'catalog'
  const value = str(b.value, 200)
  const url = str(b.url, 500)
  if (['category', 'section', 'product'].includes(target) && !value) throw new Error(`${n}-banner: qayerni ochishini tanlang`)
  if (target === 'url' && !/^https?:\/\/\S+$/i.test(url)) throw new Error(`${n}-banner: havola https:// bilan boshlansin`)

  const id = /^[\w-]{1,40}$/.test(String(b.id)) ? String(b.id) : `b${Date.now().toString(36)}${index}`
  return {
    id,
    active: b.active !== false,
    layout,
    theme: THEMES.includes(String(b.theme)) ? String(b.theme) : 'green',
    image,
    badge: str(b.badge, 40),
    badgeRu: str(b.badgeRu, 40),
    title,
    titleRu: str(b.titleRu, 90),
    subtitle: str(b.subtitle, 140),
    subtitleRu: str(b.subtitleRu, 140),
    cta: str(b.cta, 30),
    ctaRu: str(b.ctaRu, 30),
    target,
    value: ['category', 'section', 'product'].includes(target) ? value : '',
    url: target === 'url' ? url : '',
  }
}

export async function homeBannersSave(actor: Staff, body: Record<string, unknown>) {
  const list = Array.isArray(body.banners) ? body.banners : []
  if (list.length > MAX) throw new Error(`Ko‘pi bilan ${MAX} ta banner`)
  const banners = list.map(readBanner)
  await (await adminDb()).collection('settings').doc('home').set(
    { banners, updatedAt: new Date().toISOString(), updatedBy: actor.name || actor.email },
    { merge: true },
  )
  return { banners }
}
