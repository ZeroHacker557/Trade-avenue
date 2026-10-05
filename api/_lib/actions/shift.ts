import { adminDb } from '../firebase-admin.js'
import { sendMessage } from '../telegram.js'
import { shiftActive } from '../courier-staff.js'
import { endShiftLocation } from './location.js'

const AUTO_END_TEXT =
  '🌙 <b>Smena avtomatik yakunlandi</b> (00:00).\n\n' +
  'Yangi buyurtma xabarlari endi kelmaydi. Ishga chiqqaningizda ilovada <b>«Ishdaman»</b> ni yoqing.'
const STOP_LIVE_HINT =
  '\n\n📍 Telegram jonli joylashuvni hali ulashyapti — joylashuv xabari ostidagi ' +
  '<b>«Ulashishni to‘xtatish»</b> ni bosing.'

/**
 * Kechagi smenalarni yopadi: `onShift` belgisi tozalanadi, joylashuv
 * admin xaritasidan o'chadi va kuryerga bot orqali xabar boradi.
 *
 * To'g'rilik bunga bog'liq emas — smena 00:00 dan keyin baribir ochiq
 * hisoblanmaydi (courier-staff.ts → shiftActive). Bu faqat tartib va
 * ogohlantirish. Faqat MUDDATI O'TGAN smenalarga tegadi, shuning uchun
 * istalgan vaqtda qayta chaqirish xavfsiz: bugun yoqilgan smena qoladi.
 *
 * Chaqiruvchi: api/linko-cron.ts (Vercel Cron 00:00 da va bot kun bo'yi).
 */
export async function endExpiredShifts(): Promise<{ ended: number }> {
  const db = await adminDb()
  const snap = await db.collection('staff').where('onShift', '==', true).get()
  const now = new Date().toISOString()
  let ended = 0

  for (const doc of snap.docs) {
    const data = doc.data() as { onShift?: boolean; shiftSince?: string; telegramId?: number }
    if (shiftActive(data)) continue
    await doc.ref.set({ onShift: false, shiftEndedAt: now, shiftAutoEnded: true }, { merge: true })
    const { liveWasOn } = await endShiftLocation(doc.id)
    if (data.telegramId) {
      await sendMessage(data.telegramId, AUTO_END_TEXT + (liveWasOn ? STOP_LIVE_HINT : '')).catch(() => undefined)
    }
    ended++
  }
  return { ended }
}
