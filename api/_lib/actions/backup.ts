import { gunzipSync, gzipSync } from 'node:zlib'
import { adminBucket, adminDb } from '../firebase-admin.js'
import type { Staff } from '../admin-auth.js'

/**
 * Zaxira nusxa — butun Firestore bazasi bitta siqilgan JSON faylda.
 *
 * Fayl Storage'dagi `backups/` ga tushadi (storage.rules bu yo'lni hamma
 * uchun yopgan — faqat server o'qiydi). Avtomatik: har daqiqalik jadval
 * (api/_lib/actions/scheduler.ts) oxirgi nusxadan `intervalDays` o'tgan
 * bo'lsa yangisini oladi. Eng yangi `keep` tasi qoladi, eskilari o'chadi.
 *
 * Firestore'ning maxsus turlari (Timestamp, GeoPoint, hujjat havolasi)
 * `{ __t: ... }` ko'rinishida saqlanadi va tiklashda o'z turiga qaytadi.
 */

const PREFIX = 'backups/'
/** Ichki kolleksiyalar — collectionGroup orqali to'liq olinadi. */
const SUBCOLLECTIONS = ['history', 'messages', 'days', 'items']
/** Vaqtinchalik belgilar — nusxaga kerak emas. */
const SKIP = new Set(['signals'])
const FILE_RE = /^backups\/[\w.-]{5,80}\.json\.gz$/

type BackupSettings = { auto: boolean; intervalDays: number; keep: number; lastAt: string | null }
const DEFAULTS: BackupSettings = { auto: true, intervalDays: 7, keep: 12, lastAt: null }

async function readSettings(): Promise<BackupSettings> {
  const snap = await (await adminDb()).collection('settings').doc('backup').get()
  const data = snap.data() ?? {}
  return {
    auto: data.auto !== false,
    intervalDays: Math.min(30, Math.max(1, Number(data.intervalDays) || DEFAULTS.intervalDays)),
    keep: Math.min(52, Math.max(2, Number(data.keep) || DEFAULTS.keep)),
    lastAt: typeof data.lastAt === 'string' ? data.lastAt : null,
  }
}

// ─── Turlarni saqlash va qaytarish ────────────────────────────

type Encoded = unknown

function encode(value: unknown): Encoded {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) return value.map(encode)
  if (typeof value === 'object') {
    // Oddiy {latitude, longitude} obyekti GeoPoint EMAS — tur konstruktor nomidan
    const kind = (value as object).constructor?.name
    const v = value as Record<string, unknown> & { toDate?: () => Date }
    if (kind === 'Timestamp' && typeof v.toDate === 'function') return { __t: 'ts', v: v.toDate().toISOString() }
    if (kind === 'GeoPoint') return { __t: 'geo', lat: Number(v.latitude), lng: Number(v.longitude) }
    if (kind === 'DocumentReference') return { __t: 'ref', path: String((v as { path: string }).path) }
    const out: Record<string, Encoded> = {}
    for (const [k, inner] of Object.entries(v)) out[k] = encode(inner)
    return out
  }
  return value
}

async function decoder() {
  const { Timestamp, GeoPoint } = await import('firebase-admin/firestore')
  const db = await adminDb()
  const decode = (value: unknown): unknown => {
    if (value === null || typeof value !== 'object') return value
    if (Array.isArray(value)) return value.map(decode)
    const v = value as Record<string, unknown>
    if (v.__t === 'ts') return Timestamp.fromDate(new Date(String(v.v)))
    if (v.__t === 'geo') return new GeoPoint(Number(v.lat), Number(v.lng))
    if (v.__t === 'ref') return db.doc(String(v.path))
    const out: Record<string, unknown> = {}
    for (const [k, inner] of Object.entries(v)) out[k] = decode(inner)
    return out
  }
  return decode
}

// ─── Amallar ──────────────────────────────────────────────────

/** Nusxa olish. `by` — kim (yoki «avtomatik»). */
export async function backupRun(by: string, reason: 'manual' | 'auto' = 'manual') {
  const started = Date.now()
  const db = await adminDb()
  const docs: Record<string, Encoded> = {}
  const counts: Record<string, number> = {}

  for (const coll of await db.listCollections()) {
    if (SKIP.has(coll.id)) continue
    const snap = await coll.get()
    counts[coll.id] = snap.size
    for (const doc of snap.docs) docs[doc.ref.path] = encode(doc.data())
  }
  for (const name of SUBCOLLECTIONS) {
    const snap = await db.collectionGroup(name).get()
    if (snap.size) counts[`*/${name}`] = snap.size
    for (const doc of snap.docs) docs[doc.ref.path] = encode(doc.data())
  }

  const createdAt = new Date().toISOString()
  const total = Object.keys(docs).length
  const gz = gzipSync(Buffer.from(JSON.stringify({ version: 1, createdAt, counts, docs })))
  const name = `${PREFIX}${createdAt.replace(/[:.]/g, '-')}-${reason}.json.gz`

  const bucket = await adminBucket()
  await bucket.file(name).save(gz, {
    contentType: 'application/gzip',
    resumable: false,
    metadata: { metadata: { docs: String(total), reason, by: by.slice(0, 80) } },
  })

  const settings = await readSettings()
  await db.collection('settings').doc('backup').set(
    { lastAt: createdAt, lastFile: name, lastSize: gz.length, lastDocs: total },
    { merge: true },
  )

  // Eskilari: eng yangi `keep` tasi qoladi
  const [files] = await bucket.getFiles({ prefix: PREFIX })
  const sorted = files.filter((f) => FILE_RE.test(f.name)).sort((a, b) => b.name.localeCompare(a.name))
  for (const old of sorted.slice(settings.keep)) await old.delete().catch(() => undefined)

  return { ok: true, name, docs: total, size: gz.length, counts, ms: Date.now() - started }
}

