import { adminDb } from '../firebase-admin.js'
import type { Staff } from '../admin-auth.js'
import { creditState, DEFAULT_CREDIT_DAYS, entry, type LedgerAccount } from '../ledger.js'
import { escapeHtml, sendMessage } from '../telegram.js'
import { userLang } from '../i18n.js'

/**
 * Admin → Do'konlar → hisob-kitob.
 *
 *   ledger.payment — do'kon qarzini to'ladi (naqd, karta, o'tkazma)
 *   ledger.adjust  — qo'lda tuzatish (faqat ega): qarz yoki keshbek
 *   shops.credit   — nasiya chegarasi va to'lov muddati
 */

type Body = Record<string, unknown>

const METHODS = ['Naqd', 'Karta', 'O‘tkazma']

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function amountOf(value: unknown): number {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? n : 0
}

export async function ledgerPayment(staff: Staff, body: Body) {
  const shopId = str(body.shopId)
  const amount = amountOf(body.amount)
  if (!shopId) throw new Error('Do‘kon tanlanmagan')
  if (amount <= 0) throw new Error('Summa noldan katta bo‘lsin')
  const method = METHODS.includes(str(body.method)) ? str(body.method) : 'Naqd'
  const note = str(body.note).slice(0, 300)

  const db = await adminDb()
  const shopRef = db.collection('shops').doc(shopId)
  const now = new Date().toISOString()
  const balance = await db.runTransaction(async (tx) => {
    const shop = (await tx.get(shopRef)).data()
    if (!shop) throw new Error('Do‘kon topilmadi')
    const next = Math.round(Number(shop.balance) || 0) - amount
    tx.update(shopRef, { balance: next, lastPaymentAt: now, updatedAt: now })
    tx.set(db.collection('ledger').doc(), entry(shopId, 'debt', -amount, 'payment', next, now, {
      method, note: note || null, by: { uid: staff.uid, name: staff.name || staff.email },
    }))
    return next
  })
  return { balance }
}

export async function ledgerAdjust(staff: Staff, body: Body) {
  if (staff.role !== 'owner') throw new Error('Tuzatishni faqat ega kiritadi')
  const shopId = str(body.shopId)
  const account: LedgerAccount = body.account === 'cashback' ? 'cashback' : 'debt'
  const amount = amountOf(body.amount)
  const note = str(body.note).slice(0, 300)
  if (!shopId) throw new Error('Do‘kon tanlanmagan')
  if (!amount) throw new Error('Summa kiriting (+ yoki −)')
  if (!note) throw new Error('Tuzatish sababini yozing')

  const db = await adminDb()
  const shopRef = db.collection('shops').doc(shopId)
  const field = account === 'debt' ? 'balance' : 'cashback'
  const now = new Date().toISOString()
  const value = await db.runTransaction(async (tx) => {
    const shop = (await tx.get(shopRef)).data()
    if (!shop) throw new Error('Do‘kon topilmadi')
    const next = Math.round(Number(shop[field]) || 0) + amount
    if (account === 'cashback' && next < 0) throw new Error('Keshbek manfiy bo‘lib qoladi')
    tx.update(shopRef, { [field]: next, updatedAt: now })
    tx.set(db.collection('ledger').doc(), entry(shopId, account, amount, 'adjust', next, now, {
      note, by: { uid: staff.uid, name: staff.name || staff.email },
    }))
    return next
  })
  return { [field]: value }
}

export async function shopCredit(_staff: Staff, body: Body) {
  const shopId = str(body.shopId)
  if (!shopId) throw new Error('Do‘kon tanlanmagan')
  const creditLimit = Math.max(0, amountOf(body.creditLimit))
  const creditDays = Math.min(180, Math.max(1, amountOf(body.creditDays) || DEFAULT_CREDIT_DAYS))
  const db = await adminDb()
  const ref = db.collection('shops').doc(shopId)
  if (!(await ref.get()).exists) throw new Error('Do‘kon topilmadi')
  await ref.set({ creditLimit, creditDays, updatedAt: new Date().toISOString() }, { merge: true })
  return { creditLimit, creditDays }
}

const REMIND: Record<'uz' | 'ru', (shop: string, amount: string) => string> = {
  uz: (shop, amount) =>
    `⏰ <b>${shop}</b>: to‘lov muddati o‘tgan qarz — <b>${amount} so‘m</b>.\n\n` +
    'Iltimos, yaqin kunlarda to‘lang. Muddati o‘tgan qarz bor paytda nasiyaga buyurtma berib bo‘lmaydi.\n' +
    '<i>Batafsil: ilova → Profil → Hisob-kitob.</i>',
  ru: (shop, amount) =>
    `⏰ <b>${shop}</b>: просроченный долг — <b>${amount} сум</b>.\n\n` +
    'Пожалуйста, оплатите в ближайшие дни. Пока есть просрочка, заказ в долг недоступен.\n' +
    '<i>Подробно: приложение → Профиль → Взаиморасчёты.</i>',
}

/**
 * Muddati o'tgan qarz eslatmasi — kuniga bir marta (cron). Do'konga
 * ulangan har akkauntga o'z tilida. Bir do'konga 24 soatda bir martadan ko'p emas.
 */
export async function creditReminders(): Promise<{ reminded: number }> {
  const db = await adminDb()
  const snap = await db.collection('shops').where('balance', '>', 0).get()
  const now = Date.now()
  let reminded = 0
  for (const doc of snap.docs) {
    const shop = doc.data()
    const last = Date.parse(String(shop.creditRemindedAt || ''))
    if (Number.isFinite(last) && now - last < 20 * 3_600_000) continue
    const { overdue } = await creditState(doc.id, Number(shop.balance) || 0, now)
    if (overdue <= 0) continue
    const members = Array.isArray(shop.memberIds) ? shop.memberIds.map(String) : []
    const amount = overdue.toLocaleString('ru-RU').replace(/ /g, ' ')
    for (const uid of members) {
      const lang = (await userLang(Number(uid))) === 'ru' ? 'ru' : 'uz'
      await sendMessage(Number(uid), REMIND[lang](escapeHtml(String(shop.name || '')), amount)).catch(() => {})
    }
    await doc.ref.set({ creditRemindedAt: new Date(now).toISOString(), overdue }, { merge: true })
    reminded++
  }
  return { reminded }
}
