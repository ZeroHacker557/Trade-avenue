import { adminAuth, adminDb } from '../firebase-admin.js'
import { sendMedia, sendMessage, sendRows, type AnyButton, type ButtonStyle } from '../telegram.js'
import { normalizeLang, type Lang } from '../i18n.js'
import { verifyInitData } from '../telegram-auth.js'
import type { Staff, StaffRole } from '../admin-auth.js'
import { canDeliver, syncCourierFlag } from '../courier-staff.js'
import { miniAppUrl } from './orders.js'
import { isSource, trackedUrl } from '../campaigns.js'

const ROLES: StaffRole[] = ['owner', 'admin', 'courier']

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Ilova ichidagi bildirishnoma sarlavhasi. */
const BROADCAST_TITLE: Record<Lang, string> = {
  uz: 'Trade Avenue xabari',
  ru: 'Сообщение Trade Avenue',
}

/**
 * Telegram HTML'ini oddiy matnga aylantiradi.
 *
 * Xabar botga HTML bilan ketadi, ilovadagi bildirishnoma esa oddiy
 * matn ko'rsatadi — teglar ko'rinib qolmasligi kerak.
 */
export function plain(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim()
    .slice(0, 500)
}

/** Telegram izoh uzunligini teglarsiz sanaydi. */
export function plainLength(value: string): number {
  return value.replace(/<[^>]+>/g, '').replace(/&(lt|gt|amp|quot|nbsp);/g, 'x').length
}

/**
 * Xodim qo'shadi yoki yangilaydi.
 *
 * Ikki xil xodim bo'lishi mumkin:
 *
 *   • Veb xodim (ega, admin) — email va parol bilan, Firebase Auth'da
 *     hisobi bor, panelga kiradi. Rol IKKI joyga yoziladi: custom claim
 *     (Firestore Rules shuni o'qiydi) va `staff/{uid}` hujjati.
 *
 *   • Telegram kuryeri — email/parolsiz. Auth'da hisobi YO'Q, faqat
 *     `staff` hujjati sifatida yashaydi va buyurtmalarni Telegram orqali
 *     oladi. Kuryerga panel kerak emas, shuning uchun undan email so'rash
 *     ortiqcha to'siq bo'lardi.
 *
 * Kuryerga keyinchalik email qo'shilsa, unga panel ham ochiladi.
 */
