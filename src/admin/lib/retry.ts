/**
 * O'tkinchi xatolarda qayta urinish.
 *
 * NEGA: panel Telegram ichida yoki telefonda ochilganda birinchi
 * so'rov ba'zan yetib bormaydi — tarmoq hali tiklanmagan, serverless
 * funksiya sovuqdan ko'tarilmoqda yoki token yangilanmoqda. Bitta
 * shunday xato adminni «Ruxsat berilmadi» ekraniga olib borib,
 * qaytadan kirishga majbur qilardi.
 *
 * `isFatal` — qayta urinish foydasiz bo'lgan hollar (masalan 403:
 * hisob xodim emas). Ular darhol yuqoriga otiladi.
 */
export type RetryOptions = {
  /** Jami necha marta urinib ko'riladi (birinchisi ham shu ichida). */
  attempts?: number
  /** Urinishlar orasidagi kutish (ms): 1-chi, 2-chi... */
  delay?: (attempt: number) => number
  /** Shu xatoda qayta urinilmaydi. */
  isFatal?: (error: unknown) => boolean
  /** Kutish usuli — testda almashtiriladi. */
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function withRetry<T>(run: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = options.attempts ?? 3
  const delay = options.delay ?? ((attempt: number) => 600 * attempt)
  const sleep = options.sleep ?? defaultSleep

  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await run()
    } catch (error) {
      if (options.isFatal?.(error)) throw error
      lastError = error
      if (attempt < attempts) await sleep(delay(attempt))
    }
  }
  throw lastError
}
