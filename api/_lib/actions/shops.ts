import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '../firebase-admin.js'
import type { Staff } from '../admin-auth.js'
import { linkoList, linkoToken, readLinkoSettings, tmOf } from '../linko.js'
import { newShopCode, normalizePhone, readShop, shopOpen, syncUserClaims } from '../shops.js'

/**
 * Admin panel → «Do'konlar».
 *
 *   shops.sync     — Linko `markets/` dan do'konlarni tortadi (yangi va o'zgarganlar)
 *   shops.save     — qo'lda do'kon qo'shish / tahrirlash
 *   shops.code     — kirish kodini berish yoki yangilash
 *   shops.codesAll — kodi yo'q hamma faol do'konga kod berish
 *   shops.unbind   — Telegram akkauntni (yoki hammasini) do'kondan uzish
 *   shops.active   — bloklash / blokdan chiqarish
 *   shops.delete   — qo'lda qo'shilgan do'konni o'chirish
 */

type Body = Record<string, unknown>

const BATCH_LIMIT = 400

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** Linko obyekt-havolasi: `{ id, name }` yoki to'g'ridan-to'g'ri son. */
function refId(value: unknown): number {
  if (value && typeof value === 'object') return num((value as { id?: unknown }).id)
  return num(value)
}

function refName(value: unknown): string {
  if (value && typeof value === 'object') return str((value as { name?: unknown }).name)
  return ''
}

/**
 * Linko'dagi savdo nuqtasi. Hujjatda aniq sxema berilmagan — maydonlar
 * ehtiyotkorlik bilan o'qiladi, yo'q bo'lsa bo'sh qoladi.
 */
type LinkoMarket = {
  id: number
  name?: string
  service_id?: string | null
  is_active?: boolean
  is_confirmed?: boolean
  address?: string | null
  location?: { lat?: number; lon?: number; lng?: number } | null
  market_phones?: { phone?: string }[] | null
  phone?: string | null
  responsible_agent?: { id?: number; name?: string } | number | null
  price_list?: { id?: number; name?: string } | number | null
  market_type?: { id?: number; name?: string } | number | null
  tm?: string | number
}

type LinkoUser = { id: number; first_name?: string; second_name?: string }

/** Bot orqali yaratilgan B2C mijozlar (eski MUSA va bizning `ta-`) — do'kon emas. */
function isConsumer(market: LinkoMarket): boolean {
  const service = str(market.service_id)
  return service.startsWith('musa-') || service.startsWith('ta-')
}

function marketPhones(market: LinkoMarket): string[] {
  const raw = [
    ...(Array.isArray(market.market_phones) ? market.market_phones.map((p) => p?.phone) : []),
    market.phone,
  ]
  return [...new Set(raw.map(normalizePhone).filter(Boolean))]
}

