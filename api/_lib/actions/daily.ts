import { randomUUID } from 'node:crypto'
import { adminBucket, adminDb } from '../firebase-admin.js'
import type { Staff } from '../admin-auth.js'
import { bestPromotion, promoPrice, readPromotion } from '../promotions.js'
import { tashkentDay } from '../order-number.js'
import { escapeHtml } from '../telegram.js'
import { broadcast } from './people.js'
import { imageData, renderCard, som, type CardProduct } from '../daily/card.js'

/**
 * Kunlik e’lon: har kuni belgilangan soatda 1–6 ta (odatda 4) mahsulot
 * bir xil shablondagi rasmda (narxlari bilan) bot foydalanuvchilariga
 * va/yoki Telegram kanalga yuboriladi.
 *
 * Sozlama: `settings/dailyPicks` (admin → «Kunlik e’lon»).
 * Jadval: har daqiqada scheduler.ts → `announceDailyPicks` vaqt kelganini
 * tekshiradi, rasmni chizadi va `scheduled_posts` ga vazifa qo‘yadi —
 * yuborishning o‘zi (bo‘laklab, kanal + mijozlar) mavjud e’lon jadvalida.
 */

const DOC = ['settings', 'dailyPicks'] as const
const COLL = 'scheduled_posts'
/** Bot o‘chiq bo‘lib, vaqt shuncha daqiqadan ko‘p o‘tib ketgan bo‘lsa — bugun yuborilmaydi. */
const LATE_LIMIT_MIN = 180
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr']

export type DailySettings = {
  enabled: boolean
  /** Toshkent vaqti, «HH:MM». */
  time: string
  customers: boolean
  channel: boolean
  title: string
  accent: string
  text: string
  textRu: string
  button: string
  buttonRu: string
  /** Rasmda nechta mahsulot: 1–6 (standart 4). */
  count: number
  /**
   * Admin tanlagan mahsulotlar (`count` tagacha) — keyingi BITTA yuborishda
   * ishlatiladi, keyin tozalanadi va yana tasodifiy tanlanadi.
   * Kam tanlansa qolgani tasodifiy to'ldiriladi.
   */
  chosen: string[]
}

export const MAX_PICKS = 6
const readCount = (value: unknown) => {
  const n = Math.floor(Number(value))
  return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_PICKS) : 4
}

type DailyState = {
  lastDay: string | null
  lastProducts: string[]
  lastJobId: string | null
  lastImage: string | null
  lastRunAt: string | null
  lastError: string | null
}

export const DAILY_DEFAULTS: DailySettings = {
  enabled: false,
  time: '10:00',
  customers: true,
  channel: false,
  title: 'Bugun buyurtma bering —',
  accent: 'Muzdek holda yetkazamiz',
  text: '❄️ <b>Bugungi tanlov</b>\n\nBugun buyurtma bering — muzdek holda eshigingizgacha yetkazamiz! 👇',
  textRu: '❄️ <b>Выбор дня</b>\n\nЗакажите сегодня — доставим замороженным прямо к двери! 👇',
  button: '🛒 Katalogni ochish',
  buttonRu: '🛒 Открыть каталог',
  count: 4,
  chosen: [],
}

const str = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

export function readDaily(raw: unknown): DailySettings & DailyState {
  const d = (raw ?? {}) as Record<string, unknown>
  const time = str(d.time, 5)
  return {
    enabled: d.enabled === true,
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : DAILY_DEFAULTS.time,
    customers: d.customers === undefined ? DAILY_DEFAULTS.customers : d.customers === true,
    channel: d.channel === true,
    title: str(d.title, 40) || DAILY_DEFAULTS.title,
    accent: str(d.accent, 40) || DAILY_DEFAULTS.accent,
    text: str(d.text, 700) || DAILY_DEFAULTS.text,
    textRu: str(d.textRu, 700),
    button: str(d.button, 40) || DAILY_DEFAULTS.button,
    buttonRu: str(d.buttonRu, 40),
    count: readCount(d.count),
    chosen: Array.isArray(d.chosen)
      ? [...new Set(d.chosen.map((v) => String(v).trim()).filter((v) => /^[\w-]{1,60}$/.test(v)))].slice(0, readCount(d.count))
      : [],
    lastDay: typeof d.lastDay === 'string' ? d.lastDay : null,
    lastProducts: Array.isArray(d.lastProducts) ? d.lastProducts.map(String) : [],
    lastJobId: typeof d.lastJobId === 'string' ? d.lastJobId : null,
    lastImage: typeof d.lastImage === 'string' ? d.lastImage : null,
    lastRunAt: typeof d.lastRunAt === 'string' ? d.lastRunAt : null,
    lastError: typeof d.lastError === 'string' ? d.lastError : null,
  }
}