export async function staffSave(actor: Staff, body: Record<string, unknown>) {
  if (actor.role !== 'owner') throw new Error('Faqat ega xodim qo‘sha oladi')

  const uid = text(body.uid)
  const email = text(body.email).toLowerCase()
  const name = text(body.name)
  const password = text(body.password)
  const role = body.role as StaffRole
  const phone = text(body.phone)
  const telegramRaw = text(body.telegramId)
  const active = body.active !== false
  // Ega/admin kuryer sifatida ham ishlashi mumkin; kuryerning o'zida bu belgi kerak emas
  const delivers = role !== 'courier' && body.canDeliver === true

  if (!ROLES.includes(role)) throw new Error('Rol noto‘g‘ri')
  if (!name) throw new Error('Ism kerak')

  const telegramId = telegramRaw ? Number(telegramRaw) : null
  if (telegramRaw && !Number.isInteger(telegramId)) {
    throw new Error('Telegram ID faqat raqamlardan iborat bo‘lsin')
  }

  const auth = await adminAuth()
  const db = await adminDb()

  const webAccess = Boolean(email)

  if (!webAccess) {
    if (role !== 'courier') throw new Error('Admin va ega uchun email majburiy')
    if (!telegramId) throw new Error('Kuryerga Telegram ID kerak — busiz buyurtma bormaydi')
  } else if (!email.includes('@')) {
    throw new Error('Email manzili noto‘g‘ri')
  }

  // Telegram ID ikki xodimda takrorlanmasin — aks holda «Oldim» tugmasi
  // qaysi kuryerniki ekani aniqlanmay qoladi.
  if (telegramId) {
    const clash = await db.collection('staff').where('telegramId', '==', telegramId).get()
    if (clash.docs.some((doc) => doc.id !== uid)) {
      throw new Error('Bu Telegram ID boshqa xodimga biriktirilgan')
    }
  }

  const existing = uid ? await db.collection('staff').doc(uid).get() : null
  const hadAuth = existing?.exists ? existing.data()?.webAccess !== false : false
  const previousTelegramId = existing?.exists ? (existing.data()?.telegramId as number | null) : null

  let targetUid = uid

  if (webAccess && targetUid && hadAuth) {
    if (targetUid === actor.uid && role !== 'owner') {
      throw new Error('O‘z rolingizni pasaytira olmaysiz')
    }
    if (targetUid === actor.uid && !active) throw new Error('O‘zingizni bloklay olmaysiz')

    await auth.updateUser(targetUid, {
      email,
      displayName: name,
      disabled: !active,
      ...(password ? { password } : {}),
    })
    await auth.setCustomUserClaims(targetUid, { role })
  } else if (webAccess) {
    // Yangi veb hisob — yoki Telegram-only kuryerga endi panel ochilmoqda
    if (password.length < 8) throw new Error('Parol kamida 8 belgidan iborat bo‘lsin')

    const created = await auth.createUser({ email, password, displayName: name })
    // Eski Telegram-only hujjat yangi identifikatorga ko'chadi
    if (targetUid && existing?.exists) await db.collection('staff').doc(targetUid).delete()
    targetUid = created.uid
    await auth.setCustomUserClaims(targetUid, { role })
  } else if (!targetUid) {
    // Telegram-only kuryer: Auth hisobisiz, o'z identifikatori bilan
    targetUid = db.collection('staff').doc().id
  }

  await db.collection('staff').doc(targetUid).set(
    {
      uid: targetUid,
      email: email || null,
      name,
      role,
      phone: phone || null,
      telegramId,
      active,
      webAccess,
      canDeliver: delivers,
      updatedAt: new Date().toISOString(),
      ...(uid ? {} : { createdAt: new Date().toISOString() }),
    },
    { merge: true },
  )

  // Mini app'dagi kuryer sahifasi — Telegram ID almashgan bo'lsa eskisidan olinadi
  if (previousTelegramId && previousTelegramId !== telegramId) {
    await syncCourierFlag(previousTelegramId, false)
  }
  await syncCourierFlag(telegramId, active && canDeliver({ role, canDeliver: delivers }))

  if (!uid && telegramId) {
    await sendMessage(
      telegramId,
      '👋 <b>Siz Trade Avenue jamoasiga qo‘shildingiz</b>\n\n' +
        `Rol: <b>${role === 'courier' ? 'Kuryer' : role === 'admin' ? 'Admin' : 'Ega'}</b>\n` +
        'Buyurtmalar shu chatga tushadi.',
    )
  }

  return { uid: targetUid, created: !uid, webAccess }
}

export async function staffDelete(actor: Staff, body: Record<string, unknown>) {
  if (actor.role !== 'owner') throw new Error('Faqat ega xodimni o‘chira oladi')

  const uid = text(body.uid)
  if (!uid) throw new Error('uid kerak')
  if (uid === actor.uid) throw new Error('O‘zingizni o‘chira olmaysiz')

  const db = await adminDb()

  // Kuryerga biriktirilgan buyurtmalar egasiz qolmasin
  const assigned = await db.collection('orders').where('courierId', '==', uid).get()
  for (const doc of assigned.docs) {
    await doc.ref.set({ courierId: null, courierName: null }, { merge: true })
  }

  const removed = await db.collection('staff').doc(uid).get()
  await db.collection('staff').doc(uid).delete()
  await syncCourierFlag(removed.data()?.telegramId as number | null, false)
  try {
    await (await adminAuth()).deleteUser(uid)
  } catch {
    // Telegram-only kuryerda Auth hisobi bo'lmaydi — bu normal holat
  }

  return { uid, unassigned: assigned.size }
}

type Segment = 'all' | 'customers' | 'active30'

/**
 * Ommaviy xabar — BO'LAKLAB yuboriladi.
 *
 * Vercel funksiyasi bir necha soniyada to'xtaydi, Telegram esa soniyasiga
 * ~30 xabarga ruxsat beradi. Shuning uchun bitta chaqiruv cheklangan
 * miqdorni yuboradi va keyingi kursorni qaytaradi; admin panel esa
 * tugagunicha takrorlaydi va jarayonni ko'rsatib turadi.
 */
/** Telegram izoh (caption) chegarasi — undan uzun matn rasmdan keyin alohida ketadi. */
export const CAPTION_MAX = 1024
const MAX_BUTTONS = 4

