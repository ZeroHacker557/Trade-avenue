/**
 * Linko pozitsiyasi bilan do'kondagi mahsulotni nomi bo'yicha
 * YAQINLASHTIRIB solishtirish.
 *
 * Nega kerak? Ikki tizimda nomlar boshqacha yozilgan:
 *   MUSA  — «Musa Muzlatilgan Chuchvara Pelmeni 500 gr»
 *   Linko — «Musa Chuchvara 500gr»
 * Aynan mos keladigani deyarli yo'q, shuning uchun so'zlar bo'yicha
 * o'xshashlik hisoblanadi.
 *
 * Natija AVTOMATIK bog'lanmaydi — faqat taklif bo'lib chiqadi va
 * admin tasdiqlaydi. Sababi: sinovda «Hamir 500gr» ikkita turli MUSA
 * mahsulotiga bir xil ball bilan mos tushdi. Bunday hollarda qaysi
 * biri to'g'riligini faqat odam biladi.
 */

/** Apostrof, kirill «ё» va o'lchov birliklarini bir ko'rinishga keltiradi. */
function normalize(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[‘’ʻʼ`']/g, "'")
    .replace(/ё/g, 'е')
    // 1 kg va 1000 gr bir xil bo'lsin
    .replace(/(\d+)\s*(kg|кг)/g, (_, n) => `${Number(n) * 1000}g`)
    .replace(/(\d+)\s*(gr|гр|g|г)\b/g, '$1g')
    .replace(/[^a-z0-9а-яўқғҳ'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Deyarli hamma nomda uchraydigan so'zlar. Ular mos kelgani
 * o'xshashlikni anglatmaydi, shuning uchun hisobga olinmaydi.
 */
const COMMON = new Set([
  'musa', 'muzlatilgan', 'tayyor', 'yarim', 'dona', 'tali', 'talik', 'ta',
  'sht', 'шт', 'gr', 'g', 'kg', 'ml', 'l', 'new', 'yangi',
])

function tokens(name: string): Set<string> {
  return new Set(
    normalize(name)
      .split(' ')
      .filter((word) => word.length >= 2 && !COMMON.has(word)),
  )
}

function digits(name: string): Set<number> {
  return new Set((normalize(name).match(/\d+/g) || []).map(Number))
}

/**
 * 0 dan 1 gacha o'xshashlik.
 *
 * Og'irlik yoki dona soni ikkalasida ham bo'lsa-yu, mos kelmasa —
 * ball keskin tushadi: «Qiyma 300gr» va «Qiyma 500gr» boshqa mahsulot.
 */
export function similarity(a: string, b: string): number {
  const A = tokens(a)
  const B = tokens(b)
  if (!A.size || !B.size) return 0

  const common = [...A].filter((token) => B.has(token)).length
  const overlap = common / Math.min(A.size, B.size)

  const nA = digits(a)
  const nB = digits(b)
  if (nA.size && nB.size) {
    const shared = [...nA].filter((n) => nB.has(n)).length
    if (!shared) return overlap * 0.4
  }
  return overlap
}

export type Candidate<T> = { item: T; score: number }

/** Eng o'xshash nomzodlar — kamayish tartibida. */
export function bestMatches<T extends { name: string }>(
  name: string,
  items: T[],
  limit = 5,
): Candidate<T>[] {
  return items
    .map((item) => ({ item, score: similarity(name, item.name) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/** Shu balldan yuqori taklif «ishonchli» deb ko'rsatiladi. */
export const SUGGEST_AT = 0.6
