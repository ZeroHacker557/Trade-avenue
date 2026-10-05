import type { VercelRequest, VercelResponse } from '@vercel/node'
import { adminAuth, adminDb } from './_lib/firebase-admin.js'
import { fail } from './_lib/http.js'
import { AWAITING_PAYMENT } from './_lib/actions/orders.js'
import {
  checkPayment, confirmCardPayment, handleWebhook, onlineSettings, readProvider, startPayment,
} from './_lib/actions/payments.js'
import { CodedError } from './_lib/errors.js'
import type { WebhookPayload } from './_lib/wlcm.js'

/**
 * Onlayn to'lov (WLCM) — uch ish bitta funksiyada (Vercel'da funksiyalar
 * soni cheklangan):
 *
 *   POST /api/payment?hook=wlcm   — WLCM webhook (imzo bilan, tokensiz)
 *   POST /api/payment  {orderId, provider?}
 *        Authorization: Bearer <Firebase ID token>
 *        — mijoz to'lanmagan buyurtmasini qayta to'laydi (yangi sahifa)
 *   POST /api/payment  {orderId, check: true}
 *        — to'lov holatini WLCM'dan so'rash (kutish oynasi, webhook kechiksa)
 *   POST /api/payment  {orderId, otp}
 *        — karta bilan to'lovda SMS kodni tasdiqlash
 *   GET  /api/payment?return=<orderId>
 *        — to'lovdan keyin mijoz qaytadigan sahifa («Telegram'ga qayting»)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET' && req.query.return !== undefined) return returnPage(res)

  if (req.method !== 'POST') return fail(res, 405, 'Faqat POST')

  // ── Webhook ──
  if (req.query.hook === 'wlcm') {
    try {
      const header = req.headers['x-webhook-signature']
      const result = await handleWebhook(
        (req.body || {}) as WebhookPayload,
        Array.isArray(header) ? header[0] : header,
      )
      if (!result.ok) {
        console.warn('[payment] webhook rad etildi:', result.result)
        return res.status(result.result === 'bad_signature' ? 401 : 400).json(result)
      }
      return res.status(200).json(result)
    } catch (error) {
      console.error('[payment] webhook xatosi:', error)
      // 500 — WLCM qayta yuboradi
      return fail(res, 500, 'webhook_error')
    }
  }

  // ── Mijoz: qayta to'lash ──
  const header = String(req.headers.authorization || '')
  const idToken = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!idToken) return fail(res, 401, 'Avtorizatsiya talab qilinadi')
  let uid: string
  try {
    uid = (await (await adminAuth()).verifyIdToken(idToken)).uid
  } catch {
    return fail(res, 401, 'Sessiya eskirgan, ilovani qayta oching')
  }

  const orderId = String(req.body?.orderId ?? '').trim()
  if (!orderId) return fail(res, 400, 'Buyurtma tanlanmagan')

  const db = await adminDb()
  const snap = await db.collection('orders').doc(orderId).get()
  const order = snap.data()
  if (!order || Number(order.userId) !== Number(uid)) return fail(res, 404, 'Buyurtma topilmadi')
  // Holatni so'rash — o'z buyurtmasi, javob faqat natija nomi
  if (req.body?.check === true) {
    try {
      const result = await checkPayment(orderId)
      return res.status(200).json({ result: result.result })
    } catch (error) {
      console.warn('[payment] holat so‘rovi:', error)
      return res.status(200).json({ result: 'unknown' })
    }
  }

  // Karta: SMS kodni tasdiqlash
  if (req.body?.otp !== undefined) {
    try {
      const result = await confirmCardPayment(orderId, String(req.body.otp))
      return res.status(200).json(result)
    } catch (error) {
      if (error instanceof CodedError) return fail(res, 400, error.message, error.code)
      console.error('[payment] SMS kod tasdiqlanmadi:', error instanceof Error ? error.message : 'xato')
      return fail(res, 502, 'Kodni tekshirib bo‘lmadi, qayta urinib ko‘ring', 'PAYMENT_START')
    }
  }

  if (order.paidAt) return fail(res, 400, 'Buyurtma allaqachon to‘langan', 'ALREADY_PAID')
  if (order.status !== AWAITING_PAYMENT) return fail(res, 400, 'Buyurtma to‘lov kutmayapti', 'NOT_AWAITING')

  const online = await onlineSettings(Number(uid))
  if (!online.enabled) return fail(res, 400, 'Onlayn to‘lov hozircha o‘chiq', 'ONLINE_DISABLED')
  /*
   * Qayta to'lash — to'lov sahifasi orqali. Karta bilan boshlangan buyurtmada
   * karta ma'lumoti saqlanmagan, shuning uchun Payme sahifasi ochiladi (u ham
   * Uzcard/Humo kartani qabul qiladi).
   */
  const requested = readProvider(req.body?.provider) ?? readProvider(order.payment?.provider)
  const provider = requested === 'card'
    ? (['payme', 'click'] as const).find((p) => online.providers.includes(p)) ?? null
    : requested
  if (!provider || !online.providers.includes(provider)) return fail(res, 400, 'To‘lov usuli tanlanmagan', 'BAD_PROVIDER')

  try {
    const payment = await startPayment(orderId, order, provider)
    return res.status(200).json({ checkoutUrl: payment.checkoutUrl, provider })
  } catch (error) {
    console.error('[payment] qayta to‘lov yaratilmadi:', error)
    return fail(res, 502, 'To‘lov sahifasini ochib bo‘lmadi, keyinroq urinib ko‘ring', 'PAYMENT_START')
  }
}

/**
 * To'lov sahifasidan keyin brauzerda ochiladi. Holatni bu yerda
 * ko'rsatmaymiz (webhook biroz kechikishi mumkin) — ilova buyurtmani
 * jonli kuzatadi va natijani o'zi ko'rsatadi. Bu sahifa faqat mijozni
 * Telegram'ga qaytaradi.
 */
function returnPage(res: VercelResponse) {
  const bot = String(process.env.BOT_USERNAME || 'musauz_bot').replace(/^@/, '')
  const html = `<!doctype html>
<html lang="uz"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MUSA — to‘lov</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,sans-serif;background:#f1f7f3;color:#0f1a14}
  .c{max-width:340px;padding:32px 24px;text-align:center}
  .i{width:72px;height:72px;margin:0 auto 18px;border-radius:50%;display:grid;place-items:center;background:#0a7a3d;color:#fff;font-size:36px}
  h1{font-size:20px;margin:0 0 8px}p{margin:0 0 22px;color:#51645a;font-size:14px;line-height:1.5}
  a{display:block;padding:14px;border-radius:14px;background:#0a7a3d;color:#fff;text-decoration:none;font-weight:700}
</style></head>
<body><div class="c">
  <div class="i">✓</div>
  <h1>To‘lov sahifasi yopildi</h1>
  <p>Buyurtmangiz holati MUSA ilovasida ko‘rinadi.<br>Оплата завершена — вернитесь в Telegram.</p>
  <a href="https://t.me/${bot}">Telegram'ga qaytish</a>
</div></body></html>`
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).send(html)
}
