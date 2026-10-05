import type { Product } from '../types/domain'

/** Do'konchi uchun bitta donaning sotib olish narxi (o'ramda — bo'lingan). */
export function costPerPiece(product: Product): number {
  return product.price / (product.pack ?? 1)
}

/**
 * Tavsiya etilgan chakana narx bo'yicha foyda: do'konchi bir donadan
 * qancha ishlaydi va ustamasi necha foiz (tannarxga nisbatan).
 */
export function profitOf(product: Product): { amount: number; percent: number } | null {
  if (!product.retailPrice) return null
  const cost = costPerPiece(product)
  const amount = Math.round(product.retailPrice - cost)
  if (cost <= 0 || amount <= 0) return null
  return { amount, percent: Math.round((amount / cost) * 100) }
}
