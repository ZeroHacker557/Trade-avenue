import type { VercelRequest, VercelResponse } from '@vercel/node'
import { FieldValue } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from './_lib/firebase-admin.js'
import { fail, requirePost } from './_lib/http.js'
import { CodedError } from './_lib/errors.js'
import {
  cleanCode, CODE_LENGTH, formatPhone, normalizePhone, readShop, shopOpen, shopPhones, shopsOfUser, syncUserClaims,
  type ShopDoc,
} from './_lib/shops.js'
import { escapeHtml, sendMessage } from './_lib/telegram.js'
import { adminTargets } from './_lib/actions/orders.js'

/** Shuncha noto'g'ri urinishdan keyin vaqtincha bloklanadi. */
const MAX_FAILS = 5
/** Urinishlar sanaladigan oyna va blok muddati. */
const WINDOW_MS = 15 * 60_000

/** Mini app ko'radigan do'kon ma'lumoti — kod va a'zolar ro'yxatisiz. */
function publicShop(shop: ShopDoc) {
  return {
    id: shop.id,
    name: shop.name,
    address: shop.address,
    location: shop.location,
    phones: shopPhones(shop).map(formatPhone),
    agentName: shop.agentName,
    priceListId: shop.priceListId,
  }
}

/**
 * Noto'g'ri urinishlar hisobi. Kod 6 belgili bo'lsa ham terib topishning
 * oldini olish uchun: 15 daqiqada 5 ta xato — 15 daqiqa blok.
 */
async function checkLock(uid: string): Promise<void> {
  const db = await adminDb()
  const snap = await db.collection('login_attempts').doc(uid).get()
  const lockedUntil = Date.parse(String(snap.data()?.lockedUntil || ''))
  if (Number.isFinite(lockedUntil) && lockedUntil > Date.now()) {
    const minutes = Math.ceil((lockedUntil - Date.now()) / 60_000)
    throw new CodedError('LOGIN_LOCKED', `Urinishlar ko‘p bo‘ldi — ${minutes} daqiqadan keyin qayta urinib ko‘ring`, { minutes })
  }
}

async function noteFail(uid: string): Promise<number> {
  const db = await adminDb()
  const ref = db.collection('login_attempts').doc(uid)
  return db.runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data() ?? {}
    const first = Date.parse(String(data.firstAt || ''))
    const fresh = !Number.isFinite(first) || Date.now() - first > WINDOW_MS
    const fails = (fresh ? 0 : Number(data.fails) || 0) + 1
    const now = new Date().toISOString()
    tx.set(ref, {
      fails,
      firstAt: fresh ? now : data.firstAt,
      lastAt: now,
      lockedUntil: fails >= MAX_FAILS ? new Date(Date.now() + WINDOW_MS).toISOString() : null,
    })
    return Math.max(0, MAX_FAILS - fails)
  })
}

/** Yangi ulanish — adminlarga xabar (xato bo'lsa jim: kirishni buzmasin). */
async function announce(shop: ShopDoc, uid: string): Promise<void> {
  try {
    const db = await adminDb()
    const user = (await db.collection('users').doc(uid).get()).data() ?? {}
    const who = [user.first_name, user.last_name].filter(Boolean).join(' ') || `ID ${uid}`
    const handle = user.username ? ` (@${user.username})` : ''
    const text =
      `🏪 <b>${escapeHtml(shop.name)}</b> ilovaga ulandi\n` +
      `👤 ${escapeHtml(who)}${escapeHtml(handle)}\n` +
      (shop.agentName ? `🧑‍💼 Agent: ${escapeHtml(shop.agentName)}\n` : '') +
      `👥 Ulangan akkauntlar: ${shop.memberIds.length + 1}`
    for (const chatId of await adminTargets()) await sendMessage(chatId, text)
  } catch (error) {
    console.error('[shop] ulanish xabari ketmadi:', error)
  }
}

