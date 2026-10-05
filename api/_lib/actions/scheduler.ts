import { adminDb } from '../firebase-admin.js'
import type { Staff } from '../admin-auth.js'
import { broadcast, readButtons, readMedia } from './people.js'
import { broadcastStart } from './broadcasts.js'
import { postToChannel } from './channel.js'
import { maybeAutoBackup } from './backup.js'
import { announceDailyPicks } from './daily.js'

/**
 * Jadval: rejalashtirilgan e'lonlar, aksiya boshlanganda avtomatik e'lon
 * va haftalik zaxira nusxa.
 *
 * Har daqiqada bot (Railway'da doim yoqiq) `/api/linko-cron?tasks=1` ni
 * chaqiradi — `runTasks` shu yerda. Vercel funksiyasi uzoq ishlay
 * olmaydi, shuning uchun mijozlarga yuborish bo'laklab boradi: vaqt
 * tugasa joyi (`progress.cursor`) saqlanadi va `more: true` qaytadi —
 * bot darhol yana chaqiradi.
 *
 * Bir vazifani ikki chaqiruv bir vaqtda olmasligi uchun `lockedUntil`.
 */

const COLL = 'scheduled_posts'
const CHUNK = 25
const LOCK_MS = 55_000
const MAX_RECIPIENTS = 20_000

type Post = {
  text: string
  textRu: string
  bilingual: boolean
  media: { type: 'image' | 'video'; url: string } | null
  buttons: unknown[]
  silent: boolean
  pin: boolean
  protect: boolean
  preview: boolean
}
type Job = {
  runAt: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled'
  channel: boolean
  customers: boolean
  post: Post
  recipients: string[] | 'all'
  audience: string
  total: number
  by: string
  lockedUntil?: string | null
  progress?: {
    cursor?: number | string | null
    mediaId?: string | null
    campaignId?: string | null
    channelDone?: boolean
    channelPostId?: string | null
    channelLink?: string | null
    channelError?: string | null
    sent?: number
    failed?: number
  }
}

const str = (value: unknown, max = 4000) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

/** Panel yuborgan e'lonni tekshiradi (yuborish paytida xato chiqmasin). */
function readPost(raw: unknown): Post {
  const p = (raw ?? {}) as Record<string, unknown>
  const media = readMedia(p.media)
  readButtons(p.buttons)
  const post: Post = {
    text: str(p.text),
    textRu: str(p.textRu),
    bilingual: p.bilingual === true,
    media: media ? { type: media.kind === 'photo' ? 'image' : 'video', url: media.url } : null,
    buttons: Array.isArray(p.buttons) ? p.buttons : [],
    silent: p.silent === true,
    pin: p.pin === true,
    protect: p.protect === true,
    preview: p.preview === true,
  }
  if (!post.text && !post.textRu && !post.media) throw new Error('E’lon matni bo‘sh')
  return post
}

// ─── Panel amallari ───────────────────────────────────────────

export async function scheduleCreate(actor: Staff, body: Record<string, unknown>) {
  const runAt = Date.parse(str(body.runAt, 40))
  if (!Number.isFinite(runAt)) throw new Error('Yuborish vaqtini tanlang')
  if (runAt < Date.now() + 60_000) throw new Error('Vaqt kamida 1 daqiqa keyin bo‘lsin')
  if (runAt > Date.now() + 60 * 24 * 60 * 60 * 1000) throw new Error('Ko‘pi bilan 60 kun oldinga rejalashtirish mumkin')

  const channel = body.channel === true
  const customers = body.customers === true
  if (!channel && !customers) throw new Error('Qayerga yuborishni tanlang')

  let recipients: string[] | 'all' = []
  if (customers) {
    if (body.recipients === 'all') recipients = 'all'
    else {
      const ids = Array.isArray(body.recipients) ? body.recipients.map((v) => String(v).trim()) : []
      recipients = [...new Set(ids.filter((v) => /^-?\d{3,20}$/.test(v)))]
      if (!recipients.length) throw new Error('Qabul qiluvchi yo‘q')
      if (recipients.length > MAX_RECIPIENTS) throw new Error(`Ko‘pi bilan ${MAX_RECIPIENTS} ta qabul qiluvchi`)
    }
  }

  const ref = await (await adminDb()).collection(COLL).add({
    runAt: new Date(runAt).toISOString(),
    status: 'pending',
    channel,
    customers,
    post: readPost(body.post),
    recipients,
    audience: str(body.audience, 80),
    total: recipients === 'all' ? Math.max(0, Math.round(Number(body.total) || 0)) : recipients.length,
    by: actor.name || actor.email,
    origin: 'panel',
    createdAt: new Date().toISOString(),
  })
  return { id: ref.id, ...(await scheduleList()) }
}

