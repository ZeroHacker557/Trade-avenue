import { adminDb } from './firebase-admin.js'

/**
 * Mijozga boradigan xabarlar tili.
 *
 * Til foydalanuvchi hujjatida saqlanadi (`users/<id>.language`) — uni
 * botdagi til tanlash ham, ilovaning sozlamalari ham shu yerga yozadi.
 * Shuning uchun mijoz qayerda tanlagan bo'lsa ham, xabarlar o'sha tilda
 * keladi.
 *
 * Admin va kuryerlarga boradigan matnlar tarjima qilinmaydi: ular bitta
 * jamoa va ikkilangan matn faqat chalkashlik keltiradi.
 */
export type Lang = 'uz' | 'ru'

export const DEFAULT_LANG: Lang = 'uz'

export function normalizeLang(value: unknown): Lang {
  return value === 'ru' || value === 'uz' ? value : DEFAULT_LANG
}

/** Mijoz tanlagan til. Hujjat yoki maydon bo'lmasa — o'zbekcha. */
export async function userLang(userId?: number | string | null): Promise<Lang> {
  if (!userId) return DEFAULT_LANG
  try {
    const db = await adminDb()
    const snap = await db.collection('users').doc(String(userId)).get()
    return normalizeLang(snap.data()?.language)
  } catch (error) {
    console.error('[i18n] til o‘qilmadi:', error)
    return DEFAULT_LANG
  }
}
