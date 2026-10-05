import type { TranslationKey } from '../i18n'
import { getTelegram, isTelegramEnvironment } from '../utils/telegram'

type T = (key: TranslationKey, values?: Record<string, string | number>) => string

/** Tashqi havola — Telegram ichida tizim brauzeri/ilovasida ochiladi. */
export function openExternal(url: string) {
  const tg = getTelegram()
  if (tg?.openLink) tg.openLink(url)
  else window.open(url, '_blank', 'noopener')
}

/** «hozirgina», «12 daq oldin», «2 soat oldin». */
export function timeAgo(value: string | null, t: T): string {
  const ms = Date.parse(value || '')
  if (!Number.isFinite(ms)) return ''
  const minutes = Math.max(0, Math.round((Date.now() - ms) / 60_000))
  if (minutes < 1) return t('courier.justNow')
  if (minutes < 60) return t('courier.minutesAgo', { n: minutes })
  return t('courier.hoursAgo', { n: Math.floor(minutes / 60) })
}

/** «14:32». */
export function clock(value: string | null): string {
  const ms = Date.parse(value || '')
  if (!Number.isFinite(ms)) return ''
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * Tasdiqlash — Telegram'ning o'z oynasi (ilova ichida chiroyli va
 * tanish ko'rinadi), Telegram tashqarisida — brauzer oynasi.
 */
export function confirmAction(message: string): Promise<boolean> {
  const tg = getTelegram()
  // Brauzerda ham `Telegram.WebApp` obyekti bor, lekin showConfirm u yerda
  // javob qaytarmaydi — faqat haqiqiy Telegram muhitida ishlatamiz
  if (tg?.showConfirm && isTelegramEnvironment()) {
    try {
      return new Promise((resolve) => tg.showConfirm(message, (ok) => resolve(Boolean(ok))))
    } catch {
      // Eski mijozda usul yo'q — brauzer oynasi
    }
  }
  return Promise.resolve(window.confirm(message))
}

/** Telefon raqamidan `tel:` havolasi. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}