/** Panel yuborgan qoralama — saqlashdan oldin va namunada tekshiriladi. */
function readDraft(body: Record<string, unknown>, base: DailySettings): DailySettings {
  const draft = readDaily({ ...base, ...((body.settings ?? {}) as Record<string, unknown>) })
  const time = str((body.settings as Record<string, unknown> | undefined)?.time, 5)
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Vaqt noto‘g‘ri (masalan 10:00)')
  if (draft.enabled && !draft.customers && !draft.channel) throw new Error('Qayerga yuborishni tanlang: bot yoki kanal')
  return {
    enabled: draft.enabled, time: draft.time, customers: draft.customers, channel: draft.channel,
    title: draft.title, accent: draft.accent, text: draft.text, textRu: draft.textRu,
    button: draft.button, buttonRu: draft.buttonRu, count: draft.count, chosen: draft.chosen,
  }
}

async function readSettings() {
  const db = await adminDb()
  const snap = await db.collection(DOC[0]).doc(DOC[1]).get()
  return readDaily(snap.data())
}

// ─── Mahsulot tanlash va rasm ─────────────────────────────────

/** O'ramdagi dona soni (setda — 1). */
function packOf(p: Record<string, unknown>): number {
  if (Array.isArray(p.bundle) && p.bundle.length) return 1
  const n = Math.floor(Number(p.pack))
  return Number.isFinite(n) && n > 1 ? Math.min(n, 1000) : 1
}

type Picked = CardProduct & { id: string; nameRu: string }

