/**
 * Ilova ochilgan parametrlar: URL so'rovi + Telegram `start_param`.
 *
 * Kanal postidagi tugma `t.me/<bot>?startapp=q<base64url>` bilan ochadi
 * (kanalda `web_app` tugmasi ishlamaydi). Ichida o'sha so'rov qatori —
 * `cat=...`, `page=catalog`, `src=ch_…` va h.k.
 * Server: api/_lib/actions/people.ts → startAppParam.
 */
let cached: URLSearchParams | null = null

export function launchParams(): URLSearchParams {
  if (cached) return new URLSearchParams(cached)
  const q = new URLSearchParams(window.location.search)
  const start = window.Telegram?.WebApp?.initDataUnsafe?.start_param || q.get('tgWebAppStartParam') || ''
  if (/^q[\w-]{2,511}$/.test(start)) {
    try {
      const b64 = start.slice(1).replace(/-/g, '+').replace(/_/g, '/')
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      new URLSearchParams(new TextDecoder().decode(bytes)).forEach((value, key) => {
        if (!q.has(key)) q.set(key, value)
      })
    } catch {
      // Buzilgan parametr — oddiy ochiladi
    }
  }
  cached = q
  return new URLSearchParams(q)
}
