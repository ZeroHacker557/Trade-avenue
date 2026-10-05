import { randomInt } from 'node:crypto'
import { adminAuth, adminDb } from './firebase-admin.js'
import { readDays } from './delivery-date.js'

/**
 * Do'konlar — Trade Avenue'ning mijozlari.
 *
 *   shops/{shopId}       — do'kon: nomi, telefonlari, manzili, agenti,
 *                          narxlar ro'yxati va unga ulangan Telegram
 *                          foydalanuvchilari (`memberIds`). Odatda Linko
 *                          `markets/` dan sinxronlanadi (shopId = Linko id),
 *                          qo'lda qo'shilganlari `m_` bilan boshlanadi.
 *   shop_codes/{shopId}  — kirish kodi (6 belgi). Faqat adminga ko'rinadi:
 *                          kodni agent do'konga olib boradi.
 *   login_attempts/{uid} — noto'g'ri urinishlar hisobi (faqat server).
 *
 * Do'konchi mini app'da telefon + kod bilan kiradi (api/shop.ts), shundan
 * keyin uning Telegram akkaunti do'konga bog'lanadi. Bitta akkaunt bir
 * nechta do'konga (filiallar) bog'lanishi mumkin.
 */

export type ShopDoc = {
  id: string
  /** Linko `markets/` id si; qo'lda qo'shilganda 0. */
  linkoId: number
  name: string
  /** Normallashgan raqamlar: 998XXXXXXXXX. */
  phones: string[]
  /** Admin qo'lda qo'shgan raqamlar — sinxron ularni o'chirmaydi. */
  extraPhones: string[]
  address: string
  location: { lat: number; lng: number } | null
  agentId: number
  agentName: string
  priceListId: number
  priceListName: string
  marketTypeName: string
  /** `false` — admin bloklagan: kirib bo'lmaydi, buyurtma qabul qilinmaydi. */
  active: boolean
  /** `false` — Linko'da o'chirilgan savdo nuqtasi. */
  linkoActive: boolean
  /** Do'konning yetkazish kunlari (agent marshruti). Bo'sh — umumiy sozlama. */
  deliveryDays: number[]
  note: string
  /** Bog'langan Telegram foydalanuvchilari (uid — matn). */
  memberIds: string[]
  hasCode: boolean
  codeIssuedAt: string | null
  source: 'linko' | 'manual'
  createdAt: string
  updatedAt: string
  syncedAt: string | null
}

/** Kod alifbosi — chalkash belgilarsiz (0/O, 1/I/L). 31^6 ≈ 887 mln variant. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 6

export function newShopCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return code
}

/** Foydalanuvchi kiritgan kod: bo'shliq va chiziqlarsiz, katta harflarda. */
export function cleanCode(value: unknown): string {
  return String(value ?? '').toUpperCase().replace(/[\s-]/g, '').slice(0, 20)
}

/**
 * Telefon raqami → `998XXXXXXXXX`. O'zbekiston raqami 9 xonali; 998 siz
 * yozilgan bo'lsa qo'shiladi. Yaroqsiz bo'lsa — bo'sh satr.
 */
export function normalizePhone(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (digits.length === 9) return `998${digits}`
  if (digits.length === 12 && digits.startsWith('998')) return digits
  return ''
}

/** Ekranda: «+998 90 123 45 67». */
export function formatPhone(phone: string): string {
  const d = normalizePhone(phone)
  if (!d) return phone
  return `+998 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10, 12)}`
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function readShop(id: string, data: FirebaseFirestore.DocumentData | undefined): ShopDoc {
  const d = data ?? {}
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : [])
  const loc = d.location as { lat?: unknown; lng?: unknown } | null | undefined
  return {
    id,
    linkoId: num(d.linkoId),
    name: str(d.name) || `Do‘kon ${id}`,
    phones: list(d.phones),
    extraPhones: list(d.extraPhones),
    address: str(d.address),
    location: loc && Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lng))
      ? { lat: Number(loc.lat), lng: Number(loc.lng) }
      : null,
    agentId: num(d.agentId),
    agentName: str(d.agentName),
    priceListId: num(d.priceListId),
    priceListName: str(d.priceListName),
    marketTypeName: str(d.marketTypeName),
    active: d.active !== false,
    linkoActive: d.linkoActive !== false,
    deliveryDays: readDays(d.deliveryDays),
    note: str(d.note),
    memberIds: list(d.memberIds),
    hasCode: d.hasCode === true,
    codeIssuedAt: str(d.codeIssuedAt) || null,
    source: d.source === 'manual' ? 'manual' : 'linko',
    createdAt: str(d.createdAt),
    updatedAt: str(d.updatedAt),
    syncedAt: str(d.syncedAt) || null,
  }
}

/** Do'kon ishlayaptimi: admin bloklamagan va Linko'da o'chirilmagan. */
export function shopOpen(shop: Pick<ShopDoc, 'active' | 'linkoActive'>): boolean {
  return shop.active && shop.linkoActive
}

/** Do'konning hamma raqamlari (Linko'dagi va qo'lda qo'shilgan). */
export function shopPhones(shop: Pick<ShopDoc, 'phones' | 'extraPhones'>): string[] {
  return [...new Set([...shop.phones, ...shop.extraPhones].map(normalizePhone).filter(Boolean))]
}

/**
 * Foydalanuvchining hozirgi do'konlari (faol bo'lganlari).
 *
 * Manba — `shops.memberIds` (admin uzib qo'ysa darhol kuchga kiradi),
 * `users.shopIds` esa uning nusxasi: ilova o'zini tez tiklashi uchun.
 */
export async function shopsOfUser(uid: string): Promise<ShopDoc[]> {
  const db = await adminDb()
  const snap = await db.collection('shops').where('memberIds', 'array-contains', uid).get()
  return snap.docs.map((doc) => readShop(doc.id, doc.data())).filter(shopOpen)
}

/**
 * Custom claims — Firestore Rules shu bo'yicha katalog va narxlarni ochadi.
 *   shops — bog'langan do'konlar
 *   pl    — ularning narxlar ro'yxatlari (price_lists/{id} ni o'qish uchun)
 *
 * Foydalanuvchining boshqa claim'lari (masalan xodim roli) saqlanib qoladi.
 */
export async function syncUserClaims(uid: string, shops?: ShopDoc[]): Promise<{ shops: string[]; pl: number[] }> {
  const list = shops ?? (await shopsOfUser(uid))
  const claims = {
    shops: list.map((s) => s.id),
    pl: [...new Set(list.map((s) => s.priceListId).filter((id) => id > 0))],
  }
  const auth = await adminAuth()
  try {
    const user = await auth.getUser(uid)
    const current = (user.customClaims ?? {}) as Record<string, unknown>
    const same = JSON.stringify(current.shops ?? []) === JSON.stringify(claims.shops)
      && JSON.stringify(current.pl ?? []) === JSON.stringify(claims.pl)
    if (!same) await auth.setCustomUserClaims(uid, { ...current, ...claims })
  } catch (error) {
    // Foydalanuvchi hali Auth'da yo'q (birinchi kirishgacha) — claim custom token bilan beriladi
    if ((error as { code?: string })?.code !== 'auth/user-not-found') throw error
  }
  // Profilda nusxasi — ilova qaysi do'konlarni ko'rsatishini darhol biladi
  const db = await adminDb()
  await db.collection('users').doc(uid).set({ shopIds: claims.shops }, { merge: true })
  return claims
}
