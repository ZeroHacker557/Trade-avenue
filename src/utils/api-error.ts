import { ApiError } from '../lib/api'
import type { TranslationKey } from '../i18n'

type Translate = (key: TranslationKey, values?: Record<string, string | number>) => string

/**
 * Server xatosini mijozning tilida ko'rsatadi.
 *
 * `/api/*` javobida `code` bo'ladi (masalan `PROMO_EXPIRED`) — shu kod
 * bo'yicha `error.<KOD>` tarjimasi izlanadi. Tarjima topilmasa yoki kod
 * umuman kelmasa serverning o'z matni ko'rsatiladi: eski endpointlar
 * ham ishlayversin.
 *
 * `amount` kabi son qiymatlar `format` orqali o'tadi — narx mijoz
 * ko'rgan ko'rinishda («150 000 so'm») chiqsin.
 */
export function apiErrorText(
  error: unknown,
  t: Translate,
  fallback: TranslationKey,
  format?: (value: number) => string,
): string {
  if (!(error instanceof ApiError)) return t(fallback)

  if (error.code) {
    const key = `error.${error.code}` as TranslationKey
    const params = error.params
      ? Object.fromEntries(
          Object.entries(error.params).map(([name, value]) => [
            name,
            format && typeof value === 'number' ? format(value) : value,
          ]),
        )
      : undefined
    const text = t(key, params)
    // Tarjima yo'q bo'lsa `t()` kalitning o'zini qaytaradi
    if (text !== key) return text
  }

  return error.message || t(fallback)
}