export async function scheduleList() {
  const db = await adminDb()
  const snap = await db.collection(COLL).orderBy('runAt', 'desc').limit(40).get()
  const rows = snap.docs.map((d) => {
    const data = d.data() as Job & Record<string, unknown>
    // Qabul qiluvchilar ro'yxati og'ir — panelga faqat soni
    const { recipients, ...rest } = data
    return { id: d.id, ...rest, recipientsCount: recipients === 'all' ? null : recipients?.length ?? 0 }
  })
  const open = rows.filter((r) => r.status === 'pending' || r.status === 'running')
    .sort((a, b) => String(a.runAt).localeCompare(String(b.runAt)))
  const past = rows.filter((r) => r.status !== 'pending' && r.status !== 'running').slice(0, 10)
  return { scheduled: [...open, ...past] }
}

export async function scheduleCancel(_actor: Staff, body: Record<string, unknown>) {
  const id = str(body.id, 40)
  if (!/^[\w-]{1,40}$/.test(id)) throw new Error('Topilmadi')
  const db = await adminDb()
  const ref = db.collection(COLL).doc(id)
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const status = snap.data()?.status
    if (!snap.exists) throw new Error('Topilmadi')
    if (status !== 'pending') throw new Error('Faqat hali boshlanmagan e’lonni bekor qilish mumkin')
    tx.update(ref, { status: 'cancelled', cancelledAt: new Date().toISOString() })
  })
  return scheduleList()
}

// ─── Bajarish ─────────────────────────────────────────────────

const SYSTEM = (name: string): Staff => ({ uid: 'system', email: '', name, role: 'owner', active: true })

/** Bitta vazifaning navbatdagi qadami. `true` — tugadi. */
async function step(id: string, job: Job, deadline: number): Promise<boolean> {
  const db = await adminDb()
  const ref = db.collection(COLL).doc(id)
  const progress = { ...(job.progress ?? {}) }
  const save = () => ref.update({ progress, lockedUntil: new Date(Date.now() + LOCK_MS).toISOString() })

  // 1) Kanal
  if (job.channel && !progress.channelDone) {
    try {
      const posted = await postToChannel(job.by, { ...job.post, customers: job.customers ? job.total : 0 })
      progress.channelPostId = posted.id
      progress.channelLink = posted.link
    } catch (error) {
      progress.channelError = error instanceof Error ? error.message : 'Kanalga joylanmadi'
      // Faqat kanal bo'lsa — butun vazifa xato; mijozlar ham bo'lsa, ularga davom etamiz
      if (!job.customers) throw error
    }
    progress.channelDone = true
    await save()
  }
  if (!job.customers) return true

  // 2) Mijozlar — bo'laklab
  const actor = SYSTEM(job.by)
  if (!progress.campaignId) {
    const started = await broadcastStart(actor, {
      ...job.post,
      audience: job.audience,
      total: job.total,
      channelPostId: progress.channelPostId ?? null,
      scheduled: true,
    })
    progress.campaignId = started.id
    progress.sent = 0
    progress.failed = 0
    await save()
  }

  const payload = {
    text: job.post.text,
    textRu: job.post.textRu,
    buttons: job.post.buttons,
    campaignId: progress.campaignId,
  }
  while (Date.now() < deadline) {
    const media = job.post.media ? { ...job.post.media, fileId: progress.mediaId ?? null } : null
    let result: { sent: number; failed: number; nextCursor: string | null; mediaId: string | null }
    let finished: boolean
    if (job.recipients === 'all') {
      const after = typeof progress.cursor === 'string' ? progress.cursor : ''
      result = await broadcast(actor, { ...payload, media, segment: 'all', after, limit: CHUNK })
      progress.cursor = result.nextCursor
      finished = !result.nextCursor
    } else {
      const from = typeof progress.cursor === 'number' ? progress.cursor : 0
      const chunk = job.recipients.slice(from, from + CHUNK)
      finished = from + CHUNK >= job.recipients.length
      result = await broadcast(actor, { ...payload, media, recipients: chunk, last: finished })
      progress.cursor = from + CHUNK
    }
    progress.mediaId = result.mediaId ?? progress.mediaId ?? null
    progress.sent = (progress.sent ?? 0) + result.sent
    progress.failed = (progress.failed ?? 0) + result.failed
    await save()
    if (finished) {
      await db.collection('broadcasts').doc(progress.campaignId!).set(
        { status: 'done', finishedAt: new Date().toISOString() },
        { merge: true },
      )
      return true
    }
  }
  return false
}

/** Vaqti kelgan vazifalar. `more` — vaqt tugab, yarim qolgani bor. */
export async function runDueSchedules(budgetMs = 40_000) {
  const deadline = Date.now() + budgetMs
  const db = await adminDb()
  const snap = await db.collection(COLL).where('status', 'in', ['pending', 'running']).get()
  const now = new Date().toISOString()
  const due = snap.docs
    .filter((d) => String(d.data().runAt) <= now)
    .sort((a, b) => String(a.data().runAt).localeCompare(String(b.data().runAt)))

  let done = 0
  let more = false
  for (const doc of due) {
    if (Date.now() >= deadline) { more = true; break }
    const ref = doc.ref
    // Egallash: boshqa chaqiruv ishlayotgan bo'lsa — o'tkazib yuboramiz
    const claimed = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref)
      const data = fresh.data() as Job | undefined
      if (!data || (data.status !== 'pending' && data.status !== 'running')) return null
      if (data.lockedUntil && data.lockedUntil > new Date().toISOString()) return null
      tx.update(ref, {
        status: 'running',
        startedAt: data.status === 'pending' ? new Date().toISOString() : (fresh.data()?.startedAt ?? null),
        lockedUntil: new Date(Date.now() + LOCK_MS).toISOString(),
      })
      return data
    })
    if (!claimed) continue
    try {
      const finished = await step(doc.id, claimed, deadline)
      if (finished) {
        await ref.update({ status: 'done', finishedAt: new Date().toISOString(), lockedUntil: null })
        done++
      } else {
        await ref.update({ lockedUntil: null })
        more = true
      }
    } catch (error) {
      await ref.update({
        status: 'failed',
        error: error instanceof Error ? error.message.slice(0, 300) : 'xato',
        finishedAt: new Date().toISOString(),
        lockedUntil: null,
      })
    }
  }
  return { due: due.length, done, more }
}