export type BroadcastMedia = { kind: 'photo' | 'video'; url: string; fileId: string | null }
export type BroadcastButton = {
  text: string
  textRu: string
  kind: 'url' | 'app'
  url: string
  /** Mini ilovada qayer ochilishi (faqat `app`): home, catalog, cat:<nom>, sec:<id>, product:<id>… */
  target: string
  style: ButtonStyle | null
}

const STYLES: ButtonStyle[] = ['danger', 'success', 'primary']
/** `?page=` bilan ochiladigan sahifalar — mini ilovadagi initialPage bilan bir xil. */
const APP_PAGES = ['catalog', 'favorites', 'orders', 'profile']

/**
 * Mini ilova havolasi. Parametrlarni ilovaning o'zi o'qiydi
 * (src/hooks/use-shop-store.ts → DEEP_LINK): `cat`, `sec`, `product`.
 */
export function appQuery(target: string, source?: string): string {
  // Kampaniya manbasi — ilova bosishni sanaydi va buyurtmaga bog'laydi (campaigns.ts)
  const src = source && isSource(source) ? `src=${source}` : ''
  const join = (q: string) => [q, src].filter(Boolean).join('&')
  if (!target || target === 'home') return join('')
  if (APP_PAGES.includes(target)) return join(`page=${target}`)
  const match = /^(cat|sec|product):(.{1,200})$/s.exec(target)
  if (!match || !match[2].trim()) throw new Error('Tugma qayerni ochishi noto‘g‘ri tanlangan')
  return join(`${match[1]}=${encodeURIComponent(match[2].trim())}`)
}

function appLink(base: string, target: string, source?: string): string {
  const query = appQuery(target, source)
  return query ? `${base}/?${query}` : `${base}/`
}

/**
 * Kanal uchun: `web_app` tugmasi faqat shaxsiy chatda ishlaydi, kanalda esa
 * botning asosiy Mini App'i `t.me/<bot>?startapp=<param>` havolasi bilan
 * ochiladi. Parametrda faqat `A-Z a-z 0-9 _ -` bo'la oladi (512 gacha) —
 * shuning uchun so'rov qatori base64url qilinadi, oldiga `q` qo'yiladi.
 * Ilova tomoni: src/hooks/use-shop-store.ts → launchParams.
 */
export function startAppParam(target: string, source?: string): string {
  const query = appQuery(target, source)
  if (!query) return 'home'
  const param = 'q' + Buffer.from(query, 'utf8').toString('base64url')
  if (param.length > 512) throw new Error('Tugma manzili juda uzun')
  return param
}

/** Rasm/video: faqat https havola; `fileId` — oldingi bo'lakda Telegram bergan. */
export function readMedia(value: unknown): BroadcastMedia | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const url = text(raw.url)
  if (!url) return null
  if (!/^https:\/\/\S+$/i.test(url)) throw new Error('Rasm/video havolasi noto‘g‘ri')
  if (raw.type !== 'image' && raw.type !== 'video') throw new Error('Faqat rasm yoki video')
  const fileId = text(raw.fileId)
  return {
    kind: raw.type === 'image' ? 'photo' : 'video',
    url,
    fileId: /^[\w-]{10,300}$/.test(fileId) ? fileId : null,
  }
}

/** Inline tugmalar: havola yoki mini ilovani ochish. Har biri alohida qatorda. */
export function readButtons(value: unknown): BroadcastButton[] {
  if (!Array.isArray(value)) return []
  if (value.length > MAX_BUTTONS) throw new Error(`Ko‘pi bilan ${MAX_BUTTONS} ta tugma`)
  return value.map((item, index) => {
    const raw = (item ?? {}) as Record<string, unknown>
    const label = text(raw.text)
    const labelRu = text(raw.textRu)
    const kind = raw.kind === 'app' ? 'app' : 'url'
    const url = text(raw.url)
    const n = index + 1
    if (!label) throw new Error(`${n}-tugmaning matni bo‘sh`)
    if (label.length > 64 || labelRu.length > 64) throw new Error(`${n}-tugmaning matni juda uzun (64 belgigacha)`)
    if (kind === 'url' && !/^(https?:\/\/|tg:\/\/)\S+$/i.test(url)) {
      throw new Error(`${n}-tugmaning havolasi noto‘g‘ri — https:// bilan boshlansin`)
    }
    const target = kind === 'app' ? text(raw.target) || 'home' : ''
    if (kind === 'app') appQuery(target) // noto'g'ri bo'lsa shu yerda xato beradi
    const style = STYLES.includes(raw.style as ButtonStyle) ? (raw.style as ButtonStyle) : null
    return { text: label, textRu: labelRu, kind, url: kind === 'url' ? url : '', target, style }
  })
}

