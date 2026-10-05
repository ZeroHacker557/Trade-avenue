import type { VercelRequest, VercelResponse } from '@vercel/node'
import { adminAuth } from './_lib/firebase-admin.js'
import { fail, requirePost } from './_lib/http.js'
import {
  courierArrived, courierDeliver, courierOverview, courierProblem, courierShift, courierTake,
} from './_lib/actions/courier.js'
import { courierCashHandover } from './_lib/actions/cash.js'
import { courierLocation } from './_lib/actions/location.js'
import { supportCourierRead, supportOpen, supportSend } from './_lib/actions/support.js'
import { courierByTelegram } from './_lib/courier-staff.js'
import { errorCode } from './_lib/errors.js'
import { audit } from './_lib/audit.js'

/**
 * POST /api/courier   { action: "overview" | "take" | "deliver" | "support.*", … }
 * Authorization: Bearer <Firebase ID token>
 *
 * Mini app'dagi kuryer sahifasi. Kuryer ilovaga Telegram orqali kiradi
 * (api/auth.ts), shuning uchun token uid'i — uning Telegram ID si.
 * Kuryerligi har so'rovda `staff` dan tekshiriladi: admin kuryerni
 * bloklasa, keyingi so'rovdayoq rad etiladi.
 */
/** Jurnal uchun: kuryer o'z ismi bilan (ega/admin ham yetkazishi mumkin). */
function courierActor(courier: { uid: string; name: string; role: string }) {
  return { uid: courier.uid, name: courier.name, role: courier.role }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requirePost(req, res)) return

  const authHeader = String(req.headers.authorization || '')
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!idToken) return fail(res, 401, 'Avtorizatsiya talab qilinadi')

  let uid: string
  try {
    uid = (await (await adminAuth()).verifyIdToken(idToken)).uid
  } catch {
    return fail(res, 401, 'Sessiya eskirgan, ilovani qayta oching', 'SESSION_EXPIRED')
  }

  const courier = await courierByTelegram(Number(uid))
  if (!courier) return fail(res, 403, 'Siz kuryer emassiz yoki hisobingiz faol emas', 'NOT_COURIER')

  const body = (req.body ?? {}) as Record<string, unknown>
  const action = typeof body.action === 'string' ? body.action : ''

  try {
    let result: object
    if (action === 'overview') result = await courierOverview(courier)
    else if (action === 'take') result = await courierTake(courier, body)
    else if (action === 'deliver') result = await courierDeliver(courier, body)
    else if (action === 'arrived') result = await courierArrived(courier, body)
    else if (action === 'shift') result = await courierShift(courier, body)
    else if (action === 'problem') result = await courierProblem(courier, body)
    else if (action === 'cash.handover') result = await courierCashHandover(courier)
    // Mini app ochiq turganda — admin xaritasi va mijoz kuzatuvi uchun
    else if (action === 'location') result = await courierLocation(courier, body)
    // Qo'llab-quvvatlash chati — o'qish ilovada jonli, yozish shu yerda
    else if (action === 'support.open') result = await supportOpen(courier, body)
    else if (action === 'support.send') result = await supportSend(courier, body)
    else if (action === 'support.read') result = await supportCourierRead(courier, body)
    else return fail(res, 400, `Noma’lum amal: ${action || '(bo‘sh)'}`, 'UNKNOWN_ACTION')

    await audit({ actor: courierActor(courier), source: 'courier', action, body, ok: true })
    return res.status(200).json({ ok: true, ...result })
  } catch (error) {
    console.error(`[courier] ${action} xatosi:`, error)
    await audit({
      actor: courierActor(courier),
      source: 'courier',
      action,
      body,
      ok: false,
      error: error instanceof Error ? error.message : 'xato',
    })
    // Kod bo'lsa ilova xatoni kuryerning tilida ko'rsatadi (api/_lib/errors.ts)
    return fail(res, 400, error instanceof Error ? error.message : 'Amal bajarilmadi', errorCode(error))
  }
}
