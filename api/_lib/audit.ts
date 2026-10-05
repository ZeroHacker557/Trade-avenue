import { adminDb } from './firebase-admin.js'
import { orderLabel } from './order-number.js'

/**
 * Harakatlar jurnali — kim, qachon, nimani o'zgartirdi.
 *
 * Admin panel (`/api/admin/action`), bot tugmalari va kuryer ilovasi
 * (`/api/courier`) dagi har bir YOZUV amali `audit_log` ga tushadi:
 * muvaffaqiyatli bo'lsa ham, xato bilan tugasa ham. Faqat o'qish
 * amallari (holat, ro'yxat) yozilmaydi — jurnal shovqinga to'lmasin.
 *
 * Tahrirlashda «avval → keyin» farqi ham saqlanadi: amal bajarilishidan
 * oldin hujjat o'qiladi va tanadagi maydonlar bilan solishtiriladi
 * (masalan «Narx: 45 000 → 50 000»).
 *
 * Jurnal HECH QACHON asosiy amalni to'xtatmaydi — yozilmasa faqat log.
 */

export type AuditActor = { uid: string; name: string; role: string }
export type AuditSource = 'panel' | 'bot' | 'courier' | 'system'

/** O'qish amallari — jurnalga tushmaydi. */
const READ_ONLY = new Set([
  'overview', 'location', 'support.read', 'linko.status', 'linko.ping', 'channel.status',
  'audit.list', 'backup.list', 'template.list', 'campaign.stats', 'schedule.list', 'broadcast.history', 'daily.get', 'daily.preview',
  'settings.testGroup',
])

/** Panelda ko'rinadigan nomlar. */
export const AUDIT_LABELS: Record<string, string> = {
  'order.status': 'Buyurtma holati',
  'order.assign': 'Kuryer biriktirildi',
  'order.linkoPush': 'Buyurtma Linko’ga',
  'courier.take': 'Kuryer oldi',
  'courier.deliver': 'Kuryer yetkazdi',
  take: 'Kuryer oldi',
  deliver: 'Kuryer yetkazdi',
  arrived: 'Kuryer yetib keldi',
  shift: 'Kuryer smenasi',
  problem: 'Kuryer muammo bildirdi',
  'cash.handover': 'Kassaga topshirish',
  'support.open': 'Murojaat ochildi',
  'support.send': 'Murojaatga xabar',
  'product.save': 'Mahsulot saqlandi',
  'product.delete': 'Mahsulot o‘chirildi',
  'product.active': 'Mahsulot yoqildi / o‘chirildi',
  'product.bulkUpdate': 'Mahsulotlar ommaviy o‘zgartirildi',
  'promotion.save': 'Aksiya saqlandi',
  'promotion.delete': 'Aksiya o‘chirildi',
  'ad.save': 'Reklama banneri',
  'home.banners': 'Bosh sahifa bannerlari',
  'category.save': 'Kategoriya saqlandi',
  'category.delete': 'Kategoriya o‘chirildi',
  'promo.save': 'Promokod saqlandi',
  'promo.delete': 'Promokod o‘chirildi',
  'order.sort': 'Tartib o‘zgartirildi',
  'section.save': 'Bo‘lim saqlandi',
  'section.delete': 'Bo‘lim o‘chirildi',
  'catalog.layout': 'Katalog tartibi',
  'staff.save': 'Xodim saqlandi',
  'staff.linkTelegram': 'Xodim Telegram’ni bog‘ladi',
  'staff.delete': 'Xodim o‘chirildi',
  'broadcast.send': 'Ommaviy xabar yuborildi',
  'broadcast.start': 'Ommaviy xabar boshlandi',
  'channel.connect': 'Kanal ulandi',
  'channel.disconnect': 'Kanal uzildi',
  'channel.post': 'Kanalga e’lon',
  'channel.poll': 'Kanalga so‘rovnoma',
  'channel.pollStop': 'So‘rovnoma yakunlandi',
  'channel.edit': 'Kanal e’loni tahrirlandi',
  'channel.delete': 'Kanal e’loni o‘chirildi',
  'template.save': 'Shablon saqlandi',
  'template.delete': 'Shablon o‘chirildi',
  'schedule.create': 'E’lon rejalashtirildi',
  'schedule.cancel': 'Rejalashtirilgan e’lon bekor qilindi',
  'daily.save': 'Kunlik e’lon sozlandi',
  'daily.test': 'Kunlik e’lon sinab yuborildi',
  'daily.send': 'Kunlik e’lon hozir yuborildi',
  'support.reply': 'Murojaatga javob',
  'support.close': 'Murojaat yopildi',
  'cash.confirm': 'Kassa tasdiqlandi',
  'cash.reject': 'Kassa rad etildi',
  'settings.save': 'Sozlamalar saqlandi',
  'linko.pull': 'Linko sinxron',
  'linko.link': 'Linko bog‘lash',
  'linko.autoLink': 'Linko avtomatik bog‘lash',
  'linko.import': 'Linko’dan katalog yaratildi',
  'linko.pushOrders': 'Buyurtmalar Linko’ga',
  'linko.settings': 'Linko sozlamasi',
  'backup.run': 'Zaxira nusxa olindi',
  'backup.restore': 'Zaxira nusxadan tiklandi',
  'backup.delete': 'Zaxira nusxa o‘chirildi',
  'session.login': 'Panelga kirdi',
  'shops.sync': 'Do‘konlar Linko’dan',
  'shops.save': 'Do‘kon saqlandi',
  'shops.code': 'Do‘kon kodi',
  'shops.codesAll': 'Do‘konlarga kod berildi',
  'shops.unbind': 'Akkaunt do‘kondan uzildi',
  'shops.active': 'Do‘kon bloki',
  'shops.delete': 'Do‘kon o‘chirildi',
  'shops.credit': 'Nasiya chegarasi',
  'ledger.payment': 'Qarz to‘lovi qabul qilindi',
  'ledger.adjust': 'Hisob tuzatildi',
}