export async function broadcast(actor: Staff, body: Record<string, unknown>) {
  if (actor.role === 'courier') throw new Error('Kuryer ommaviy xabar yubora olmaydi')

  const media = readMedia(body.media)
  const buttons = readButtons(body.buttons)
  const app = buttons.some((b) => b.kind === 'app') ? miniAppUrl() : null
  if (buttons.some((b) => b.kind === 'app') && !app) throw new Error('Mini ilova manzili sozlanmagan (MINI_APP_URL)')

  const message = text(body.text)
  // Rasm/video bo'lsa matnsiz ham yuborsa bo'ladi
  if (!message && !media) throw new Error('Xabar matni bo‘sh')
  if (message.length > 3500) throw new Error('Xabar juda uzun (3500 belgigacha)')

  /*
   * Ruscha matn ixtiyoriy: yozilmagan bo'lsa hammaga o'zbekchasi
   * ketadi (avvalgidek). Yozilgan bo'lsa — har mijoz o'zi tanlagan
   * tilda oladi (`users/{id}.language`).
   */
  const messageRu = text(body.textRu)
  if (messageRu.length > 3500) throw new Error('Ruscha xabar juda uzun (3500 belgigacha)')
  const pick = (lang: Lang) => (lang === 'ru' && messageRu ? messageRu : message)

  // Kampaniya (broadcast.start yaratgan) — bosishlar va buyurtmalar shunga yoziladi
  const campaignId = typeof body.campaignId === 'string' && /^[A-Za-z0-9]{3,40}$/.test(body.campaignId)
    ? body.campaignId
    : ''
  const source = campaignId ? `bc_${campaignId}` : undefined

  const rowsFor = (lang: Lang): AnyButton[][] =>
    buttons.map((b, index) => {
      const label = lang === 'ru' && b.textRu ? b.textRu : b.text
      const button: AnyButton = b.kind === 'app'
        ? { text: label, web_app: { url: appLink(app!, b.target, source) } }
        : { text: label, url: source ? trackedUrl(source, index, b.url) : b.url }
      return [b.style ? { ...button, style: b.style } : button]
    })

  /** Bo'lak natijasini kampaniya yozuviga qo'shadi. */
  const record = async (sent: number, failed: number) => {
    if (!campaignId) return
    const { FieldValue } = await import('firebase-admin/firestore')
    const update: Record<string, unknown> = {
      sent: FieldValue.increment(sent),
      failed: FieldValue.increment(failed),
    }
    if (body.last === true) {
      update.status = 'done'
      update.finishedAt = new Date().toISOString()
    }
    await db.collection('broadcasts').doc(campaignId).set(update, { merge: true })
  }

  const db = await adminDb()
  /** Birinchi muvaffaqiyatli yuborishdan keyin — Telegram'dagi fayl (qayta yuklanmaydi). */
  let mediaId = media?.fileId ?? null

  /** Telegram xabari + ilova ichidagi bildirishnoma. */
  const deliver = async (userId: string, lang: Lang) => {
    const body = pick(lang)
    const rows = rowsFor(lang)
    let result
    if (media) {
      // Izoh 1024 belgidan oshsa: avval rasm, keyin matn tugmalar bilan
      const fits = plainLength(body) <= CAPTION_MAX
      const sent = await sendMedia(userId, media.kind, mediaId ?? media.url, fits ? body : '', fits || !body ? rows : [])
      if (sent.ok && sent.fileId) mediaId = sent.fileId
      result = sent.ok && !fits && body ? await sendRows(userId, body, rows) : sent
    } else {
      result = rows.length ? await sendRows(userId, body, rows) : await sendMessage(userId, body)
    }
    if (result.ok) {
      // Mijoz xabarni botda o'qimagan bo'lsa ham ilovada ko'radi
      await db.collection('notifications').add({
        userId: Number(userId),
        title: BROADCAST_TITLE[lang],
        body: plain(body) || (media?.kind === 'video' ? '🎬' : '🖼'),
        ...(media?.kind === 'photo' ? { image: media.url } : {}),
        date: new Date().toISOString(),
        read: false,
        type: 'promo',
      })
    }
    return result
  }

  /*
   * Aniq ro'yxat: admin panel mijozlarni o'zi tanlab (kategoriya, mahsulot,
   * faollik bo'yicha yoki qo'lda belgilab) identifikatorlarini bo'laklab
   * yuboradi. Server faqat bazada BOR foydalanuvchiga yozadi — ro'yxatga
   * begona chat qo'shib bo'lmaydi.
   */
  if (Array.isArray(body.recipients)) {
    const ids = [...new Set(body.recipients.map((v) => String(v).trim()).filter((v) => /^-?\d{3,20}$/.test(v)))]
    if (ids.length > 40) throw new Error('Bir bo‘lakda 40 tadan ko‘p qabul qiluvchi bo‘lmaydi')
    const snaps = ids.length ? await db.getAll(...ids.map((id) => db.collection('users').doc(id))) : []
    let sent = 0
    let failed = 0
    let skipped = body.recipients.length - ids.length
    for (const snap of snaps) {
      if (!snap.exists) {
        skipped++
        continue
      }
      const result = await deliver(snap.id, normalizeLang(snap.data()?.language))
      if (result.ok) sent++
      else failed++
      await new Promise((resolve) => setTimeout(resolve, 40))
    }
    await record(sent, failed)
    return { sent, failed, skipped, processed: body.recipients.length, nextCursor: null, mediaId }
  }

  const segment = (text(body.segment) || 'all') as Segment
  const after = text(body.after)
  const limit = Math.min(40, Math.max(1, Number(body.limit) || 25))

  let query = db.collection('users').orderBy('__name__').limit(limit)
  if (after) query = db.collection('users').orderBy('__name__').startAfter(after).limit(limit)

  const snap = await query.get()

  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
  let sent = 0
  let failed = 0
  let skipped = 0

  for (const doc of snap.docs) {
    const data = doc.data() as { lastActive?: string; phone?: string; language?: string }

    if (segment === 'customers' && !data.phone) {
      skipped++
      continue
    }
    if (segment === 'active30') {
      const last = Date.parse(String(data.lastActive || ''))
      if (!last || last < cutoff) {
        skipped++
        continue
      }
    }

    const result = await deliver(doc.id, normalizeLang(data.language))
    if (result.ok) sent++
    else failed++
    await new Promise((resolve) => setTimeout(resolve, 40))
  }

  const last = snap.docs[snap.docs.length - 1]
  await record(sent, failed)
  return {
    sent,
    failed,
    skipped,
    processed: snap.size,
    nextCursor: snap.size === limit && last ? last.id : null,
    mediaId,
  }
}

