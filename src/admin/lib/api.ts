import { auth } from './auth'

export class AdminApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'AdminApiError'
  }
}

/**
 * `/api/admin/*` ga imzolangan so'rov.
 *
 * Har chaqiruvda yangi ID token olinadi — Firebase uni keshlaydi va faqat
 * muddati tugaganda qayta so'raydi, shuning uchun bu qimmat emas. Buning
 * evaziga xodim bloklangach, keyingi so'rovdayoq 403 qaytadi.
 */
async function request<T>(path: string, init: RequestInit = {}, forceToken = false): Promise<T> {
  const user = auth.currentUser
  if (!user) throw new AdminApiError('Tizimga kirilmagan', 401)

  const token = await user.getIdToken(forceToken)
  const response = await fetch(`/api/admin/${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  })

  /*
   * 401 — token eskirgan yoki bekor qilingan.
   *
   * Ilova uzoq yopiq turgandan keyin ochilganda (masalan Telegram
   * ichida) keshdagi token muddati o'tgan bo'lishi mumkin. Bir marta
   * MAJBURIY yangilab qayta urinamiz — admin uchun hech narsa
   * o'zgarmaydi, ilgari esa «ruxsat berilmadi» chiqardi.
   */
  if (response.status === 401 && !forceToken) {
    return request<T>(path, init, true)
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    /* JSON emas — quyida aniqlashtiramiz */
  }

  if (!response.ok) {
    // `vite dev` serverless funksiyalarni ishga tushirmaydi: /api/* so'rovi
    // index.html ga tushib, JSON o'rniga HTML qaytadi. Buni alohida
    // xabar bilan ajratamiz, aks holda "Server xatosi (404)" deb ko'rinadi
    // va sabab noaniq qoladi.
    if (payload === null && response.status === 404) {
      throw new AdminApiError(
        'API topilmadi. Lokal `npm run dev` da /api ishlamaydi — deploy qilingan manzildan kiring yoki `vercel dev` ishlating.',
        404,
      )
    }
    const message =
      (payload as { error?: string })?.error || `Server xatosi (${response.status})`
    throw new AdminApiError(message, response.status)
  }

  // Status 200, lekin JSON emas — bu ham API o'rniga HTML kelgani
  if (payload === null) {
    throw new AdminApiError(
      'API javobi tushunarsiz. Lokal ishlab chiqishda /api mavjud emas — deploy qilingan manzildan kiring.',
      502,
    )
  }

  return payload as T
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' })
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) })
}
