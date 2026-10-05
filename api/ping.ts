import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * GET /api/ping — sozlamalarni tekshirish uchun.
 *
 * Hech qanday tashqi kutubxona import qilmaydi, shuning uchun bu javob
 * bersa-yu boshqa endpointlar bermasa, muammo kutubxonalarda demak.
 *
 * Kalitlarning O'ZINI qaytarmaydi — faqat mavjudligini va uzunligini.
 */
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const botToken = process.env.BOT_TOKEN || ''
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT || ''

  let serviceAccountValid = false
  let serviceAccountProject: string | null = null
  let serviceAccountError: string | null = null

  if (serviceAccount) {
    try {
      const parsed = JSON.parse(serviceAccount)
      serviceAccountProject = parsed.project_id ?? null
      serviceAccountValid = Boolean(
        parsed.project_id && parsed.client_email && parsed.private_key,
      )
      if (!serviceAccountValid) serviceAccountError = 'JSON to‘liq emas'
    } catch {
      serviceAccountError = 'JSON o‘qib bo‘lmadi'
    }
  }

  let firebaseAdminLoads = false
  let firebaseAdminError: string | null = null
  try {
    await import('firebase-admin/app')
    firebaseAdminLoads = true
  } catch (error) {
    firebaseAdminError = error instanceof Error ? error.message : 'noma’lum xato'
  }

  res.status(200).json({
    ok: true,
    node: process.version,
    botToken: {
      set: Boolean(botToken),
      length: botToken.length,
    },
    serviceAccount: {
      set: Boolean(serviceAccount),
      length: serviceAccount.length,
      valid: serviceAccountValid,
      projectId: serviceAccountProject,
      error: serviceAccountError,
    },
    firebaseAdmin: {
      loads: firebaseAdminLoads,
      error: firebaseAdminError,
    },
  })
}
