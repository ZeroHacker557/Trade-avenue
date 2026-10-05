import type { Notification } from '../types/domain'

/**
 * Holati o'zgargan, mijoz hali ko'rmagan buyurtmalar soni («Buyurtmalar» nishoni).
 *
 * Manba — server holat o'zgarganda yozadigan `type: 'order'` bildirishnomalari
 * (panel ham, bot ham yozadi). Buyurtmalar SONI sanaladi, hodisalar emas:
 * ilova yopiq paytda buyurtma «Qabul qilindi → Yo'lda → Yetkazildi» bo'lsa
 * ham nishonda «1». Eski yozuvlarda `orderId` yo'q — ular alohida sanaladi.
 */
export function countUnseenOrders(notifications: Pick<Notification, 'id' | 'type' | 'read' | 'orderId'>[]): number {
  const keys = new Set<string>()
  for (const n of notifications) {
    if (n.type === 'order' && !n.read) keys.add(n.orderId ? `o:${n.orderId}` : `n:${n.id}`)
  }
  return keys.size
}
