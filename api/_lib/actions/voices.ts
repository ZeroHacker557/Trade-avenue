import { randomUUID } from 'node:crypto'
import { adminBucket, adminDb } from '../firebase-admin.js'
import type { Staff } from '../admin-auth.js'

/**
 * Kirish ovozlari — `settings/voices.items` (admin → «Kirish ovozlari»).
 * Mini app: src/utils/welcome-voice.ts; tur va tanlash: src/config/voices.ts.
 *
 * Fayl server orqali yuklanadi (Storage qoidalariga tegmaslik uchun) —
 * ovozlar kichik, Vercel so'rov chegarasi (~4.5 MB) yetadi.
 */

const MAX_ITEMS = 30
const MAX_BYTES = 3 * 1024 * 1024
/** iOS ham o'qiydigan formatlar (ogg/webm iPhone'da chalinmaydi). */
const TYPES: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
}
const MODES = ['always', 'daily', 'once']
const DAY = /^\d{4}-\d{2}-\d{2}$/

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** { name, contentType, data: base64 } → Storage `voices/…`, qaytaradi: { url }. */
export async function voicesUpload(_actor: Staff, body: Record<string, unknown>) {
  const type = str(body.contentType, 40).toLowerCase()
  const ext = TYPES[type]
  if (!ext) throw new Error('Faqat MP3, M4A yoki WAV ovoz yuklang')
  const data = Buffer.from(str(body.data, 6_000_000), 'base64')
  if (!data.length) throw new Error('Fayl bo‘sh')
  if (data.length > MAX_BYTES) throw new Error('Ovoz fayli 3 MB dan oshmasin')

  const bucket = await adminBucket()
  const path = `voices/${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`
  const token = randomUUID()
  await bucket.file(path).save(data, {
    resumable: false,
    contentType: type === 'audio/mp3' ? 'audio/mpeg' : type,
    metadata: { cacheControl: 'public, max-age=31536000', metadata: { firebaseStorageDownloadTokens: token } },
  })
  return { url: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}` }
}

function readItem(raw: unknown, index: number) {
  const v = (raw ?? {}) as Record<string, unknown>
  const n = index + 1
  const url = str(v.url, 1000)
  // Storage havolasi yoki ilova ichidagi standart fayl
  if (!/^https:\/\/firebasestorage\.googleapis\.com\/\S+$/i.test(url) && !/^\/sounds\/[\w.-]+(\?v=\d+)?$/.test(url)) {
    throw new Error(`${n}-ovoz: fayl havolasi noto‘g‘ri`)
  }
  const from = str(v.from, 10) || null
  const to = str(v.to, 10) || null
  if (from && !DAY.test(from)) throw new Error(`${n}-ovoz: boshlanish sanasi noto‘g‘ri`)
  if (to && !DAY.test(to)) throw new Error(`${n}-ovoz: tugash sanasi noto‘g‘ri`)
  if (from && to && from > to) throw new Error(`${n}-ovoz: boshlanish sanasi tugashidan keyin bo‘lmasin`)
  return {
    id: /^[\w-]{1,40}$/.test(String(v.id)) ? String(v.id) : `v${Date.now().toString(36)}${index}`,
    name: str(v.name, 80) || `Ovoz ${n}`,
    url,
    active: v.active !== false,
    from,
    to,
    mode: MODES.includes(String(v.mode)) ? String(v.mode) : 'always',
  }
}

export async function voicesSave(actor: Staff, body: Record<string, unknown>) {
  const list = Array.isArray(body.items) ? body.items : []
  if (list.length > MAX_ITEMS) throw new Error(`Ko‘pi bilan ${MAX_ITEMS} ta ovoz`)
  const items = list.map(readItem)
  await (await adminDb()).collection('settings').doc('voices').set(
    { items, updatedAt: new Date().toISOString(), updatedBy: actor.name || actor.email },
    { merge: true },
  )
  return { items }
}