async function login(uid: string, body: Record<string, unknown>) {
  await checkLock(uid)

  const phone = normalizePhone(body.phone)
  const code = cleanCode(body.code)
  if (!phone) throw new CodedError('PHONE_INVALID', 'Telefon raqamini to‘liq kiriting')
  if (code.length !== CODE_LENGTH) throw new CodedError('CODE_INVALID', 'Kod 6 ta belgidan iborat')

  const db = await adminDb()
  const codeSnap = await db.collection('shop_codes').where('code', '==', code).limit(1).get()
  const shopId = codeSnap.empty ? null : codeSnap.docs[0].id
  const shopSnap = shopId ? await db.collection('shops').doc(shopId).get() : null
  const shop = shopSnap?.exists ? readShop(shopSnap.id, shopSnap.data()) : null

  // Kod yoki raqam mos kelmasa — bir xil javob: qaysi biri xatoligini aytmaymiz
  if (!shop || !shopPhones(shop).includes(phone)) {
    const left = await noteFail(uid)
    if (left === 0) {
      throw new CodedError('LOGIN_LOCKED', 'Urinishlar ko‘p bo‘ldi — 15 daqiqadan keyin qayta urinib ko‘ring', { minutes: 15 })
    }
    throw new CodedError('LOGIN_WRONG', `Telefon raqami yoki kod noto‘g‘ri. Yana ${left} ta urinish qoldi`, { left })
  }
  if (!shopOpen(shop)) throw new CodedError('SHOP_BLOCKED', 'Bu do‘kon vaqtincha bloklangan — agentingiz bilan bog‘laning')

  const already = shop.memberIds.includes(uid)
  if (!already) {
    await shopSnap!.ref.update({ memberIds: FieldValue.arrayUnion(uid), updatedAt: new Date().toISOString() })
  }
  await db.collection('login_attempts').doc(uid).delete().catch(() => {})
  await db.collection('users').doc(uid).set({ activeShopId: shop.id, phone: formatPhone(phone) }, { merge: true })

  const shops = await shopsOfUser(uid)
  await syncUserClaims(uid, shops)
  if (!already) await announce(shop, uid)

  return { shop: publicShop(shop), shops: shops.map(publicShop) }
}

async function leave(uid: string, body: Record<string, unknown>) {
  const shopId = String(body.shopId ?? '').trim()
  if (!shopId) throw new CodedError('SHOP_MISSING', 'Do‘kon tanlanmagan')
  const db = await adminDb()
  await db.collection('shops').doc(shopId).update({
    memberIds: FieldValue.arrayRemove(uid),
    updatedAt: new Date().toISOString(),
  }).catch(() => {})
  const shops = await shopsOfUser(uid)
  await syncUserClaims(uid, shops)
  return { shops: shops.map(publicShop) }
}

async function list(uid: string) {
  const shops = await shopsOfUser(uid)
  // Admin uzib qo'ygan bo'lsa ham claim shu yerda to'g'rilanadi
  await syncUserClaims(uid, shops)
  return { shops: shops.map(publicShop) }
}

/**
 * POST /api/shop   Authorization: Bearer <Firebase ID token>
 *
 *   { action: 'login', phone, code }  — do'konga kirish (akkaunt bog'lanadi)
 *   { action: 'leave', shopId }       — shu do'kondan chiqish
 *   { action: 'list' }                — bog'langan do'konlar
 *
 * Har amaldan keyin custom claim yangilanadi; ilova tokenni majburan
 * yangilaydi (getIdToken(true)) — katalog va narxlar shundan keyin ochiladi.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requirePost(req, res)) return

  const header = String(req.headers.authorization || '')
  const idToken = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!idToken) return fail(res, 401, 'Avtorizatsiya talab qilinadi', 'SESSION_EXPIRED')

  let uid: string
  try {
    uid = (await (await adminAuth()).verifyIdToken(idToken)).uid
  } catch {
    return fail(res, 401, 'Sessiya eskirgan, ilovani qayta oching', 'SESSION_EXPIRED')
  }
  // Faqat Telegram orqali kirganlar (uid — Telegram ID). Xodimlarning email seansi emas.
  if (!/^\d+$/.test(uid)) return fail(res, 403, 'Faqat Telegram orqali', 'NO_TELEGRAM')

  const body = (req.body ?? {}) as Record<string, unknown>
  try {
    const action = String(body.action || '')
    const result = action === 'login'
      ? await login(uid, body)
      : action === 'leave'
        ? await leave(uid, body)
        : action === 'list'
          ? await list(uid)
          : null
    if (!result) return fail(res, 400, 'Noma’lum amal', 'UNKNOWN_ACTION')
    return res.status(200).json(result)
  } catch (error) {
    if (error instanceof CodedError) {
      const status = error.code === 'LOGIN_LOCKED' ? 429 : 400
      return fail(res, status, error.message, error.code, error.params)
    }
    console.error('[shop] xato:', error)
    return fail(res, 500, 'Amal bajarilmadi, qayta urinib ko‘ring')
  }
}
