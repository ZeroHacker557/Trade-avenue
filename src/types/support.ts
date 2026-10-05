/**
 * Kuryer ↔ admin qo'llab-quvvatlash chati.
 * Server tomoni: api/_lib/actions/support.ts (ThreadDoc bilan bir xil).
 */
import { datedNumber } from '../utils/order-label'

export type SupportFrom = 'courier' | 'admin'

export type SupportThread = {
  id: string
  courierUid: string
  courierTg: number
  courierName: string
  /** Buyurtmasiz — umumiy savol. */
  orderId: string | null
  orderNumber: string | null
  orderDay: string | null
  status: 'open' | 'closed'
  createdAt: string
  lastAt: string
  lastText: string
  lastFrom: SupportFrom
  unreadAdmin: number
  unreadCourier: number
}

export type SupportMessage = {
  id: string
  from: SupportFrom
  authorName: string
  text: string
  at: string
}

export function readThread(id: string, data: Record<string, unknown>): SupportThread {
  return {
    id,
    courierUid: String(data.courierUid || ''),
    courierTg: Number(data.courierTg) || 0,
    courierName: String(data.courierName || 'Kuryer'),
    orderId: data.orderId ? String(data.orderId) : null,
    orderNumber: data.orderNumber ? String(data.orderNumber) : null,
    orderDay: data.orderDay ? String(data.orderDay) : null,
    status: data.status === 'closed' ? 'closed' : 'open',
    createdAt: String(data.createdAt || ''),
    lastAt: String(data.lastAt || data.createdAt || ''),
    lastText: String(data.lastText || ''),
    lastFrom: data.lastFrom === 'admin' ? 'admin' : 'courier',
    unreadAdmin: Number(data.unreadAdmin) || 0,
    unreadCourier: Number(data.unreadCourier) || 0,
  }
}

export function readMessage(id: string, data: Record<string, unknown>): SupportMessage {
  return {
    id,
    from: data.from === 'admin' ? 'admin' : 'courier',
    authorName: String(data.authorName || ''),
    text: String(data.text || ''),
    at: String(data.at || ''),
  }
}

/** «#0005 · 23.09.2026» — chek raqami har kuni qaytadan boshlanadi, sana bilan farqlanadi. */
export function orderLabel(orderNumber: string | null, orderDay: string | null): string | null {
  if (!orderNumber) return null
  return datedNumber(orderNumber, orderDay)
}
