import type { Category, Product, Section } from '../types/domain'

export type ProductGroup = {
  /** null — bo'limga biriktirilmagan mahsulotlar. */
  section: Section | null
  products: Product[]
}

const LAST = Number.MAX_SAFE_INTEGER

const byOrder = (a: { order?: number }, b: { order?: number }) =>
  (a.order ?? LAST) - (b.order ?? LAST)

/**
 * Bitta kategoriya mahsulotlarini bo'limlarga ajratadi.
 *
 * Tartib: bo'limlar admin belgilagan ketma-ketlikda, har birining ichida
 * mahsulotlar o'z tartibida. Bo'sh bo'lim ko'rsatilmaydi — mijozga
 * ostida hech narsa yo'q sarlavha kerak emas. Bo'limga biriktirilmagan
 * (yoki bo'limi o'chirilgan) mahsulotlar oxirida bitta guruh bo'ladi.
 */
export function groupBySection(products: Product[], sections: Section[], category: string): ProductGroup[] {
  const own = sections.filter((s) => s.category === category).sort(byOrder)
  const known = new Set(own.map((s) => s.id))
  const sorted = [...products].sort(byOrder)

  const groups: ProductGroup[] = own
    .map((section) => ({ section, products: sorted.filter((p) => p.sectionId === section.id) }))
    .filter((group) => group.products.length > 0)

  const rest = sorted.filter((p) => !p.sectionId || !known.has(p.sectionId))
  if (rest.length) groups.push({ section: null, products: rest })
  return groups
}

/**
 * «Barchasi» uchun tekis ro'yxat — kategoriya, bo'lim va mahsulot
 * tartibi hisobga olingan holda.
 *
 * Mahsulot `order` qiymati kategoriya ICHIDA belgilanadi (admin panel,
 * Bo'limlar sahifasi). Faqat unga qarab saralash turli kategoriyalarni
 * aralashtirib yuborardi.
 */
export function sortForAll(products: Product[], categories: Category[], sections: Section[]): Product[] {
  const categoryIndex = new Map(categories.map((c, i) => [c.name, i]))
  const sectionOrder = new Map(sections.map((s) => [s.id, s.order ?? LAST - 1]))

  const key = (p: Product): [number, number, number] => [
    categoryIndex.get(p.category) ?? LAST,
    // Bo'limsizlar kategoriya oxirida
    (p.sectionId ? sectionOrder.get(p.sectionId) : undefined) ?? LAST,
    p.order ?? LAST,
  ]

  return [...products].sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2]
  })
}
