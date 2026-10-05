/**
 * Kodli xato: `message` — o'zbekcha (loglar va eski ilovalar uchun),
 * `code` esa ilova o'z tilida ko'rsatishi uchun (src/utils/api-error.ts →
 * `error.<KOD>` tarjimasi). Rus tilidagi kuryer ham xatoni o'z tilida
 * ko'radi.
 */
export class CodedError extends Error {
  code: string
  /** Matndagi son yoki nom — ilova tarjimaga qo'yadi (masalan `{left}`). */
  params?: Record<string, string | number>

  constructor(code: string, message: string, params?: Record<string, string | number>) {
    super(message)
    this.code = code
    this.params = params
  }
}

/** Xatodan kod — kodsiz xatoda undefined. */
export function errorCode(error: unknown): string | undefined {
  return error instanceof CodedError ? error.code : undefined
}