/** Panel filtri: guruh → amal nomlari yoki prefikslari. */
export const AUDIT_GROUPS: Record<string, string[]> = {
  orders: ['order.status', 'order.assign', 'order.linkoPush', 'courier.', 'take', 'deliver', 'arrived', 'problem', 'shift', 'cash.'],
  catalog: ['product.', 'category.', 'section.', 'promotion.', 'promo.', 'ad.', 'home.', 'catalog.', 'order.sort'],
  messages: ['broadcast.', 'channel.', 'template.', 'schedule.', 'support.', 'daily.'],
  staff: ['staff.', 'session.', 'shops.', 'ledger.'],
  system: ['settings.', 'linko.', 'backup.'],
}

/** Oldingi holatni o'qish uchun: amal → (kolleksiya, id maydoni). */
const BEFORE: Record<string, { coll: string; key: string }> = {
  'product.save': { coll: 'products', key: 'id' },
  'product.active': { coll: 'products', key: 'id' },
  'category.save': { coll: 'categories', key: 'id' },
  'promotion.save': { coll: 'promotions', key: 'id' },
  'promo.save': { coll: 'promocodes', key: 'id' },
  'section.save': { coll: 'sections', key: 'id' },
  'staff.save': { coll: 'staff', key: 'uid' },
  'order.status': { coll: 'orders', key: 'orderId' },
  'order.assign': { coll: 'orders', key: 'orderId' },
}

/** Farqda ko'rsatilmaydigan (texnik yoki og'ir) maydonlar. */
const DIFF_SKIP = new Set(['updatedAt', 'createdAt', 'images', 'thumbs', 'optimized', 'bundle', 'action'])
/** Hech qachon jurnalga tushmaydi. */
const SECRET = /pass|token|secret|otp|card|initdata|private|apikey|api_key/i

function short(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null
  if (typeof value === 'string') return value.length > 160 ? value.slice(0, 157) + '…' : value
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    if (depth > 0 || value.length > 8) return `[${value.length} ta]`
    return value.map((v) => short(v, depth + 1))
  }
  if (typeof value === 'object') {
    if (depth > 1) return '{…}'
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 20)) {
      out[k] = SECRET.test(k) ? '•••' : short(v, depth + 1)
    }
    return out
  }
  return String(value)
}

/** Tana → jurnal uchun qisqa ko'rinish (maxfiy maydonlarsiz). */
function summarize(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    if (k === 'action') continue
    out[k] = SECRET.test(k) ? '•••' : short(v)
  }
  return out
}

