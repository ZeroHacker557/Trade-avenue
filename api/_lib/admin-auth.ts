import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { adminAuth, adminDb } from './firebase-admin.js'
import { fail } from './http.js'

/**
 * Xodim rollari.
 *
 *   owner   — hamma narsa, shu jumladan boshqa adminlarni boshqarish
 *   admin   — kundalik ish: buyurtma, mahsulot, mijoz, broadcast
 *   courier — faqat o'ziga biriktirilgan buyurtmalar va ularning holati
 */
export type StaffRole = 'owner' | 'admin' | 'courier'

export type Staff = {
  uid: string
  email: string
  name: string
  role: StaffRole
  /** Telegram ID — buyurtma xabarnomalari shu manzilga boradi. */
  telegramId?: number | null
  phone?: string | null
  active: boolean
  /**
   * Ega yoki admin kuryer sifatida ham ishlaydi — mini app'da kuryer
   * sahifasi ochiladi va buyurtma xabarlari keladi. Kuryer rolida
   * ma'nosi yo'q (u baribir kuryer).
   */
  canDeliver?: boolean
}

/** Rol ierarxiyasi: yuqoridagi quyidagining hamma huquqini o'z ichiga oladi. */
const RANK: Record<StaffRole, number> = { courier: 1, admin: 2, owner: 3 }

export function atLeast(role: StaffRole, required: StaffRole): boolean {
  return RANK[role] >= RANK[required]
}

/**
 * `Authorization: Bearer <Firebase ID token>` sarlavhasini tekshiradi.
 *
 * Faqat imzoni emas, Firestore'dagi `staff/{uid}` hujjatini ham o'qiydi:
 * custom claim tokenga yozilgan bo'lsa-da, xodim o'chirilganda yoki
 * bloklanganda token muddati tugagunicha (1 soat) amal qilib turaveradi.
 * Hujjatni har so'rovda tekshirish — bloklash darhol kuchga kirishi uchun.
 *
 * Ruxsat bo'lmasa javobni O'ZI yozadi va null qaytaradi.
 */
export async function requireStaff(
  req: VercelRequest,
  res: VercelResponse,
  required: StaffRole = 'admin',
): Promise<Staff | null> {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) {
    fail(res, 401, 'Tizimga kirilmagan')
    return null
  }

  let uid: string
  try {
    const decoded = await (await adminAuth()).verifyIdToken(token, true)
    uid = decoded.uid
  } catch (error) {
    /*
     * Ikki xil xato bir xil ko'rinmasin.
     *
     * Token haqiqatan eskirgan bo'lsa — qaytadan kirish kerak. Lekin
     * Google'ga ulanib bo'lmasa yoki funksiya sovuqdan ishga tushayotgan
     * bo'lsa ham shu yerga tushardi va admin «seans tugadi» deb
     * chiqarib yuborilardi. Bunday xato o'tkinchi — 503 qaytaramiz,
     * panel esa o'zi qayta uradi (src/admin/AdminApp.tsx).
     */
    const code = (error as { code?: string })?.code || ''
    if (code === 'auth/internal-error' || code === 'auth/network-request-failed') {
      console.error('[admin-auth] tekshirib bo‘lmadi:', error)
      fail(res, 503, 'Serverga ulanib bo‘lmadi — qayta urinib ko‘ring')
      return null
    }
    fail(res, 401, 'Seans muddati tugagan — qaytadan kiring')
    return null
  }

  let snap
  try {
    snap = await (await adminDb()).collection('staff').doc(uid).get()
  } catch (error) {
    console.error('[admin-auth] staff o‘qilmadi:', error)
    fail(res, 500, 'Server xatosi')
    return null
  }

  if (!snap.exists) {
    fail(res, 403, 'Sizda admin panelga ruxsat yo‘q')
    return null
  }

  const data = snap.data() as Partial<Staff>
  const staff: Staff = {
    uid,
    email: String(data.email || ''),
    name: String(data.name || ''),
    role: (data.role as StaffRole) || 'courier',
    telegramId: data.telegramId ?? null,
    phone: data.phone ?? null,
    active: data.active !== false,
    canDeliver: data.canDeliver === true,
  }

  if (!staff.active) {
    fail(res, 403, 'Hisobingiz bloklangan')
    return null
  }

  if (!atLeast(staff.role, required)) {
    fail(res, 403, 'Bu amal uchun huquqingiz yetarli emas')
    return null
  }

  return staff
}


