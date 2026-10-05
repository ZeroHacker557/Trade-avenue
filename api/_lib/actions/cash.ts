import { adminDb } from '../firebase-admin.js'
import { CodedError } from '../errors.js'
import type { Staff } from '../admin-auth.js'
import { canDeliver } from '../courier-staff.js'
import { escapeHtml, sendMessage } from '../telegram.js'
import { adminTargets, panelUrl } from './orders.js'
import { orderLabel } from '../order-number.js'

/**
 * Kuryerlar kassasi — naqd pulni topshirish.
 *
 * Naqd to'langan buyurtma yetkazilganda pul kuryer qo'lida qoladi:
 * buyurtmada `cashStatus: 'held'` (courier.ts → courierDeliver).
 *
 *   held     — kuryerda
 *   pending  — «Kassaga topshirdim» bosildi, admin tasdig'ini kutmoqda
 *   settled  — admin qabul qildi
 *
 *   cash_handovers/{id} — bitta topshirish: qaysi buyurtmalar, qancha,
 *                         holati (pending / confirmed / rejected)
 *
 * Rad etilsa buyurtmalar yana `held` ga qaytadi — pul yo'qolmaydi,
 * kuryer uni qayta topshiradi.
 */

type Body = Record<string, unknown>
type OrderLike = {
  orderNumber?: string
  orderDay?: string
  createdAt?: string
  total?: number
  paymentMethod?: string
  cashStatus?: 'held' | 'pending' | 'settled'
  courierId?: string | null
}

export type HandoverDoc = {
  courierUid: string
  courierName: string
  courierTg: number | null
  orderIds: string[]
  orderNumbers: string[]
  amount: number
  status: 'pending' | 'confirmed' | 'rejected'
  createdAt: string
  decidedAt: string | null
  decidedBy: string | null
  note: string | null
}

const HANDOVERS = 'cash_handovers'

// toLocaleString minglarni tor bo'sh joy bilan ajratadi — oddiy bo'sh joyga almashtiramiz
const som = (n: number) => `${Math.round(n).toLocaleString('ru-RU').replace(/\s/g, ' ')} so‘m`

/** Kuryer profilidagi «Qo'limdagi naqd» bloki. */
export async function cashSummary(uid: string, mine: { id: string; data: OrderLike }[]) {
  const held = mine.filter((o) => o.data.cashStatus === 'held')
  const pending = mine.filter((o) => o.data.cashStatus === 'pending')
  const sum = (list: typeof mine) => list.reduce((s, o) => s + (Number(o.data.total) || 0), 0)

  const snap = await (await adminDb()).collection(HANDOVERS).where('courierUid', '==', uid).get()
  const handovers = snap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as HandoverDoc) }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10)
    .map((h) => ({
      id: h.id,
      amount: h.amount,
      count: h.orderIds.length,
      status: h.status,
      createdAt: h.createdAt,
      decidedAt: h.decidedAt,
      note: h.note,
    }))

  return {
    held: { amount: sum(held), count: held.length },
    pending: { amount: sum(pending), count: pending.length },
    handovers,
  }
}

/** Kuryer: qo'lidagi hamma naqdni kassaga topshirish. */
export async function courierCashHandover(staff: Staff) {
  if (!canDeliver(staff)) throw new CodedError('COURIER_ONLY', 'Bu amal faqat kuryer uchun')
  const db = await adminDb()

  const snap = await db.collection('orders').where('courierId', '==', staff.uid).get()
  const held = snap.docs.filter((doc) => (doc.data() as OrderLike).cashStatus === 'held')
  if (!held.length) throw new CodedError('CASH_NOTHING', 'Topshiriladigan naqd pul yo‘q')

  const amount = held.reduce((s, doc) => s + (Number((doc.data() as OrderLike).total) || 0), 0)
  const now = new Date().toISOString()
  const ref = db.collection(HANDOVERS).doc()
  const handover: HandoverDoc = {
    courierUid: staff.uid,
    courierName: staff.name,
    courierTg: staff.telegramId ?? null,
    orderIds: held.map((doc) => doc.id),
    orderNumbers: held.map((doc) => orderLabel(doc.data() as OrderLike, doc.id)),
    amount,
    status: 'pending',
    createdAt: now,
    decidedAt: null,
    decidedBy: null,
    note: null,
  }

  const batch = db.batch()
  batch.set(ref, handover)
  for (const doc of held) batch.update(doc.ref, { cashStatus: 'pending', cashHandoverId: ref.id })
  await batch.commit()

  try {
    const url = panelUrl('cash')
    const text =
      `💵 <b>Kassaga topshirish</b> — ${escapeHtml(staff.name)}\n` +
      `${som(amount)} · ${held.length} ta buyurtma\n\nTasdiqlash uchun panelni oching.`
    for (const target of await adminTargets()) {
      if (target === staff.telegramId) continue
      await sendMessage(target, text, url ? [{ text: '🖥 Kassani ochish', url }] : undefined)
    }
  } catch (error) {
    console.error('[cash] adminlarga xabar ketmadi:', error)
  }

  return { handoverId: ref.id, amount, count: held.length }
}

async function decide(staff: Staff, body: Body, accept: boolean) {
  const id = String(body.handoverId || '').trim()
  if (!id) throw new Error('handoverId kerak')
  const note = String(body.note || '').trim().slice(0, 300) || null
  const db = await adminDb()
  const ref = db.collection(HANDOVERS).doc(id)
  const now = new Date().toISOString()

  const handover = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new Error('Topshirish topilmadi')
    const data = snap.data() as HandoverDoc
    if (data.status !== 'pending') throw new Error('Bu topshirish allaqachon ko‘rib chiqilgan')
    tx.update(ref, { status: accept ? 'confirmed' : 'rejected', decidedAt: now, decidedBy: staff.name, note })
    return data
  })

  // Buyurtmalar: qabul qilindi — yopiladi, rad etildi — yana kuryerda
  const batch = db.batch()
  for (const orderId of handover.orderIds) {
    batch.update(db.collection('orders').doc(orderId), accept
      ? { cashStatus: 'settled', cashSettledAt: now }
      : { cashStatus: 'held', cashHandoverId: null })
  }
  await batch.commit()

  if (handover.courierTg) {
    const text = accept
      ? `✅ <b>Kassa qabul qildi</b>\n${som(handover.amount)} · ${handover.orderIds.length} ta buyurtma. Rahmat!`
      : `⚠️ <b>Kassa topshirishni rad etdi</b>\n${som(handover.amount)}` +
        (note ? `\nSabab: ${escapeHtml(note)}` : '') + '\nAdmin bilan bog‘laning.'
    await sendMessage(handover.courierTg, text).catch(() => undefined)
  }

  return { handoverId: id, status: accept ? 'confirmed' : 'rejected' }
}

export const cashConfirm = (staff: Staff, body: Body) => decide(staff, body, true)
export const cashReject = (staff: Staff, body: Body) => decide(staff, body, false)
