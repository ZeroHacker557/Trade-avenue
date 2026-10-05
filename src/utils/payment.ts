/**
 * To'lov usullari — mijoz ilovasi, kuryer va admin uchun umumiy.
 * Server tomonidagi nusxasi: api/_lib/pay-method.ts.
 */

/**
 * Naqd to'lovmi — kuryer pulni qo'lda oladimi.
 *
 * Faqat «Naqd» (va eski yozuvlardagi bo'sh qiymat). «Karta» (o'tkazma) —
 * naqd EMAS: kuryer kassasida ko'rinmasligi kerak.
 */
export function isCashPayment(method?: string | null): boolean {
  return !method || method === 'Naqd'
}
