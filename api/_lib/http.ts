import type { VercelRequest, VercelResponse } from '@vercel/node'

/** Mini app va API bir domenda — CORS ochilmaydi, faqat metod tekshiriladi. */
export function requirePost(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Faqat POST' })
    return false
  }
  return true
}

/**
 * Xato javobi.
 *
 * `message` — o'zbekcha matn (eski mijozlar va loglar uchun), `code` esa
 * MASHINA o'qiydigan sabab: ilova uni o'z tilida ko'rsatadi
 * (src/utils/api-error.ts). `params` matndagi son yoki nomni beradi —
 * masalan minimal summa.
 */
export function fail(
  res: VercelResponse,
  status: number,
  message: string,
  code?: string,
  params?: Record<string, string | number>,
) {
  res.status(status).json({ error: message, ...(code ? { code } : {}), ...(params ? { params } : {}) })
}
