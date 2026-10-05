/**
 * Vaqtli aksiyalar — narx hisoblash qoidasi.
 *
 * ⚠️ Xuddi shu qoida mini appda ham bor: src/utils/promotions.ts.
 * Ikkalasi BIR XIL bo'lishi shart — ilova ko'rsatgan narx server
 * hisoblagan narx bilan mos kelmasa, mijoz savatda bir summani ko'rib,
 * buyurtmada boshqasini oladi. Bu faylni o'zgartirsangiz, u yerni ham.
 *
 * Server yolg'iz o'zi hal qiladi: mijoz «menga aksiya bor» deb ayta
 * olmaydi, narx doim shu yerda Firestore'dagi aksiyalardan hisoblanadi.
 */

export type Promotion = {
  id: string
  title: string
  percent: number
  target: 'all' | 'category' | 'section' | 'products'
  /** Kategoriya nomlari / bo'lim identifikatorlari / mahsulot identifikatorlari. */
  targetIds: string[]
  startsAt: string
  endsAt: string
  active: boolean
}

type ProductLike = { id: string; category?: string; sectionId?: string | null }

export function isRunning(promo: Promotion, now = Date.now()): boolean {
  const start = Date.parse(promo.startsAt)
  const end = Date.parse(promo.endsAt)
  return promo.active && Number.isFinite(start) && Number.isFinite(end) && start <= now && now < end
}

function matches(promo: Promotion, product: ProductLike): boolean {
  if (promo.target === 'all') return true
  if (promo.target === 'category') return promo.targetIds.includes(String(product.category ?? ''))
  if (promo.target === 'section') return Boolean(product.sectionId) && promo.targetIds.includes(String(product.sectionId))
  return promo.targetIds.includes(String(product.id))
}

/** Mahsulotga hozir amal qilayotgan eng katta aksiya (bir nechtasi bo'lsa). */
export function bestPromotion(promos: Promotion[], product: ProductLike, now = Date.now()): Promotion | null {
  let best: Promotion | null = null
  for (const promo of promos) {
    if (!isRunning(promo, now) || !matches(promo, product)) continue
    if (!best || promo.percent > best.percent) best = promo
  }
  return best
}

/** Aksiyadagi narx — butun so'mga yuvarlanadi. */
export const promoPrice = (price: number, percent: number) => Math.max(0, Math.round((price * (100 - percent)) / 100))

export function readPromotion(id: string, data: Record<string, unknown>): Promotion {
  const target = String(data.target)
  return {
    id,
    title: String(data.title || ''),
    percent: Math.min(90, Math.max(0, Number(data.percent) || 0)),
    target: target === 'category' || target === 'section' || target === 'products' ? target : 'all',
    targetIds: Array.isArray(data.targetIds) ? data.targetIds.map(String) : [],
    startsAt: String(data.startsAt || ''),
    endsAt: String(data.endsAt || ''),
    active: data.active !== false,
  }
}
