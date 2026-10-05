import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireStaff } from '../_lib/admin-auth.js'
import { adminDb } from '../_lib/firebase-admin.js'
import { audit } from '../_lib/audit.js'

/**
 * GET /api/admin/session
 * → { staff: { uid, email, name, role, ... } }
 *
 * Kirgandan keyin birinchi so'rov: brauzerdagi Firebase seansi haqiqiy
 * xodimga tegishlimi va u hali bloklanmaganmi — shuni aniqlaydi.
 * Rol ham shu yerdan keladi, mijoz tomonidagi rolga ishonilmaydi.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Faqat GET' })
  }

  // Eng past rol — kuryer ham o'z seansini tekshira olishi kerak
  const staff = await requireStaff(req, res, 'courier')
  if (!staff) return

  await noteLogin(staff).catch((error) => console.error('[session] kirish yozilmadi:', error))
  return res.status(200).json({ staff })
}

/** Oxirgi kirishdan 6 soat o'tgan bo'lsa — jurnalga «Panelga kirdi». */
const LOGIN_GAP = 6 * 60 * 60 * 1000
async function noteLogin(staff: { uid: string; name: string; email: string; role: string }) {
  const db = await adminDb()
  const ref = db.collection('staff').doc(staff.uid)
  const last = Date.parse(String((await ref.get()).data()?.lastLoginAt ?? ''))
  if (Number.isFinite(last) && Date.now() - last < LOGIN_GAP) return
  const now = new Date().toISOString()
  await ref.set({ lastLoginAt: now }, { merge: true })
  await audit({
    actor: { uid: staff.uid, name: staff.name || staff.email, role: staff.role },
    source: 'panel',
    action: 'session.login',
    body: {},
    ok: true,
  })
}
