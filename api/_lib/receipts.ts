import { randomUUID } from 'node:crypto'
import { adminBucket } from './firebase-admin.js'

/**
 * Karta (o'tkazma) to'lovi cheki — mijoz buyurtma berishda mini app'dan
 * yuklaydi (src/components/checkout/ReceiptSheet.tsx). Storage `receipts/`
 * — mijozlar o'qiy olmaydi (storage.rules), havola faqat token bilan:
 * adminga Telegram'da va admin panelda ko'rinadi.
 */

const MAX_BYTES = 3 * 1024 * 1024
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export type ReceiptInput = { data: Buffer; contentType: string; ext: string }

/** So'rovdagi `receipt: { data: base64, contentType }` — noto'g'ri bo'lsa null. */
export function readReceipt(raw: unknown): ReceiptInput | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const contentType = String(r.contentType || '').toLowerCase()
  const ext = TYPES[contentType]
  if (!ext || typeof r.data !== 'string') return null
  const data = Buffer.from(r.data.slice(0, 6_000_000), 'base64')
  if (data.length < 1024 || data.length > MAX_BYTES) return null
  return { data, contentType, ext }
}

/** Storage ga yozadi, qaytaradi: token bilan ochiladigan havola. */
export async function uploadReceipt(userId: number, receipt: ReceiptInput): Promise<string> {
  const bucket = await adminBucket()
  const path = `receipts/${userId}-${Date.now()}-${randomUUID().slice(0, 8)}.${receipt.ext}`
  const token = randomUUID()
  await bucket.file(path).save(receipt.data, {
    resumable: false,
    contentType: receipt.contentType,
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  })
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`
}
