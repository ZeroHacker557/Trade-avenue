import { getTelegram } from './telegram'

/**
 * Onlayn to'lov (WLCM) — mijoz ilovasi, kuryer va admin uchun umumiy.
 * Server tomoni: api/_lib/actions/payments.ts.
 */

/** Onlayn to'lov kutilayotgan buyurtma holati — server bilan AYNAN bir xil. */
export const AWAITING_PAYMENT = 'To‘lov kutilmoqda' as const

export type PayProvider = 'click' | 'payme' | 'uzum' | 'paylov' | 'card'

/** Ko'rinish tartibi va brend ranglari. */
export const PAY_PROVIDERS: { id: PayProvider; label: string; color: string }[] = [
  { id: 'payme', label: 'Payme', color: '#00c1c1' },
  { id: 'click', label: 'Click', color: '#0096ff' },
  { id: 'uzum', label: 'Uzum', color: '#7000ff' },
  { id: 'paylov', label: 'Paylov', color: '#ff6a2b' },
  // Uzcard/Humo karta ilovaning o'zida kiritiladi, SMS kod bilan tasdiqlanadi
  { id: 'card', label: 'Karta', color: '#0e2a6b' },
]

export type PayTileId = 'payme' | 'click' | 'uzcard' | 'humo' | 'uzum' | 'paylov'

/**
 * Buyurtma sahifasidagi to'lov tugmalari — har biri o'z logotipi bilan.
 *
 * Uzcard va Humo — WLCM'ning `card` usuli: karta raqami va muddati ilovaning
 * o'zidagi formada kiritiladi, egasiga SMS kod keladi (CardOtpSheet). Karta
 * ma'lumoti serverda saqlanmaydi. `provider` — WLCM'ga ketadigan qiymat.
 */
export const PAY_TILES: { id: PayTileId; provider: PayProvider; label: string; card?: boolean }[] = [
  { id: 'payme', provider: 'payme', label: 'Payme' },
  { id: 'click', provider: 'click', label: 'Click' },
  { id: 'uzcard', provider: 'card', label: 'Uzcard', card: true },
  { id: 'humo', provider: 'card', label: 'Humo', card: true },
  { id: 'uzum', provider: 'uzum', label: 'Uzum' },
  { id: 'paylov', provider: 'paylov', label: 'Paylov' },
]

/** Karta raqami → qaysi tugma (Humo — 9860, Uzcard — 8600/5614). */
export function cardTileOf(digits: string): 'uzcard' | 'humo' | null {
  if (digits.startsWith('9860')) return 'humo'
  if (/^(8600|5614)/.test(digits)) return 'uzcard'
  return null
}

/** Mijoz kiritgan karta — faqat xotirada, serverga bitta so'rov bilan ketadi. */
export type CardDraft = { number: string; expiry: string }

export function providerLabel(id?: string | null): string {
  return PAY_PROVIDERS.find((p) => p.id === id)?.label ?? ''
}

/**
 * Naqd to'lovmi — kuryer pulni qo'lda oladimi.
 *
 * Faqat «Naqd» (va eski yozuvlardagi bo'sh qiymat). «Karta» (o'tkazma)
 * va «Onlayn» — naqd EMAS: kuryer kassasida ko'rinmasligi kerak.
 */
export function isCashPayment(method?: string | null): boolean {
  return !method || method === 'Naqd'
}

/**
 * To'lov sahifasini ochadi. Telegram ichida — ilova yopilmaydi, sahifa
 * ustida ochiladi; mijoz qaytganda ilova buyurtmani jonli kuzatib turadi.
 */
export function openPayment(url: string) {
  const tg = getTelegram()
  if (tg?.openLink) tg.openLink(url)
  else window.open(url, '_blank', 'noopener')
}