function shuffle<T>(list: T[]): T[] {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * `count` ta mahsulot (tanlanganlari birinchi, qolgani tasodifiy): narxi bor, omborda bor, asosiy rasmi bor.
 * Kechagilar takrorlanmaydi (yetarli tanlov bo‘lsa). Rasm PNG/JPEG
 * bo‘lishi kerak — WebP ni rasm chizgich o‘qiy olmaydi, bunday mahsulot
 * o‘tkazib yuboriladi.
 */
async function pickProducts(exclude: string[], chosen: string[] = [], count = 4): Promise<Picked[]> {
  const db = await adminDb()
  const [productSnap, promoSnap] = await Promise.all([
    db.collection('products').get(),
    db.collection('promotions').where('active', '==', true).get(),
  ])
  const promotions = promoSnap.docs.map((d) => readPromotion(d.id, d.data()))
  const now = Date.now()

  const eligible = productSnap.docs.filter((d) => {
    const p = d.data()
    const image = Array.isArray(p.images) ? String(p.images[0] || '') : ''
    return p.active !== false && Number(p.price) > 0 && (typeof p.stock !== 'number' || p.stock >= packOf(p)) && /^https:\/\//.test(image) && String(p.name || '').trim()
  })
  const toPicked = async (doc: (typeof eligible)[number]): Promise<Picked | null> => {
    const p = doc.data()
    const image = await imageData(String(p.images[0]))
    if (!image || image.startsWith('data:image/webp')) return null
    // O'ram: narx bazada DONADA — mijoz qutini ko'radi (api/orders.ts bilan bir xil)
    const pack = packOf(p)
    const base = Number(p.price) * pack
    const promo = bestPromotion(promotions, { id: doc.id, category: String(p.category || ''), sectionId: p.sectionId ? String(p.sectionId) : null }, now)
    const price = promo ? promoPrice(base, promo.percent) : base
    const old = promo ? base : Number(p.oldPrice) * pack > base ? Number(p.oldPrice) * pack : null
    const suffix = (ru: boolean) => (pack > 1 ? ` (${pack} ${ru ? 'шт' : 'dona'})` : '')
    return {
      id: doc.id,
      name: String(p.name).trim() + suffix(false),
      nameRu: p.nameRu ? String(p.nameRu).trim() + suffix(true) : '',
      price,
      oldPrice: old,
      image,
    }
  }

  // 1) Admin tanlaganlari — tartibi bilan; yaroqsizi aniq xato bilan
  const picked: Picked[] = []
  for (const id of chosen.slice(0, count)) {
    const doc = productSnap.docs.find((d) => d.id === id)
    const name = String(doc?.data().name || id)
    if (!doc) throw new Error(`Tanlangan mahsulot topilmadi (${id})`)
    if (!eligible.includes(doc)) throw new Error(`«${name}» — narxi yo‘q, omborda tugagan yoki rasmi yo‘q`)
    const item = await toPicked(doc)
    if (!item) throw new Error(`«${name}» rasmi PNG/JPG emas — boshqa mahsulot tanlang`)
    picked.push(item)
  }

  // 2) Qolgani tasodifiy: avval kechagida bo'lmaganlar, yetmasa — kechagilar ham
  const rest = eligible.filter((d) => !chosen.includes(d.id))
  const pool = [
    ...shuffle(rest.filter((d) => !exclude.includes(d.id))),
    ...shuffle(rest.filter((d) => exclude.includes(d.id))),
  ]
  for (const doc of pool.slice(0, count * 4)) {
    if (picked.length >= count) break
    const item = await toPicked(doc)
    if (item) picked.push(item)
  }
  if (picked.length < count) throw new Error('Rasmli (PNG/JPG) va omborda bor mahsulot yetarli emas')
  return picked
}

/** «1-oktabr» — Toshkent sanasi. */
function dateLabel(day: string): string {
  return `${Number(day.slice(8, 10))}-${MONTHS[Number(day.slice(5, 7)) - 1]}`
}

async function deliveryNote(): Promise<string> {
  const db = await adminDb()
  const d = (await db.collection('settings').doc('delivery').get()).data() ?? {}
  const fee = Number(d.fee) || 0
  return fee > 0 ? `Yetkazish ${som(fee)} so‘m` : 'Yetkazish bepul'
}

function caption(intro: string, products: Picked[], ru: boolean): string {
  const lines = products.map((p) => `• ${escapeHtml(ru && p.nameRu ? p.nameRu : p.name)} — <b>${som(p.price)} ${ru ? 'сум' : 'so‘m'}</b>`)
  return `${intro}\n\n${lines.join('\n')}`
}

async function build(settings: DailySettings, exclude: string[]) {
  const [products, note] = await Promise.all([pickProducts(exclude, settings.chosen, settings.count), deliveryNote()])
  const bot = String(process.env.BOT_USERNAME || 'musauz_bot').replace(/^@/, '')
  const png = await renderCard({
    products,
    title: settings.title,
    accent: settings.accent,
    footer: `@${bot}`,
    footerNote: note,
    dateLabel: dateLabel(tashkentDay()),
  })
  return {
    png,
    products,
    text: caption(settings.text, products, false),
    textRu: settings.textRu ? caption(settings.textRu, products, true) : '',
  }
}

/** Rasm Storage ga — Telegram uni havola orqali oladi. */
async function upload(png: Buffer): Promise<string> {
  const bucket = await adminBucket()
  const path = `daily/${tashkentDay()}-${Date.now()}.png`
  const token = randomUUID()
  await bucket.file(path).save(png, {
    resumable: false,
    contentType: 'image/png',
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  })
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`
}

function post(settings: DailySettings, built: { text: string; textRu: string }, imageUrl: string) {
  return {
    text: built.text,
    textRu: built.textRu,
    bilingual: false,
    media: { type: 'image' as const, url: imageUrl },
    buttons: [{ kind: 'app', text: settings.button, textRu: settings.buttonRu, url: '', target: 'catalog', style: 'success' }],
    silent: false,
    pin: false,
    protect: false,
    preview: false,
  }
}

/** Jadvalga vazifa — yuborishni scheduler.ts o‘zi bo‘laklab bajaradi. */
async function enqueue(settings: DailySettings, built: Awaited<ReturnType<typeof build>>, by: string) {
  const db = await adminDb()
  const imageUrl = await upload(built.png)
  const now = new Date().toISOString()
  const job = await db.collection(COLL).add({
    runAt: now,
    status: 'pending',
    channel: settings.channel,
    customers: settings.customers,
    post: post(settings, built, imageUrl),
    recipients: 'all',
    audience: 'Hamma (kunlik e’lon)',
    total: 0,
    by,
    origin: 'daily',
    createdAt: now,
  })
  await db.collection(DOC[0]).doc(DOC[1]).set({
    lastProducts: built.products.map((p) => p.id),
    lastJobId: job.id,
    lastImage: imageUrl,
    lastRunAt: now,
    lastError: null,
    // Tanlov bir martalik — keyingi kun yana tasodifiy
    chosen: [],
  }, { merge: true })
  return job.id
}

// ─── Jadval (har daqiqada) ────────────────────────────────────

/** Toshkent vaqti «HH:MM». */
function tashkentClock(now = Date.now()): string {
  return new Date(now + 5 * 60 * 60 * 1000).toISOString().slice(11, 16)
}
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

export async function announceDailyPicks(now = Date.now()) {
  const settings = await readSettings()
  if (!settings.enabled || (!settings.customers && !settings.channel)) return { skipped: 'off' }
  const day = tashkentDay(new Date(now))
  if (settings.lastDay === day) return { skipped: 'done' }
  const late = minutes(tashkentClock(now)) - minutes(settings.time)
  if (late < 0) return { skipped: 'early' }

  // Egallash: bir kunda faqat bir marta (parallel chaqiruvlar ham)
  const db = await adminDb()
  const ref = db.collection(DOC[0]).doc(DOC[1])
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (readDaily(snap.data()).lastDay === day) return false
    tx.set(ref, { lastDay: day }, { merge: true })
    return true
  })
  if (!claimed) return { skipped: 'done' }

  if (late > LATE_LIMIT_MIN) {
    await ref.set({ lastError: `Bugun yuborilmadi: vaqt ${late} daqiqa o‘tib ketgan edi (bot o‘chiq bo‘lgan)` }, { merge: true })
    return { skipped: 'late' }
  }
  try {
    const built = await build(settings, settings.lastProducts)
    const jobId = await enqueue(settings, built, 'Kunlik e’lon')
    return { queued: jobId }
  } catch (error) {
    // Kun band qolaveradi — xato har daqiqada takrorlanmasin; panelda ko‘rinadi
    await ref.set({ lastError: error instanceof Error ? error.message.slice(0, 300) : 'xato' }, { merge: true })
    return { error: String(error) }
  }
}

// ─── Panel amallari ───────────────────────────────────────────

/** Sozlama va oxirgi yuborish holati. */
export async function dailyGet() {
  const settings = await readSettings()
  let job: Record<string, unknown> | null = null
  if (settings.lastJobId) {
    const snap = await (await adminDb()).collection(COLL).doc(settings.lastJobId).get()
    const d = snap.data()
    if (d) {
      job = {
        status: d.status,
        runAt: d.runAt,
        sent: d.progress?.sent ?? 0,
        failed: d.progress?.failed ?? 0,
        channelLink: d.progress?.channelLink ?? null,
        channelError: d.progress?.channelError ?? null,
        error: d.error ?? null,
      }
    }
  }
  return { settings, job, today: tashkentDay(), now: tashkentClock() }
}

export async function dailySave(actor: Staff, body: Record<string, unknown>) {
  const draft = readDraft(body, await readSettings())
  await (await adminDb()).collection(DOC[0]).doc(DOC[1]).set(
    { ...draft, updatedAt: new Date().toISOString(), updatedBy: actor.name || actor.email },
    { merge: true },
  )
  return dailyGet()
}

/** Namuna: rasm (data URI) va matn — hech kimga yuborilmaydi. */
export async function dailyPreview(_actor: Staff, body: Record<string, unknown>) {
  const draft = readDraft(body, await readSettings())
  const built = await build(draft, [])
  return {
    image: `data:image/png;base64,${built.png.toString('base64')}`,
    text: built.text,
    textRu: built.textRu,
    products: built.products.map((p) => ({ id: p.id, name: p.name, price: p.price })),
  }
}

/** Faqat o‘ziga sinab yuborish (xodimning Telegram ID siga). */
export async function dailyTest(actor: Staff, body: Record<string, unknown>) {
  if (!actor.telegramId) throw new Error('Profilingizga Telegram ID ulanmagan (Xodimlar bo‘limida)')
  const draft = readDraft(body, await readSettings())
  const built = await build(draft, [])
  const imageUrl = await upload(built.png)
  const p = post(draft, built, imageUrl)
  const result = await broadcast(actor, { ...p, recipients: [String(actor.telegramId)], last: true })
  if (!result.sent) throw new Error('Yuborilmadi — botni ishga tushirganmisiz?')
  return { sent: result.sent }
}

/** Hozir hammaga (bugungi avtomatik yuborish o‘rniga). */
export async function dailySendNow(actor: Staff, body: Record<string, unknown>) {
  const draft = readDraft(body, await readSettings())
  if (!draft.customers && !draft.channel) throw new Error('Qayerga yuborishni tanlang: bot yoki kanal')
  const db = await adminDb()
  const day = tashkentDay()
  const current = await readSettings()
  const built = await build(draft, current.lastProducts)
  await db.collection(DOC[0]).doc(DOC[1]).set({ lastDay: day }, { merge: true })
  const jobId = await enqueue(draft, built, actor.name || actor.email)
  return { queued: jobId, ...(await dailyGet()) }
}
