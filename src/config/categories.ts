import type { Category } from '../types/domain'

/**
 * Kategoriyalar to'liq bazadan (admin panel → Kategoriyalar) keladi.
 *
 * `name` — mahsulotning Firestore'dagi `category` maydoni bilan AYNAN bir
 * xil filtr kaliti, shuning uchun u hech qachon tarjima qilinmaydi. Bu
 * fayldagi funksiyalar faqat KO'RINISH va tartib uchun.
 */

/**
 * Ekranda ko'rinadigan kategoriya nomi: ruscha tilda tarjima bo'lsa
 * o'sha, bo'lmasa o'zbekchasi.
 */
export function categoryLabel(
  category: { name: string; nameRu?: string },
  lang: string,
): string {
  return lang === 'ru' ? category.nameRu || category.name : category.name
}

/** Bo'lim sarlavhasi — kategoriyadagi kabi. */
export function sectionLabel(section: { name: string; nameRu?: string }, lang: string): string {
  return lang === 'ru' ? section.nameRu || section.name : section.name
}

/**
 * Admin tartibi bo'yicha. Tartib belgilanmaganlar joyida qoladi
 * (stable sort) va ro'yxat oxiriga tushadi.
 */
export function sortCategories(categories: Category[]): Category[] {
  return categories
    .map((category, index) => ({ category, index }))
    .sort(
      (a, b) =>
        (a.category.order ?? 1e9 + a.index) - (b.category.order ?? 1e9 + b.index),
    )
    .map(({ category }) => category)
}
