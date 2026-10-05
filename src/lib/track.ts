import { apiPost } from './api'

type TrackEvent = 'view' | 'cart_add' | 'checkout_start'

/**
 * Yengil analitika (12-band).
 *
 * Bir seansda bir xil hodisa bir marta yuboriladi — aks holda
 * har render'da so'rov ketib, Firestore hisobi shishib ketardi.
 * Xatolar jim yutiladi: analitika hech qachon xaridga xalaqit
 * bermasligi kerak.
 */
const sent = new Set<string>()

export function track(event: TrackEvent, productId?: number | string) {
  const key = `${event}:${productId ?? ''}`
  if (sent.has(key)) return
  sent.add(key)

  apiPost('/api/track', { event, productId }).catch(() => {
    // Keyingi urinishga yo'l ochamiz
    sent.delete(key)
  })
}