/**
 * Panelga kirgan xodimning Telegram hisobini o'ziga biriktiradi.
 *
 * NEGA KERAK: bot «🛠 Admin panel» tugmasini faqat ID si ma'lum
 * xodimlarga ko'rsatadi. Ilgari bu ID ni ega qo'lda yozib qo'yishi
 * kerak edi. Endi admin panelni Telegram ichida bir marta ochib
 * kirsa — ID o'zi yozilib qoladi va keyingi safar tugma darhol
 * ko'rinadi.
 *
 * Ishonch manbai — Telegram imzosi (initData HMAC). Mijoz yuborgan
 * raqamga ishonilmaydi: tokenni bilmasdan boshqa odamning ID si bilan
 * to'g'ri imzo yasab bo'lmaydi. Bitta Telegram hisobi bitta xodimga
 * biriktiriladi — aks holda botdagi buyurtma tugmalari kimniki
 * ekani chalkashib ketardi.
 */
export async function staffLinkTelegram(actor: Staff, body: Record<string, unknown>) {
  const botToken = process.env.BOT_TOKEN
  if (!botToken) throw new Error('Server sozlanmagan')

  const user = verifyInitData(text(body.initData), botToken)
  const telegramId = user.id
  const db = await adminDb()

  const clash = await db.collection('staff').where('telegramId', '==', telegramId).get()
  const other = clash.docs.find((doc) => doc.id !== actor.uid)
  if (other) {
    throw new Error('Bu Telegram hisobi boshqa xodimga biriktirilgan')
  }

  if (actor.telegramId === telegramId) return { telegramId, linked: false }

  await db.collection('staff').doc(actor.uid).set(
    {
      telegramId,
      telegramUsername: user.username ?? null,
      telegramLinkedAt: new Date().toISOString(),
    },
    { merge: true },
  )
  if (actor.telegramId) await syncCourierFlag(actor.telegramId, false)
  await syncCourierFlag(telegramId, actor.active && canDeliver(actor))

  return { telegramId, linked: true }
}
