import type { Category, Product } from './types/domain'

// Bo'sh — mahsulotlar bot orqali qo'shiladi
export const products: Product[] = []
export const categories: Category[] = []

/**
 * Valyuta nomi tanlangan tilga qarab o'zgaradi.
 *
 * formatPrice() o'nlab joyda chaqiriladi va ularning ko'pi hook
 * ishlatolmaydigan joylarda. Shuning uchun til I18nProvider tomonidan
 * shu yerga bir marta yozib qo'yiladi.
 */
let currencyLabel = "so'm"

export function setCurrencyLabel(label: string) {
  currencyLabel = label
}

/** Narxni formatlash: 150 000 so'm / 150 000 сум */
export function formatPrice(amount: number): string {
  const rounded = Math.round(amount)
  return `${rounded.toLocaleString('ru-RU').replace(/\u00a0/g, ' ')} ${currencyLabel}`
}

/** Narxni raqamga aylantirish (eski format uchun) */
export function parsePrice(priceStr: string): number {
  return Number(priceStr.replace(/[^0-9]/g, ''))
}
