import { createContext } from 'react'
import { uz, type TranslationKey } from './uz'
import { ru } from './ru'
import { getTelegram } from '../utils/telegram'

export type Language = 'uz' | 'ru'

export const LANGUAGES: { code: Language; label: TranslationKey; native: string }[] = [
  { code: 'uz', label: 'language.uz', native: "O'zbekcha" },
  { code: 'ru', label: 'language.ru', native: 'Русский' },
]

export const DICTIONARIES: Record<Language, Record<TranslationKey, string>> = { uz, ru }

export const STORAGE_KEY = 'musaShopLang'

/**
 * Profildan (serverdan) oxirgi marta qo'llangan til.
 *
 * Mijoz tilni botda ham tanlashi mumkin - o'sha qiymat `users/<id>.language`
 * ga yoziladi. Bu kalit "shu qiymatni allaqachon qo'lladik" degan belgi:
 * botdagi yangi tanlov ilovaga ham o'tadi, ilovaning o'zida qilingan tanlov
 * esa har ochilishda qayta yozilib ketmaydi.
 */
export const SERVER_LANG_KEY = 'musaShopLangSynced'

/** Telegram tilidan boshlang'ich tanlov: ruscha bo'lsa ru, aks holda uz. */
export function detectLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'uz' || saved === 'ru') return saved
  } catch {
    // localStorage yopiq bo'lishi mumkin
  }

  const code = getTelegram()?.initDataUnsafe?.user?.language_code
  if (code && code.toLowerCase().startsWith('ru')) return 'ru'
  return 'uz'
}

/** {count} kabi o'rin egallovchilarni almashtiradi. */
export function interpolate(template: string, values?: Record<string, string | number>): string {
  if (!values) return template
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in values ? String(values[key]) : match,
  )
}

export type I18nValue = {
  lang: Language
  setLang: (lang: Language) => void
  t: (key: TranslationKey, values?: Record<string, string | number>) => string
}

export const I18nContext = createContext<I18nValue | null>(null)