export async function backupList() {
  const bucket = await adminBucket()
  const [files] = await bucket.getFiles({ prefix: PREFIX })
  const list = files
    .filter((f) => FILE_RE.test(f.name))
    .map((f) => {
      const meta = (f.metadata ?? {}) as { size?: string | number; timeCreated?: string; metadata?: Record<string, string> }
      return {
        name: f.name,
        size: Number(meta.size) || 0,
        createdAt: meta.timeCreated ?? null,
        docs: Number(meta.metadata?.docs) || null,
        reason: meta.metadata?.reason ?? null,
        by: meta.metadata?.by ?? null,
      }
    })
    .sort((a, b) => b.name.localeCompare(a.name))
  return { files: list, settings: await readSettings() }
}

function checkName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!FILE_RE.test(name)) throw new Error('Nusxa topilmadi')
  return name
}

/** 10 daqiqalik yuklab olish havolasi. */
export async function backupDownload(body: Record<string, unknown>) {
  const file = (await adminBucket()).file(checkName(body.name))
  const [exists] = await file.exists()
  if (!exists) throw new Error('Nusxa topilmadi')
  const [url] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 10 * 60 * 1000 })
  return { url }
}

export async function backupDelete(body: Record<string, unknown>) {
  await (await adminBucket()).file(checkName(body.name)).delete()
  return backupList()
}

export async function backupSettings(body: Record<string, unknown>) {
  const update: Record<string, unknown> = {}
  if ('auto' in body) update.auto = body.auto === true
  if ('intervalDays' in body) update.intervalDays = Math.min(30, Math.max(1, Math.round(Number(body.intervalDays) || 7)))
  if ('keep' in body) update.keep = Math.min(52, Math.max(2, Math.round(Number(body.keep) || 12)))
  await (await adminDb()).collection('settings').doc('backup').set(update, { merge: true })
  return backupList()
}

/** Fayl ichidagi kolleksiyalar va hujjatlar soni — tiklashdan oldin ko'rish uchun. */
async function readBackup(name: string) {
  const [buffer] = await (await adminBucket()).file(name).download()
  const parsed = JSON.parse(gunzipSync(buffer).toString('utf8')) as {
    version: number
    createdAt: string
    counts: Record<string, number>
    docs: Record<string, unknown>
  }
  if (parsed.version !== 1 || !parsed.docs) throw new Error('Nusxa fayli buzilgan')
  return parsed
}

export async function backupInspect(body: Record<string, unknown>) {
  const data = await readBackup(checkName(body.name))
  return { createdAt: data.createdAt, counts: data.counts }
}

/**
 * Tanlangan kolleksiyalarni nusxadagi holatga qaytaradi.
 *
 * Nusxadagi har hujjat ustidan yoziladi (set). Nusxadan KEYIN yaratilgan
 * hujjatlar o'chirilmaydi — tiklash hech narsani yo'qotmaydi, faqat
 * qaytaradi. Ichki kolleksiyalar ota kolleksiyasi bilan birga ketadi
 * (masalan `orders` → `orders/*\/history`).
 */
export async function backupRestore(actor: Staff, body: Record<string, unknown>) {
  if (actor.role !== 'owner') throw new Error('Tiklashni faqat ega bajaradi')
  const name = checkName(body.name)
  const wanted = Array.isArray(body.collections)
    ? body.collections.map((c) => String(c)).filter((c) => /^[\w-]{1,60}$/.test(c))
    : []
  if (!wanted.length) throw new Error('Kamida bitta kolleksiyani tanlang')
  if (body.confirm !== 'TIKLASH') throw new Error('Tasdiqlash so‘zi noto‘g‘ri')

  const data = await readBackup(name)
  const decode = await decoder()
  const db = await adminDb()
  const paths = Object.keys(data.docs).filter((path) => wanted.includes(path.split('/')[0]))

  // Tiklashdan oldin hozirgi holatning ham nusxasi — xato tanlansa qaytarish uchun
  const safety = await backupRun(`${actor.name || actor.email} (tiklashdan oldin)`, 'manual')

  let written = 0
  for (let i = 0; i < paths.length; i += 400) {
    const batch = db.batch()
    for (const path of paths.slice(i, i + 400)) {
      batch.set(db.doc(path), decode(data.docs[path]) as Record<string, unknown>)
    }
    await batch.commit()
    written += Math.min(400, paths.length - i)
  }
  return { ok: true, written, collections: wanted, safetyBackup: safety.name }
}

/** Jadvaldan: vaqti kelgan bo'lsa avtomatik nusxa. */
export async function maybeAutoBackup() {
  const settings = await readSettings()
  if (!settings.auto) return { skipped: 'off' }
  const last = settings.lastAt ? Date.parse(settings.lastAt) : 0
  if (last && Date.now() - last < settings.intervalDays * 24 * 60 * 60 * 1000) return { skipped: 'fresh' }
  const result = await backupRun('Avtomatik', 'auto')
  return { name: result.name, docs: result.docs }
}
