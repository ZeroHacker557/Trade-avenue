import { adminDb } from './firebase-admin.js'
import { orderLabel } from './order-number.js'

/**
 * Do'kon hisob-kitobi: nasiya (qarz) va keshbek.
 *
 *   shops/{id}.balance       — do'konning qarzi (musbat — do'kon qarzdor)
 *   shops/{id}.cashback      — ishlatilmagan keshbek
 *   shops/{id}.creditLimit   — nasiya chegarasi (0 — nasiya yo'q)
 *   shops/{id}.creditDays    — to'lov muddati, kun
 *   ledger/{id}              — har o'zgarish alohida yozuv (akt-sverka shundan)
 *
 * Qoidalar:
 *   • Nasiya buyurtma YETKAZILGANDA qarzga yoziladi, muddati — o'sha kundan
 *     `creditDays` kun. Bekor qilingan nasiya qarz bo'lmaydi.
 *   • Keshbek yetkazilgan buyurtmadan (sozlamadagi foiz), bir marta.
 *   • Har buyurtma uchun ikkalasi ham faqat BIR MARTA (`order.ledger`).
 */

export type LedgerAccount = 'debt' | 'cashback'
export type LedgerKind = 'order' | 'payment' | 'adjust' | 'accrual' | 'spend' | 'refund'

export type LedgerEntry = {
  shopId: string
  account: LedgerAccount
  /** Ishorali: + qarzni (keshbekni) oshiradi, − kamaytiradi. */
  amount: number
  kind: LedgerKind
  orderId?: string | null
  orderLabel?: string | null
  /** To'lov usuli (to'lovda): Naqd, Karta, O'tkazma. */
  method?: string | null
  note?: string | null
  /** Shu yozuvdan keyingi balans — akt-sverkada qoldiq ustuni. */
  balanceAfter: number
  at: string
  by: { uid: string; name: string } | null
}

export type CashbackSettings = { enabled: boolean; percent: number }

export const DEFAULT_CREDIT_DAYS = 7

export async function readCashbackSettings(): Promise<CashbackSettings> {
  const db = await adminDb()
  const data = (await db.collection('settings').doc('cashback').get()).data() ?? {}
  const percent = Math.min(20, Math.max(0, Math.round(Number(data.percent) * 10) / 10 || 0))
  return { enabled: data.enabled === true && percent > 0, percent }
}

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

type OrderLike = {
  shopId?: string
  status?: string
  paymentMethod?: string
  total?: number
  orderNumber?: string
  orderDay?: string
  cashbackUsed?: number
  ledger?: { delivered?: boolean; refunded?: boolean } | null
}

/**
 * Buyurtma yetkazildi: nasiya qarzga yoziladi va keshbek beriladi.
 * Takroriy chaqiruv xavfsiz — `order.ledger.delivered` bayrog'i tranzaksiyada.
 */
export async function onOrderDelivered(orderId: string, now = new Date().toISOString()): Promise<void> {
  const db = await adminDb()
  const cashback = await readCashbackSettings()
  const orderRef = db.collection('orders').doc(orderId)

  await db.runTransaction(async (tx) => {
    const order = ((await tx.get(orderRef)).data() ?? {}) as OrderLike
    if (!order.shopId || order.ledger?.delivered) return
    const shopRef = db.collection('shops').doc(order.shopId)
    const shop = (await tx.get(shopRef)).data()
    if (!shop) return

    const label = orderLabel(order, orderId)
    const total = Math.max(0, Math.round(num(order.total)))
    let balance = num(shop.balance)
    let bonus = num(shop.cashback)
    const update: Record<string, unknown> = {}
    const orderUpdate: Record<string, unknown> = { 'ledger.delivered': true }

    if (order.paymentMethod === 'Nasiya' && total > 0) {
      balance += total
      update.balance = balance
      const days = num(shop.creditDays) > 0 ? num(shop.creditDays) : DEFAULT_CREDIT_DAYS
      orderUpdate.creditDueAt = new Date(Date.parse(now) + days * 86_400_000).toISOString()
      tx.set(db.collection('ledger').doc(), entry(order.shopId, 'debt', total, 'order', balance, now, { orderId, orderLabel: label }))
    }

    if (cashback.enabled && total > 0) {
      const earned = Math.round((total * cashback.percent) / 100)
      if (earned > 0) {
        bonus += earned
        update.cashback = bonus
        orderUpdate.cashbackEarned = earned
        tx.set(db.collection('ledger').doc(), entry(order.shopId, 'cashback', earned, 'accrual', bonus, now, {
          orderId, orderLabel: label, note: `${cashback.percent}%`,
        }))
      }
    }

    if (Object.keys(update).length) tx.update(shopRef, { ...update, updatedAt: now })
    tx.update(orderRef, orderUpdate)
  })
}

