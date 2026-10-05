import { adminDb } from './firebase-admin.js'
import type { Staff } from './admin-auth.js'

/*
 * Kuryerni Telegram ID bo'yicha aniqlash — YENGIL modul.
 *
 * api/auth.ts har bir mijoz kirishida shu yerdan foydalanadi, shuning
 * uchun bu faylda buyurtma mantig'i (orders.ts, Linko) import qilinmaydi.
 */

/**
 * Buyurtma yetkaza oladimi: kuryer, yoki «kuryer sifatida ham ishlaydi»
 * belgisi yoqilgan ega/admin. Rol o'zgarmaydi — ega egaligicha qoladi.
 */
export function canDeliver(staff: { role?: unknown; canDeliver?: unknown }): boolean {
  return staff.role === 'courier' || staff.canDeliver === true
}

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** Toshkent bo'yicha oxirgi yarim tun (00:00), ms. */
export function tashkentMidnight(now = Date.now()): number {
  const local = now + TASHKENT_OFFSET_MS
  return local - (local % DAY_MS) - TASHKENT_OFFSET_MS
}

/**
 * Smena hozir ochiqmi. Smena Toshkent vaqti bilan 00:00 da o'zi
 * yopiladi: kechagi «Ishdaman» bugun hisobga olinmaydi — kuryer
 * o'chirishni unutsa ham kechasi unga buyurtma ketmaydi. Bazadagi
 * belgini keyin cron ham tozalaydi (shift.ts → endExpiredShifts), lekin
 * to'g'rilik unga bog'liq emas.
 */
export function shiftActive(data: { onShift?: unknown; shiftSince?: unknown }, now = Date.now()): boolean {
  if (data.onShift !== true) return false
  const since = Date.parse(String(data.shiftSince ?? ''))
  return Number.isFinite(since) && since >= tashkentMidnight(now)
}

/**
 * Kuryer telefoni — mijoz xaritasida ism yonida va qo'ng'iroq tugmasi.
 *
 * Avval Xodimlar bo'limidagi raqam; u yozilmagan bo'lsa — kuryer botga
 * ulashgan kontakt (`users/{telegramId}.phone`). Aks holda mijoz
 * kuryerga umuman qo'ng'iroq qila olmasdi.
 */
export async function courierPhone(staff: { phone?: unknown; telegramId?: unknown }): Promise<string | null> {
  const own = String(staff.phone ?? '').trim()
  if (own) return own
  const tg = Number(staff.telegramId)
  if (!Number.isFinite(tg) || !tg) return null
  try {
    const snap = await (await adminDb()).collection('users').doc(String(tg)).get()
    const phone = String(snap.data()?.phone ?? '').trim()
    return phone || null
  } catch {
    return null
  }
}

/** Telegram ID bo'yicha faol yetkazuvchi. Bo'lmasa — null. */
export async function courierByTelegram(telegramId: number): Promise<Staff | null> {
  if (!Number.isFinite(telegramId)) return null
  const db = await adminDb()
  const snap = await db.collection('staff').where('telegramId', '==', telegramId).limit(1).get()
  const doc = snap.docs[0]
  if (!doc) return null
  const data = doc.data()
  if (!canDeliver(data) || data.active === false) return null
  return {
    uid: doc.id,
    email: String(data.email || ''),
    name: String(data.name || 'Kuryer'),
    role: data.role === 'owner' || data.role === 'admin' ? data.role : 'courier',
    telegramId,
    phone: data.phone ?? null,
    active: true,
    canDeliver: true,
  }
}

/**
 * Ilova kuryer sahifasini ochishi uchun belgi: `users/{telegramId}.courier`.
 *
 * Ilova o'z profil hujjatini jonli tinglaydi, shuning uchun admin kuryer
 * qo'shishi bilan mini app o'zi kuryer rejimiga o'tadi. Belgi faqat
 * QAYSI SAHIFA chiqishini hal qiladi — huquq baribir har so'rovda
 * `staff` dan tekshiriladi (courierByTelegram). Mijoz bu maydonni o'zi
 * yoza olmaydi (firestore.rules → users update).
 *
 * Hujjat faqat mavjud bo'lsa yangilanadi: ilovani hali ochmagan
 * kuryerga bo'sh «mijoz» yozuvi yaratilmasin. Birinchi kirishda belgini
 * api/auth.ts qo'yadi.
 */
export async function syncCourierFlag(telegramId: number | null | undefined, courier: boolean) {
  if (!telegramId || !Number.isFinite(Number(telegramId))) return
  try {
    const ref = (await adminDb()).collection('users').doc(String(telegramId))
    const snap = await ref.get()
    if (!snap.exists) return
    if ((snap.data()?.courier === true) === courier) return
    await ref.set({ courier }, { merge: true })
  } catch (error) {
    // Belgi qo'yilmagani xodimni saqlashni to'xtatmasin
    console.error('[courier] belgi yozilmadi:', error)
  }
}
