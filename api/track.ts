import type { VercelRequest, VercelResponse } from '@vercel/node'
import { adminAuth, adminDb } from './_lib/firebase-admin.js'
import { fail, requirePost } from './_lib/http.js'
import { isSource, noteOpen, resolveClick } from './_lib/campaigns.js'

/** Kuzatiladigan hodisalar. Boshqasi qabul qilinmaydi. */
const EVENTS = ['view', 'cart_add', 'checkout_start', 'campaign_open'] as const
type TrackEvent = (typeof EVENTS)[number]

/**
 * POST /api/track   { event, productId? }
 * Authorization: Bearer <Firebase ID token>
 *
 * Yengil analitika (12-band).
 *
 * Har bir hodisa uchun alohida hujjat yozilmaydi — bu qimmat bo'lardi.
 * O'rniga `analytics/products/items/{productId}` hujjatidagi
 * hisoblagichlar oshiriladi (increment). Kunlik yig'indi ham
 * `analytics/daily/days/{sana}` da saqlanadi.
 *
 * Mijoz bir mahsulotni bir seansda bir marta sanaydi — takroriy
 * so'rovlar mijoz tomonida to'siladi.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  /*
   * GET /api/track?go=<manba>&b=<tugma tartibi> — kanal/ommaviy xabardagi
   * «Havola» tugmasi. Bosish sanaladi va asl manzilga yo'naltiriladi
   * (manzil bazadagi e'londan — begona saytga yo'naltirib bo'lmaydi).
   */
  if (req.method === 'GET' && typeof req.query.go === 'string') {
    try {
      const url = await resolveClick(req.query.go, Number(req.query.b))
      if (url) {
        res.setHeader('Cache-Control', 'no-store')
        return res.redirect(302, url)
      }
    } catch (error) {
      console.error('[track] yo‘naltirish:', error)
    }
    return res.redirect(302, '/')
  }

  if (!requirePost(req, res)) return

  const authHeader = String(req.headers.authorization || '')
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!idToken) return fail(res, 401, 'Avtorizatsiya talab qilinadi')

  try {
    await (await adminAuth()).verifyIdToken(idToken)
  } catch {
    return fail(res, 401, 'Sessiya eskirgan')
  }

  const event = String(req.body?.event ?? '') as TrackEvent
  if (!EVENTS.includes(event)) return fail(res, 400, "Noma'lum hodisa")

  // Ilova kanal/ommaviy xabar tugmasidan ochildi
  if (event === 'campaign_open') {
    const source = req.body?.source
    if (!isSource(source)) return fail(res, 400, "Noma'lum manba")
    await noteOpen(source).catch((error) => console.error('[track] kampaniya:', error))
    return res.status(200).json({ ok: true })
  }

  const productId = req.body?.productId ? String(req.body.productId).slice(0, 64) : null

  try {
    const db = await adminDb()
    const { FieldValue } = await import('firebase-admin/firestore')
    const today = new Date().toISOString().slice(0, 10)

    const writes: Promise<unknown>[] = []

    // Kunlik yig'indi
    writes.push(
      db.collection('analytics').doc('daily').collection('days').doc(today).set(
        { [event]: FieldValue.increment(1), date: today },
        { merge: true },
      ),
    )

    // Mahsulot bo'yicha
    if (productId) {
      writes.push(
        db.collection('analytics').doc('products').collection('items').doc(productId).set(
          { [event]: FieldValue.increment(1), productId },
          { merge: true },
        ),
      )
    }

    await Promise.all(writes)
    return res.status(200).json({ ok: true })
  } catch (error) {
    // Analitika hech qachon foydalanuvchiga xalaqit bermasin
    console.error('[track] xato:', error)
    return res.status(200).json({ ok: false })
  }
}