/** Nima haqida: id va nom (jurnal qatorida ko'rinadi). */
function targetOf(body: Record<string, unknown>, before: Record<string, unknown> | null) {
  const id = [body.id, body.orderId, body.uid, body.docId, body.productId].find((v) => v !== undefined && v !== '')
  const orderName = typeof before?.orderNumber === 'string' && before.orderNumber
    ? orderLabel(before as { orderNumber: string; orderDay?: string; createdAt?: string }, '')
    : null
  const name = [body.name, body.title, before?.name, before?.title, orderName, body.code]
    .find((v) => typeof v === 'string' && v.trim())
  return { id: id === undefined ? null : String(id).slice(0, 80), name: name ? String(name).slice(0, 120) : null }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

function diff(before: Record<string, unknown>, body: Record<string, unknown>) {
  const changes: { field: string; from: unknown; to: unknown }[] = []
  for (const [field, to] of Object.entries(body)) {
    if (DIFF_SKIP.has(field) || SECRET.test(field) || !(field in before)) continue
    if (!same(before[field], to)) changes.push({ field, from: short(before[field], 1), to: short(to, 1) })
  }
  return changes.slice(0, 20)
}

/** Amal bajarilishidan OLDIN — keyin farq chiqarish uchun hujjatni o'qib qo'yadi. */
export async function auditBefore(action: string, body: Record<string, unknown>) {
  const spec = BEFORE[action]
  const id = spec ? String(body[spec.key] ?? '').trim() : ''
  if (!spec || !id || id.includes('/')) return null
  try {
    const snap = await (await adminDb()).collection(spec.coll).doc(id).get()
    return snap.exists ? (snap.data() as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function isAudited(action: string): boolean {
  return Boolean(action) && !READ_ONLY.has(action)
}

export async function audit(entry: {
  actor: AuditActor
  source: AuditSource
  action: string
  body: Record<string, unknown>
  before?: Record<string, unknown> | null
  ok: boolean
  error?: string
}) {
  if (!isAudited(entry.action)) return
  try {
    const before = entry.before ?? null
    await (await adminDb()).collection('audit_log').add({
      at: new Date().toISOString(),
      actor: { uid: entry.actor.uid, name: entry.actor.name || '—', role: entry.actor.role },
      source: entry.source,
      action: entry.action,
      label: AUDIT_LABELS[entry.action] ?? entry.action,
      target: targetOf(entry.body, before),
      changes: before ? diff(before, entry.body) : [],
      details: summarize(entry.body),
      ok: entry.ok,
      error: entry.error ? entry.error.slice(0, 300) : null,
    })
  } catch (error) {
    console.error('[audit] yozilmadi:', error)
  }
}

/**
 * Jurnalni o'qish (faqat ega): sana oralig'i, xodim, amal turi bo'yicha.
 * Sahifalab — `before` (oxirgi qatorning vaqti) bilan davom etadi.
 */
export async function auditList(body: Record<string, unknown>) {
  const db = await adminDb()
  const limit = Math.min(200, Math.max(10, Number(body.limit) || 50))
  const before = typeof body.before === 'string' ? body.before : ''
  const from = typeof body.from === 'string' ? body.from : ''
  const actorUid = typeof body.actor === 'string' ? body.actor : ''
  const group = typeof body.group === 'string' ? body.group : ''
  const onlyErrors = body.errors === true

  /*
   * Xodim, amal turi va xatolar bo'yicha filtr xotirada: Firestore'da har
   * birlashma uchun alohida murakkab indeks yaratmaslik uchun. Kerakli
   * miqdor yig'ilguncha bir necha bo'lak o'qiladi.
   */
  const prefixes = AUDIT_GROUPS[group] ?? (group ? [group] : [])
  const matches = (d: Record<string, unknown>) =>
    (!actorUid || (d.actor as AuditActor)?.uid === actorUid) &&
    (!prefixes.length || prefixes.some((p) => String(d.action) === p || String(d.action).startsWith(p))) &&
    (!onlyErrors || d.ok === false)

  const rows: Record<string, unknown>[] = []
  let cursor = before
  let scanned = 0
  let exhausted = false
  while (rows.length < limit && scanned < 2000) {
    let page = db.collection('audit_log').orderBy('at', 'desc')
    if (cursor) page = page.where('at', '<', cursor)
    if (from) page = page.where('at', '>=', from)
    const snap = await page.limit(200).get()
    if (snap.empty) { exhausted = true; break }
    for (const doc of snap.docs) {
      const data = doc.data()
      if (matches(data)) rows.push({ id: doc.id, ...data })
      if (rows.length >= limit) break
    }
    scanned += snap.size
    cursor = String(snap.docs[snap.docs.length - 1].data().at)
    if (snap.size < 200) { exhausted = true; break }
  }
  const last = rows[rows.length - 1]
  // Yana bor: limit to'ldi yoki skanerlash chegarasida to'xtadik
  const more = rows.length >= limit || (!exhausted && scanned >= 2000)
  return { rows, next: more ? (last ? String(last.at) : cursor) : null }
}
