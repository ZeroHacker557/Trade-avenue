import { adminDb } from '../firebase-admin.js'
import { CodedError } from '../errors.js'
import type { Staff } from '../admin-auth.js'
import { canDeliver } from '../courier-staff.js'
import { fullDay } from '../order-number.js'
import { escapeHtml, sendMessage, sendRows } from '../telegram.js'
import { adminTargets, miniAppUrl, panelUrl } from './orders.js'

/**
 * Kuryer ↔ admin qo'llab-quvvatlash chati.
 *
 *   support_threads/{id}           — murojaat: kim, qaysi buyurtma, holat
 *   support_threads/{id}/messages  — xabarlar
 *
 * Yozish faqat shu yerda (server). O'qish jonli: admin panel va kuryer
 * ilovasi Firestore'ga to'g'ridan-to'g'ri obuna bo'ladi — kuryer faqat
 * `courierTg` si o'ziniki bo'lgan murojaatlarni ko'radi (firestore.rules).
 *
 * Har yangi xabar Telegram orqali ham boradi: kuryer yozsa — adminlarga
 * (panelga havola bilan), admin javob bersa — kuryerga (chatni
 * ochadigan tugma bilan). Ilova yopiq bo'lsa ham xabar yo'qolmaydi.
 */

type Body = Record<string, unknown>
type From = 'courier' | 'admin'

const THREADS = 'support_threads'
const MAX_TEXT = 2000

export type ThreadDoc = {
  courierUid: string
  courierTg: number
  courierName: string
  orderId: string | null
  orderNumber: string | null
  orderDay: string | null
  status: 'open' | 'closed'
  createdAt: string
  lastAt: string
  lastText: string
  lastFrom: From
  unreadAdmin: number
  unreadCourier: number
}

function textOf(body: Body): string {
  const text = String(body.text ?? '').trim()
  if (!text) throw new CodedError('SUPPORT_EMPTY', 'Xabar bo‘sh')
  if (text.length > MAX_TEXT) throw new CodedError('SUPPORT_TOO_LONG', `Xabar ${MAX_TEXT} belgidan oshmasin`)
  return text
}

function idOf(body: Body): string {
  const id = String(body.threadId || '').trim()
  if (!id) throw new CodedError('SUPPORT_THREAD_MISSING', 'threadId kerak')
  return id
}

function requireCourier(staff: Staff) {
  if (!canDeliver(staff)) throw new CodedError('COURIER_ONLY', 'Bu amal faqat kuryer uchun')
  if (!staff.telegramId) throw new CodedError('NO_TELEGRAM', 'Telegram ID ulanmagan')
}

/** «#0005 · 23.09.2026» yoki «Umumiy savol». */
function threadLabel(thread: Pick<ThreadDoc, 'orderNumber' | 'orderDay'>): string {
  if (!thread.orderNumber) return 'Umumiy savol'
  const day = fullDay(thread.orderDay)
  return day ? `${thread.orderNumber} · ${day}` : thread.orderNumber
}

/** Xabarni yozadi va murojaatning oxirgi holatini yangilaydi — atomar. */
async function append(threadId: string, from: From, authorName: string, text: string, reopen: boolean) {
  const db = await adminDb()
  const ref = db.collection(THREADS).doc(threadId)
  const at = new Date().toISOString()

  const thread = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new CodedError('SUPPORT_THREAD_GONE', 'Murojaat topilmadi')
    const data = snap.data() as ThreadDoc
    const patch: Partial<ThreadDoc> = {
      lastAt: at,
      lastText: text.slice(0, 160),
      lastFrom: from,
      // Yozgan tomonda o'qilmagan qolmaydi, qarshi tomonda bittaga oshadi
      unreadAdmin: from === 'courier' ? (Number(data.unreadAdmin) || 0) + 1 : 0,
      unreadCourier: from === 'admin' ? (Number(data.unreadCourier) || 0) + 1 : 0,
      ...(reopen && data.status === 'closed' ? { status: 'open' as const } : {}),
    }
    tx.update(ref, patch)
    return { ...data, ...patch }
  })

  await ref.collection('messages').add({ from, authorName, text, at })
  return thread
}

/** Kuryer yozdi — adminlarga Telegram xabari. */
async function notifyAdmins(threadId: string, thread: ThreadDoc, text: string) {
  try {
    const url = panelUrl(`support/${threadId}`)
    const message =
      `💬 <b>Kuryerdan murojaat</b> — ${escapeHtml(thread.courierName)}\n` +
      `📦 ${escapeHtml(threadLabel(thread))}\n\n${escapeHtml(text)}`
    for (const target of await adminTargets()) {
      // Kuryer o'zi ega bo'lsa, o'ziga o'zi xabar yubormaymiz
      if (target === thread.courierTg) continue
      await sendMessage(target, message, url ? [{ text: '🖥 Javob berish', url }] : undefined)
    }
  } catch (error) {
    console.error('[support] adminlarga xabar ketmadi:', error)
  }
}

