/**
 * Mahsulot rasmining qaysi nusxasi qayerda ishlatiladi.
 *
 *   thumb    — kichik (~480px WebP, ~20–40 KB): katalog kartochkasi, savat,
 *              qidiruv, buyurtmalar. Ekranda 170px atrofida ko'rinadi —
 *              1–2 MB lik asl faylni yuklash ortiqcha trafik va sekinlik.
 *   photo    — o'rta (~1200px WebP, ~100 KB): mahsulot sahifasi.
 *   original — asl fayl: faqat bosib kattalashtirilganda (sifat to'liq).
 *
 * Nusxa hali yo'q (eski mahsulot) yoki asl rasm almashtirilgan bo'lsa,
 * asl rasm olinadi — ilova hech qachon rasmsiz yoki boshqa rasm bilan
 * qolmaydi.
 */
type WithImages = {
  images?: string[]
  thumbs?: string[]
  optimized?: string[]
  variantSources?: string[]
}

function variant(product: WithImages, list: string[] | undefined, index: number): string {
  const original = product.images?.[index] || ''
  const fresh = original && product.variantSources?.[index] === original
  return (fresh && list?.[index]) || original
}

export function productThumb(product: WithImages, index = 0): string {
  return variant(product, product.thumbs, index)
}

export function productPhoto(product: WithImages, index = 0): string {
  return variant(product, product.optimized, index)
}

export function productOriginal(product: WithImages, index = 0): string {
  return product.images?.[index] || ''
}