/**
 * Buyurtma yopildi (bekor / rad) — ishlatilgan keshbek do'konga qaytadi.
 * Bir marta (`order.ledger.refunded`).
 */
export async function onOrderClosed(orderId: string, now = new Date().toISOString()): Promise<void> {
  const db = await adminDb()
  const orderRef = db.collection('orders').doc(orderId)
  await db.runTransaction(async (tx) => {
    const order = ((await tx.get(orderRef)).data() ?? {}) as OrderLike
    const used = Math.round(num(order.cashbackUsed))
    if (!order.shopId || used <= 0 || order.ledger?.refunded || order.ledger?.delivered) return
    const shopRef = db.collection('shops').doc(order.shopId)
    const shop = (await tx.get(shopRef)).data()
    if (!shop) return
    const bonus = num(shop.cashback) + used
    tx.update(shopRef, { cashback: bonus, updatedAt: now })
    tx.set(db.collection('ledger').doc(), entry(order.shopId, 'cashback', used, 'refund', bonus, now, {
      orderId, orderLabel: orderLabel(order, orderId),
    }))
    tx.update(orderRef, { 'ledger.refunded': true })
  })
}

export function entry(
  shopId: string,
  account: LedgerAccount,
  amount: number,
  kind: LedgerKind,
  balanceAfter: number,
  at: string,
  extra: Partial<Pick<LedgerEntry, 'orderId' | 'orderLabel' | 'method' | 'note' | 'by'>> = {},
): LedgerEntry {
  return {
    shopId,
    account,
    amount: Math.round(amount),
    kind,
    orderId: extra.orderId ?? null,
    orderLabel: extra.orderLabel ?? null,
    method: extra.method ?? null,
    note: extra.note ?? null,
    balanceAfter: Math.round(balanceAfter),
    at,
    by: extra.by ?? null,
  }
}

/**
 * Nasiya holati: kutilayotgan (hali yetkazilmagan) nasiya buyurtmalar va
 * muddati o'tgan qarz.
 *
 * Muddati o'tgan = qarz − muddati hali kelmagan nasiya buyurtmalar.
 * (To'lovlar eng eski qarzni yopadi — FIFO; shuning uchun yangi
 * buyurtmalar qismi «hali muddati bor» deb qoladi.)
 */
export async function creditState(shopId: string, balance: number, now = Date.now()) {
  const db = await adminDb()
  const snap = await db.collection('orders')
    .where('shopId', '==', shopId)
    .where('paymentMethod', '==', 'Nasiya')
    .get()
  let pending = 0
  let notDue = 0
  for (const doc of snap.docs) {
    const o = doc.data() as OrderLike & { creditDueAt?: string }
    if (o.status === 'Bekor qilingan' || o.status === 'Rad etildi') continue
    if (!o.ledger?.delivered) {
      pending += Math.round(num(o.total))
      continue
    }
    const due = Date.parse(String(o.creditDueAt || ''))
    if (Number.isFinite(due) && due >= now) notDue += Math.round(num(o.total))
  }
  const overdue = Math.max(0, Math.round(balance - notDue))
  return { pending, overdue }
}