/** Admin javob berdi — kuryerga Telegram xabari, chatni ochadigan tugma bilan. */
async function notifyCourier(threadId: string, thread: ThreadDoc, text: string) {
  try {
    const base = miniAppUrl()
    await sendRows(
      thread.courierTg,
      `💬 <b>Qo‘llab-quvvatlash javobi</b>\n📦 ${escapeHtml(threadLabel(thread))}\n\n${escapeHtml(text)}`,
      base ? [[{ text: '📱 Chatni ochish', web_app: { url: `${base}/?support=${encodeURIComponent(threadId)}` } }]] : [],
    )
  } catch (error) {
    console.error('[support] kuryerga xabar ketmadi:', error)
  }
}

/* ─── Kuryer ───────────────────────────────────────────────── */

/**
 * Yangi murojaat — buyurtma bo'yicha yoki umumiy.
 *
 * Shu buyurtma bo'yicha OCHIQ murojaat bo'lsa, yangisi ochilmaydi —
 * xabar o'shanga qo'shiladi: admin bitta muammoni bir necha joyda
 * qidirib yurmasin.
 */
export async function supportOpen(staff: Staff, body: Body) {
  requireCourier(staff)
  const text = textOf(body)
  const orderId = String(body.orderId || '').trim() || null
  const db = await adminDb()

  let orderNumber: string | null = null
  let orderDay: string | null = null
  if (orderId) {
    const order = await db.collection('orders').doc(orderId).get()
    if (!order.exists) throw new CodedError('ORDER_GONE', 'Buyurtma topilmadi')
    const data = order.data() as { orderNumber?: string; orderDay?: string }
    orderNumber = data.orderNumber || `#${orderId.slice(0, 6)}`
    orderDay = data.orderDay || null
  }

  const mine = await db.collection(THREADS).where('courierUid', '==', staff.uid).get()
  const existing = mine.docs.find((doc) => {
    const data = doc.data() as ThreadDoc
    return data.status === 'open' && (data.orderId || null) === orderId
  })
  if (existing) {
    const thread = await append(existing.id, 'courier', staff.name, text, true)
    await notifyAdmins(existing.id, thread, text)
    return { threadId: existing.id, created: false }
  }

  const now = new Date().toISOString()
  const ref = db.collection(THREADS).doc()
  const thread: ThreadDoc = {
    courierUid: staff.uid,
    courierTg: Number(staff.telegramId),
    courierName: staff.name,
    orderId,
    orderNumber,
    orderDay,
    status: 'open',
    createdAt: now,
    lastAt: now,
    lastText: '',
    lastFrom: 'courier',
    unreadAdmin: 0,
    unreadCourier: 0,
  }
  await ref.set(thread)
  const updated = await append(ref.id, 'courier', staff.name, text, false)
  await notifyAdmins(ref.id, updated, text)
  return { threadId: ref.id, created: true }
}

async function ownThread(staff: Staff, threadId: string) {
  const snap = await (await adminDb()).collection(THREADS).doc(threadId).get()
  if (!snap.exists) throw new CodedError('SUPPORT_THREAD_GONE', 'Murojaat topilmadi')
  const data = snap.data() as ThreadDoc
  if (data.courierUid !== staff.uid) throw new CodedError('SUPPORT_NOT_YOURS', 'Bu murojaat sizniki emas')
  return data
}

/** Kuryer mavjud murojaatga yozadi. Yopilgan bo'lsa — qayta ochiladi. */
export async function supportSend(staff: Staff, body: Body) {
  requireCourier(staff)
  const threadId = idOf(body)
  const text = textOf(body)
  await ownThread(staff, threadId)
  const thread = await append(threadId, 'courier', staff.name, text, true)
  await notifyAdmins(threadId, thread, text)
  return { threadId }
}

export async function supportCourierRead(staff: Staff, body: Body) {
  requireCourier(staff)
  const threadId = idOf(body)
  await ownThread(staff, threadId)
  await (await adminDb()).collection(THREADS).doc(threadId).set({ unreadCourier: 0 }, { merge: true })
  return { threadId }
}

/* ─── Admin panel ──────────────────────────────────────────── */

export async function supportReply(staff: Staff, body: Body) {
  const threadId = idOf(body)
  const text = textOf(body)
  const thread = await append(threadId, 'admin', staff.name || 'Admin', text, true)
  await notifyCourier(threadId, thread, text)
  return { threadId }
}

export async function supportAdminRead(_staff: Staff, body: Body) {
  const threadId = idOf(body)
  await (await adminDb()).collection(THREADS).doc(threadId).set({ unreadAdmin: 0 }, { merge: true })
  return { threadId }
}

/** Murojaatni yopish yoki qayta ochish. */
export async function supportClose(_staff: Staff, body: Body) {
  const threadId = idOf(body)
  const db = await adminDb()
  const ref = db.collection(THREADS).doc(threadId)
  const snap = await ref.get()
  if (!snap.exists) throw new CodedError('SUPPORT_THREAD_GONE', 'Murojaat topilmadi')
  const status = body.closed === false ? 'open' : 'closed'
  await ref.set({ status, unreadAdmin: 0 }, { merge: true })
  return { threadId, status }
}