/** Bot imzosi shuncha soniya amal qiladi. */
const BOT_SIGNATURE_TTL = 300

/**
 * Telegram botidan kelgan so'rovni tekshiradi.
 *
 * Nega kerak? Admin botdagi «Qabul qilindi» tugmasini bosganda buyurtma
 * xuddi paneldagidek qayta ishlanishi kerak: holat, tarix, kuryerga
 * yuborish, mijozga xabar. Bu mantiq shu yerda — TypeScript'da. Botda
 * qayta yozilsa ikki nusxa paydo bo'lib, vaqt o'tib bir-biridan farq
 * qilib ketardi.
 *
 * Bot Firebase ID token olmaydi (u foydalanuvchi seansi), shuning uchun
 * o'zaro ma'lum sir — BOT_TOKEN — bilan imzolaydi:
 *
 *   payload   = "<telegramId>.<action>.<orderId>.<unix vaqt>"
 *   signature = HMAC-SHA256(payload, BOT_TOKEN)
 *
 * Vaqt imzoga kiritilgani uchun eski so'rovni qayta yuborib bo'lmaydi
 * (5 daqiqadan keyin qabul qilinmaydi). Kim ekanligi Firestore'dan
 * `staff.telegramId` bo'yicha topiladi — ya'ni bot faqat «kim bosdi»
 * deb ayta oladi, huquqni baribir staff hujjati beradi.
 *
 * Sarlavhalar yo'q bo'lsa `undefined` qaytaradi — chaqiruvchi oddiy
 * token tekshiruviga o'tadi. Sarlavha bor-u imzo noto'g'ri bo'lsa
 * javobni o'zi yozadi va `null` qaytaradi.
 */
export async function staffFromBot(
  req: VercelRequest,
  res: VercelResponse,
): Promise<Staff | null | undefined> {
  const signature = String(req.headers['x-bot-signature'] || '')
  const actor = String(req.headers['x-bot-actor'] || '')
  const ts = String(req.headers['x-bot-ts'] || '')
  if (!signature && !actor && !ts) return undefined

  const secret = process.env.BOT_TOKEN
  if (!secret) {
    fail(res, 500, 'BOT_TOKEN sozlanmagan')
    return null
  }
  if (!signature || !actor || !ts) {
    fail(res, 401, 'Bot imzosi to‘liq emas')
    return null
  }

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(ts))
  if (!Number.isFinite(age) || age > BOT_SIGNATURE_TTL) {
    fail(res, 401, 'Bot imzosi muddati tugagan')
    return null
  }

  const action = typeof req.body?.action === 'string' ? req.body.action : ''
  const orderId = typeof req.body?.orderId === 'string' ? req.body.orderId : ''
  const expected = createHmac('sha256', secret)
    .update(`${actor}.${action}.${orderId}.${ts}`)
    .digest('hex')

  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    fail(res, 401, 'Bot imzosi noto‘g‘ri')
    return null
  }

  const telegramId = Number(actor)
  if (!Number.isFinite(telegramId)) {
    fail(res, 401, 'Bot foydalanuvchisi noto‘g‘ri')
    return null
  }

  let snap
  try {
    snap = await (await adminDb())
      .collection('staff')
      .where('telegramId', '==', telegramId)
      .limit(1)
      .get()
  } catch (error) {
    console.error('[admin-auth] bot uchun staff o‘qilmadi:', error)
    fail(res, 500, 'Server xatosi')
    return null
  }

  if (snap.empty) {
    fail(res, 403, 'Sizda ruxsat yo‘q')
    return null
  }

  const doc = snap.docs[0]
  const data = doc.data() as Partial<Staff>
  const staff: Staff = {
    uid: doc.id,
    email: String(data.email || ''),
    name: String(data.name || ''),
    role: (data.role as StaffRole) || 'courier',
    telegramId,
    phone: data.phone ?? null,
    active: data.active !== false,
    canDeliver: data.canDeliver === true,
  }

  if (!staff.active) {
    fail(res, 403, 'Hisobingiz bloklangan')
    return null
  }

  return staff
}
