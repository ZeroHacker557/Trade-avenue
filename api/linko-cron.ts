import type { VercelRequest, VercelResponse } from '@vercel/node'
import { linkoPull } from './_lib/actions/linko.js'
import { linkoProbe } from './_lib/linko.js'
import { endExpiredShifts } from './_lib/actions/shift.js'
import { linkoPushOrders, linkoSyncMarketTypes } from './_lib/actions/linko-orders.js'
import { expireUnpaidOrders } from './_lib/actions/payments.js'
import { fail } from './_lib/http.js'
import { runTasks } from './_lib/actions/scheduler.js'

/**
 * Linko katalogini jadval bo'yicha tortadi.
 *
 * Ikki joydan chaqiriladi:
 *   • Vercel Cron — `Authorization: Bearer <CRON_SECRET>` yuboradi;
 *   • bot (bot/bot.py) — `x-cron-secret` sarlavhasi bilan, kun davomida
 *     tez-tez, chunki Hobby rejasida cron kuniga bir marta ishlaydi.
 *
 * Admin panel esa `linko.pull` amali orqali qo'lda chaqiradi — mantiq
 * bitta joyda (api/_lib/actions/linko.ts).
 *
 * Shu bilan birga kechagi kuryer smenalari yopiladi (actions/shift.ts):
 * alohida funksiya ochilmadi — Vercel'da funksiyalar soni cheklangan.
 * Ikkinchi cron (19:00 UTC = Toshkent 00:00) aynan shu uchun.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = String(process.env.CRON_SECRET || '')
  if (!secret) return fail(res, 500, 'CRON_SECRET sozlanmagan', 'CRON_SECRET_MISSING')

  const header = String(req.headers.authorization || '')
  const provided = header.startsWith('Bearer ')
    ? header.slice(7)
    : String(req.headers['x-cron-secret'] || '')

  if (provided !== secret) return fail(res, 401, 'Ruxsat yo‘q', 'FORBIDDEN')

  // Diagnostika — faqat o'qish (qoldiq nega ayirilmayotganini aniqlash uchun)
  if (req.query.probe === '1') {
    const one = (v: unknown) => (typeof v === 'string' ? v : undefined)
    return res.status(200).json(await linkoProbe({
      product: one(req.query.product), order: one(req.query.order), path: one(req.query.path),
    }))
  }

  // Har daqiqalik jadval (bot → scheduler_loop): rejalashtirilgan e'lonlar,
  // aksiya e'loni, avtomatik zaxira nusxa. Linko sinxroni bu yerda emas.
  if (req.query.tasks === '1') {
    return res.status(200).json(await runTasks())
  }

  // Eski bot mijozlarining turini bir martada yangilash (faqat tur, boshqa maydonlar emas)
  if (req.query.markets === '1') {
    const one = typeof req.query.user === 'string' ? req.query.user : ''
    return res.status(200).json(await linkoSyncMarketTypes(one ? { userId: one } : {}))
  }

  // Smenalar Linko'dan mustaqil: sinxron yiqilsa ham yopilaversin
  let shifts: { ended: number } | { error: string }
  try {
    shifts = await endExpiredShifts()
  } catch (error) {
    console.error('[linko-cron] smenalar yopilmadi:', error)
    shifts = { error: error instanceof Error ? error.message : 'xato' }
  }

  // To'lanmay qolgan onlayn buyurtmalar bekor, qoldiq omborga qaytadi
  let unpaid: Record<string, unknown>
  try {
    unpaid = await expireUnpaidOrders()
  } catch (error) {
    console.error('[linko-cron] to‘lanmaganlar bekor qilinmadi:', error)
    unpaid = { error: error instanceof Error ? error.message : 'xato' }
  }

  /*
   * Buyurtmalar: Linko'ga tushmagan, xato bergan yoki holati eskirgan
   * (oxirgi 3 kun) — qayta yuboriladi. Odatda buyurtma yaratilganda va
   * holat o'zgarganda o'zi ketadi; bu — kafolat (Linko vaqtincha
   * ishlamay qolgan bo'lsa ham keyingi yurishda yetib boradi).
   */
  let orders: Record<string, unknown>
  try {
    orders = await linkoPushOrders(null, { days: 3 })
  } catch (error) {
    console.error('[linko-cron] buyurtmalar qayta yuborilmadi:', error)
    orders = { error: error instanceof Error ? error.message : 'xato' }
  }

  try {
    const result = await linkoPull(null, { full: req.query.full === '1' })
    return res.status(200).json({ ...result, shifts, orders, unpaid })
  } catch (error) {
    // Sinxron yiqilsa do'kon ishlashda davom etadi — faqat log va 200 emas 500
    console.error('[linko-cron] xato:', error)
    return fail(res, 500, error instanceof Error ? error.message : 'Sinxron bajarilmadi')
  }
}
