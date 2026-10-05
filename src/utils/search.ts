import type { Product } from '../types/domain'

/**
 * Qidiruv (3-band).
 *
 * Ilgari faqat mahsulot nomida qidirilardi va bitta harf xato
 * yozilsa hech narsa topilmasdi. Endi:
 *   - nom, kategoriya, tavsif, rang va o'lchamda qidiriladi
 *   - lotin/kirill va o'zbekcha apostroflar bir xil hisoblanadi
 *   - natijalar muvofiqlik darajasi bo'yicha saralanadi
 */

/** Turli apostroflar va registrni bir ko'rinishga keltiradi. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bb\u02bc`']/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/*
 * Nom IKKI tilda qidiriladi. Ilovada ko'rsatiladigan `name` tanlangan
 * tilga almashadi (use-shop-store.ts), shuning uchun faqat o'shanda
 * qidirilsa ruscha rejimda o'zbekcha nom, o'zbekcha rejimda esa ruscha
 * so'z («пельмени») topilmay qolardi.
 */
function fields(product: Product): string[] {
  return [
    product.name,
    product.nameUz ?? '',
    product.nameRu ?? '',
    product.nameEn ?? '',
    product.category,
    product.categoryRu ?? '',
    product.description ?? '',
    product.descriptionUz ?? '',
    product.descriptionRu ?? '',
    product.color ?? '',
    ...(product.colors ?? []),
    ...(product.sizes ?? []),
  ].filter(Boolean)
}

/**
 * Muvofiqlik bahosi. Katta raqam — yuqoriroq o'rin.
 * 0 bo'lsa mahsulot natijaga kirmaydi.
 */
function score(product: Product, terms: string[]): number {
  const name = normalize(product.name)
  const haystack = normalize(fields(product).join(' '))

  let total = 0

  for (const term of terms) {
    if (name.startsWith(term)) {
      total += 100          // nomi shu so'zdan boshlanadi
    } else if (name.includes(term)) {
      total += 60           // nomi ichida bor
    } else if (haystack.includes(term)) {
      total += 25           // kategoriya/tavsif/rangda bor
    } else {
      return 0              // bitta so'z ham topilmadi
    }
  }

  // Sotuvda bo'lganlar yuqoriroq
  if (product.stock !== 0) total += 5

  return total
}

export function searchProducts(products: Product[], query: string): Product[] {
  const terms = normalize(query).split(' ').filter(Boolean)
  if (terms.length === 0) return products

  return products
    .map((product) => ({ product, score: score(product, terms) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.product)
}
