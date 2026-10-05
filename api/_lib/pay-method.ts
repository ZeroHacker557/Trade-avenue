/**
 * Naqd to'lovmi — kuryer pulni qo'lda oladimi.
 *
 * Faqat «Naqd» (va eski yozuvlardagi bo'sh qiymat). «Karta» (o'tkazma)
 * va «Onlayn» (WLCM) naqd EMAS — kuryer kassasiga tushmaydi.
 * Mijoz ilovasidagi nusxasi: src/utils/payment.ts.
 */
export function isCashPayment(method?: unknown): boolean {
  return !method || method === 'Naqd'
}
