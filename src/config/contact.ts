import { BRAND } from './brand'

/**
 * «Biz bilan aloqa» — admin panel → Sozlamalar → «Biz bilan aloqa».
 * Firestore: `settings/contact`. Hujjat yo'q yoki maydon bo'sh bo'lsa —
 * brend standarti (src/config/brand.ts). Bot ham shu hujjatni o'qiydi
 * (bot/firebase_db.py → get_contact_settings).
 */
export type ContactInfo = {
  phone: string
  /** Username, `@` siz: «for_name». */
  telegram: string
  email: string
  address: string
  workHours: string
}

export const DEFAULT_CONTACT: ContactInfo = {
  phone: BRAND.phone,
  telegram: BRAND.telegram.replace(/^@/, ''),
  email: BRAND.email,
  address: BRAND.city,
  workHours: BRAND.workHours,
}

/** «@name», «t.me/name», «https://t.me/name» → «name». */
export function telegramUsername(value: string): string {
  return value.trim().replace(/^(https?:\/\/)?(t\.me|telegram\.me)\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '')
}

export function readContact(raw: unknown): ContactInfo {
  const d = (raw ?? {}) as Record<string, unknown>
  const str = (key: keyof ContactInfo) => (typeof d[key] === 'string' ? String(d[key]).trim() : '')
  return {
    phone: str('phone') || DEFAULT_CONTACT.phone,
    telegram: telegramUsername(str('telegram')) || DEFAULT_CONTACT.telegram,
    email: str('email') || DEFAULT_CONTACT.email,
    address: str('address') || DEFAULT_CONTACT.address,
    workHours: str('workHours') || DEFAULT_CONTACT.workHours,
  }
}

export const phoneHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`
export const telegramHref = (username: string) => `https://t.me/${username}`