function marketLocation(market: LinkoMarket): { lat: number; lng: number } | null {
  const loc = market.location
  if (!loc) return null
  const lat = num(loc.lat)
  const lng = num(loc.lon ?? loc.lng)
  if (!lat || !lng || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

async function commit(writes: { ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }[]) {
  const db = await adminDb()
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = db.batch()
    for (const w of writes.slice(i, i + BATCH_LIMIT)) batch.set(w.ref, w.data, { merge: true })
    await batch.commit()
  }
}

/**
 * Linko'dan do'konlarni tortadi.
 *
 * Odatda orttirma (`last_tm` dan keyin o'zgarganlar), `full: true` bilan
 * hammasi. Agent va narxlar ro'yxati nomlari ham shu yerda yoziladi —
 * panelda raqam emas, ism ko'rinsin.
 *
 * Linko'dan kelmaydigan maydonlarga (kod, ulangan akkauntlar, qo'lda
 * qo'shilgan raqamlar, admin bloki) TEGILMAYDI.
 */
export async function shopsSync(_staff: Staff | null, body: Body = {}) {
  const settings = await readLinkoSettings()
  if (!settings.baseUrl || !linkoToken()) throw new Error('Linko ulanmagan (Linko integratsiya bo‘limida sozlang)')

  const db = await adminDb()
  const cursorRef = db.collection('settings').doc('shops')
  const cursor = num((await cursorRef.get()).data()?.lastMarketTm)
  const full = body.full === true || !cursor

  const [markets, users, priceLists] = await Promise.all([
    linkoList<LinkoMarket>('markets/', full ? {} : { last_tm: cursor }, settings),
    linkoList<LinkoUser>('users/', {}, settings),
    linkoList<{ id: number; name?: string }>('price_lists/', {}, settings),
  ])

  const userName = new Map(users.map((u) => [u.id, [u.first_name, u.second_name].filter(Boolean).join(' ').trim()]))
  const listName = new Map(priceLists.map((p) => [p.id, str(p.name)]))

  const now = new Date().toISOString()
  const shops = markets.filter((m) => m?.id && !isConsumer(m))
  const existing = new Set<string>()
  for (let i = 0; i < shops.length; i += 300) {
    const refs = shops.slice(i, i + 300).map((m) => db.collection('shops').doc(String(m.id)))
    const snaps = await db.getAll(...refs)
    snaps.forEach((snap) => snap.exists && existing.add(snap.id))
  }

  const writes = shops.map((market) => {
    const id = String(market.id)
    const agentId = refId(market.responsible_agent)
    const priceListId = refId(market.price_list)
    return {
      ref: db.collection('shops').doc(id),
      data: {
        linkoId: market.id,
        name: str(market.name) || `Do‘kon ${id}`,
        phones: marketPhones(market),
        address: str(market.address),
        location: marketLocation(market),
        agentId,
        agentName: refName(market.responsible_agent) || userName.get(agentId) || '',
        priceListId,
        priceListName: refName(market.price_list) || listName.get(priceListId) || '',
        marketTypeName: refName(market.market_type),
        // Linko'da o'chirilgan — kirish yopiladi (admin bloki alohida: `active`)
        linkoActive: market.is_active !== false,
        source: 'linko',
        syncedAt: now,
        updatedAt: now,
        ...(existing.has(id)
          ? {}
          : { createdAt: now, memberIds: [], extraPhones: [], hasCode: false, active: true }),
      },
    }
  })
  await commit(writes)

  const maxTm = markets.reduce((max, m) => Math.max(max, tmOf(m?.tm)), full ? 0 : cursor)
  const created = writes.length - existing.size
  const report = `${markets.length} ta savdo nuqtasi o‘qildi, ${writes.length} ta do‘kon yangilandi (${created} ta yangi)`
  await cursorRef.set({ lastMarketTm: maxTm, lastSyncAt: now, lastReport: report }, { merge: true })
  return { read: markets.length, saved: writes.length, created, skipped: markets.length - shops.length, report }
}

/** Qo'lda qo'shish / tahrirlash. Linko do'konida faqat qo'shimcha raqamlar va izoh. */
export async function shopSave(_staff: Staff, body: Body) {
  const db = await adminDb()
  const id = str(body.id)
  const now = new Date().toISOString()
  const extraPhones = (Array.isArray(body.extraPhones) ? body.extraPhones : [])
    .map(normalizePhone).filter(Boolean)
  const note = str(body.note).slice(0, 500)

  if (id) {
    const ref = db.collection('shops').doc(id)
    const snap = await ref.get()
    if (!snap.exists) throw new Error('Do‘kon topilmadi')
    const shop = readShop(id, snap.data())
    const update: Record<string, unknown> = { extraPhones: [...new Set(extraPhones)], note, updatedAt: now }
    if (shop.source === 'manual') {
      const name = str(body.name).slice(0, 120)
      if (!name) throw new Error('Do‘kon nomini kiriting')
      Object.assign(update, {
        name,
        address: str(body.address).slice(0, 300),
        agentName: str(body.agentName).slice(0, 80),
      })
    }
    await ref.set(update, { merge: true })
    return { id }
  }

  const name = str(body.name).slice(0, 120)
  if (!name) throw new Error('Do‘kon nomini kiriting')
  if (!extraPhones.length) throw new Error('Kamida bitta telefon raqamini kiriting')
  const ref = db.collection('shops').doc(`m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`)
  await ref.set({
    linkoId: 0,
    name,
    phones: [],
    extraPhones: [...new Set(extraPhones)],
    address: str(body.address).slice(0, 300),
    location: null,
    agentId: 0,
    agentName: str(body.agentName).slice(0, 80),
    priceListId: 0,
    priceListName: '',
    marketTypeName: '',
    note,
    active: true,
    linkoActive: true,
    memberIds: [],
    hasCode: false,
    source: 'manual',
    createdAt: now,
    updatedAt: now,
    syncedAt: null,
  })
  return { id: ref.id }
}

/** Boshqa do'konda yo'q kod. Ehtimol juda kichik, lekin baribir tekshiriladi. */
async function uniqueCode(): Promise<string> {
  const db = await adminDb()
  for (let i = 0; i < 8; i++) {
    const code = newShopCode()
    const taken = await db.collection('shop_codes').where('code', '==', code).limit(1).get()
    if (taken.empty) return code
  }
  throw new Error('Kod yaratib bo‘lmadi, qayta urinib ko‘ring')
}

async function issueCode(shopId: string, staff: Staff): Promise<string> {
  const db = await adminDb()
  const code = await uniqueCode()
  const now = new Date().toISOString()
  await db.collection('shop_codes').doc(shopId).set({ code, issuedAt: now, issuedBy: staff.name || staff.email })
  await db.collection('shops').doc(shopId).set({ hasCode: true, codeIssuedAt: now, updatedAt: now }, { merge: true })
  return code
}

/**
 * Kod berish. Bor bo'lsa — o'sha qaytadi; `regenerate` bilan yangisi
 * yaratiladi (eski kod endi ishlamaydi, ulangan akkauntlar esa qoladi).
 */
export async function shopCode(staff: Staff, body: Body) {
  const shopId = str(body.shopId)
  if (!shopId) throw new Error('Do‘kon tanlanmagan')
  const db = await adminDb()
  const shop = await db.collection('shops').doc(shopId).get()
  if (!shop.exists) throw new Error('Do‘kon topilmadi')

  if (body.regenerate !== true) {
    const current = await db.collection('shop_codes').doc(shopId).get()
    const code = str(current.data()?.code)
    if (code) return { code, created: false }
  }
  return { code: await issueCode(shopId, staff), created: true }
}

/** Kodi yo'q hamma faol do'konga kod beradi (agent ro'yxatini chop etishdan oldin). */
export async function shopCodesAll(staff: Staff) {
  const db = await adminDb()
  const snap = await db.collection('shops').where('hasCode', '==', false).get()
  let issued = 0
  for (const doc of snap.docs) {
    if (!shopOpen(readShop(doc.id, doc.data()))) continue
    await issueCode(doc.id, staff)
    issued++
  }
  return { issued }
}

/** Akkauntni (yoki `all` bilan hammasini) do'kondan uzadi. */
export async function shopUnbind(_staff: Staff, body: Body) {
  const shopId = str(body.shopId)
  if (!shopId) throw new Error('Do‘kon tanlanmagan')
  const db = await adminDb()
  const ref = db.collection('shops').doc(shopId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Do‘kon topilmadi')
  const shop = readShop(shopId, snap.data())

  const removed = body.all === true ? shop.memberIds : [str(body.uid)].filter((uid) => shop.memberIds.includes(uid))
  if (!removed.length) return { removed: 0 }
  await ref.update({ memberIds: FieldValue.arrayRemove(...removed), updatedAt: new Date().toISOString() })
  // Ularning ruxsatlari darhol qayta hisoblanadi
  for (const uid of removed) await syncUserClaims(uid)
  return { removed: removed.length }
}

export async function shopSetActive(_staff: Staff, body: Body) {
  const shopId = str(body.shopId)
  if (!shopId) throw new Error('Do‘kon tanlanmagan')
  const db = await adminDb()
  const ref = db.collection('shops').doc(shopId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Do‘kon topilmadi')
  const active = body.active === true
  await ref.set({ active, updatedAt: new Date().toISOString() }, { merge: true })
  for (const uid of readShop(shopId, snap.data()).memberIds) await syncUserClaims(uid)
  return { active }
}

export async function shopDelete(_staff: Staff, body: Body) {
  const shopId = str(body.shopId)
  const db = await adminDb()
  const ref = db.collection('shops').doc(shopId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Do‘kon topilmadi')
  const shop = readShop(shopId, snap.data())
  if (shop.source !== 'manual') throw new Error('Linko do‘konini o‘chirib bo‘lmaydi — uni bloklang')
  await ref.delete()
  await db.collection('shop_codes').doc(shopId).delete().catch(() => {})
  for (const uid of shop.memberIds) await syncUserClaims(uid)
  return { deleted: true }
}
