import { adminDb } from '../firebase-admin.js'
import { AWAITING_PAYMENT } from './orders.js'

/**
 * Trafik manbalari statistikasi (admin panel → «Trafik manbalari»).
 *
 * Manba — botdagi /start qo'shimcha so'zi (reklama havolasi
 * t.me/musauz_bot?start=meta_ig). Bot yozadi: `start_events` va
 * `users.{firstSource,lastSource}` (bot/source_tracking.py). Buyurtmaga
 * server yozadi: `orders.startSource` (buyurtma paytidagi lastSource).
 */

export type StartEvent = { telegramUserId: number; source: string; isNewUser: boolean; createdAt: string }
export type SourceOrder = { userId?: number; startSource?: string | null; status?: string; total?: number }

export type SourceRow = {
  source: string
  starts: number
  newUsers: number
  buyers: number
  orders: number
  revenue: number
  /** Buyurtma bergan / yangi foydalanuvchi, %. Yangi foydalanuvchi bo'lmasa — null. */
  conversion: number | null
}

/** Manbasiz buyurtmalar (eski mijozlar, botga manbasiz kirganlar). */
export const NO_SOURCE = '—'
const LOST = new Set(['Bekor qilingan', 'Rad etildi', AWAITING_PAYMENT])

export function aggregateSources(events: StartEvent[], orders: SourceOrder[]): SourceRow[] {
  const map = new Map<string, SourceRow & { buyerIds: Set<number> }>()
  const row = (source: string) => {
    let r = map.get(source)
    if (!r) {
      r = { source, starts: 0, newUsers: 0, buyers: 0, orders: 0, revenue: 0, conversion: null, buyerIds: new Set() }
      map.set(source, r)
    }
    return r
  }
  for (const e of events) {
    const r = row(e.source)
    r.starts++
    if (e.isNewUser) r.newUsers++
  }
  for (const o of orders) {
    if (LOST.has(String(o.status))) continue
    const r = row(o.startSource || NO_SOURCE)
    r.orders++
    r.revenue += Number(o.total) || 0
    if (o.userId !== undefined) r.buyerIds.add(Number(o.userId))
  }
  return [...map.values()]
    .map(({ buyerIds, ...r }) => ({
      ...r,
      buyers: buyerIds.size,
      conversion: r.newUsers ? Math.round((buyerIds.size / r.newUsers) * 1000) / 10 : null,
    }))
    .sort((a, b) => b.revenue - a.revenue || b.starts - a.starts)
}

export async function sourcesStats(body: Record<string, unknown>) {
  const days = Math.min(365, Math.max(1, Math.round(Number(body.days) || 7)))
  const since = new Date()
  since.setHours(0, 0, 0, 0)
  since.setDate(since.getDate() - (days - 1))
  const from = since.toISOString()

  const db = await adminDb()
  const [ev, ord] = await Promise.all([
    db.collection('start_events').where('createdAt', '>=', from).get(),
    db.collection('orders').where('createdAt', '>=', from).get(),
  ])
  const rows = aggregateSources(
    ev.docs.map((d) => d.data() as StartEvent),
    ord.docs.map((d) => d.data() as SourceOrder),
  )
  return { days, from, rows }
}