// ─── Aksiya boshlanganda e'lon ────────────────────────────────

/** Toshkent vaqti: «25.10 23:59». */
function tashkent(iso: string): string {
  const d = new Date(Date.parse(iso) + 5 * 60 * 60 * 1000)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(d.getUTCDate())}.${two(d.getUTCMonth() + 1)} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`
}

type Promotion = {
  title: string
  percent: number
  target: 'all' | 'category' | 'section' | 'products'
  targetIds: string[]
  startsAt: string
  endsAt: string
  active: boolean
  announce?: { channel?: boolean; customers?: boolean; image?: string | null } | null
  announcedAt?: string | null
}

/** Aksiya tugmasi qayerni ochadi: bitta nishon bo'lsa — aynan o'sha, aks holda katalog. */
function promotionTarget(p: Promotion): string {
  const one = p.targetIds.length === 1 ? p.targetIds[0] : ''
  if (p.target === 'category' && one) return `cat:${one}`
  if (p.target === 'section' && one) return `sec:${one}`
  if (p.target === 'products' && one) return `product:${one}`
  return 'catalog'
}

export function promotionPost(p: Promotion): Post {
  const until = tashkent(p.endsAt)
  const image = p.announce?.image && /^https:\/\/\S+$/i.test(p.announce.image) ? p.announce.image : null
  return {
    text: `🔥 <b>${escape(p.title)}</b>\n\n<b>−${p.percent}%</b> chegirma boshlandi!\n⏰ ${until} gacha amal qiladi.\n\nShoshiling — aksiya vaqti cheklangan! 👇`,
    textRu: `🔥 <b>${escape(p.title)}</b>\n\nСкидка <b>−${p.percent}%</b> уже действует!\n⏰ До ${until}.\n\nУспейте — время акции ограничено! 👇`,
    bilingual: false,
    media: image ? { type: 'image', url: image } : null,
    buttons: [{ kind: 'app', text: '🛒 Aksiyadagi mahsulotlar', textRu: '🛒 Товары по акции', url: '', target: promotionTarget(p), style: 'success' }],
    silent: false,
    pin: false,
    protect: false,
    preview: false,
  }
}

function escape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Boshlangan, e'lon qilinishi so'ralgan va hali e'lon qilinmagan aksiyalar → jadvalga. */
export async function announcePromotions() {
  const db = await adminDb()
  const snap = await db.collection('promotions').where('active', '==', true).get()
  const now = new Date().toISOString()
  let queued = 0
  for (const doc of snap.docs) {
    const p = doc.data() as Promotion
    const wants = Boolean(p.announce?.channel || p.announce?.customers)
    if (!wants || p.announcedAt || p.startsAt > now || p.endsAt <= now) continue
    const claimed = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref)
      if (fresh.data()?.announcedAt) return false
      tx.update(doc.ref, { announcedAt: now })
      return true
    })
    if (!claimed) continue
    await db.collection(COLL).add({
      runAt: now,
      status: 'pending',
      channel: Boolean(p.announce?.channel),
      customers: Boolean(p.announce?.customers),
      post: promotionPost(p),
      recipients: 'all',
      audience: 'Hamma (aksiya e’loni)',
      total: 0,
      by: 'Aksiya e’loni',
      origin: 'promotion',
      promotionId: doc.id,
      createdAt: now,
    })
    queued++
  }
  return { queued }
}

/** Har daqiqalik turtki — bot/bot.py → scheduler_loop. */
export async function runTasks() {
  const started = Date.now()
  const out: Record<string, unknown> = {}
  try { out.promotions = await announcePromotions() } catch (e) { out.promotions = { error: String(e) } }
  // Kunlik e'lon: vaqti kelsa rasm chiziladi (bir necha soniya) va jadvalga qo'yiladi
  try { out.daily = await announceDailyPicks() } catch (e) { out.daily = { error: String(e) } }
  const budget = Math.max(10_000, 40_000 - (Date.now() - started))
  try { out.schedules = await runDueSchedules(budget) } catch (e) { out.schedules = { error: String(e) } }
  try { out.backup = await maybeAutoBackup() } catch (e) { out.backup = { error: String(e) } }
  const schedules = out.schedules as { more?: boolean }
  return { ...out, more: Boolean(schedules?.more) }
}
