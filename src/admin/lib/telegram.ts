/**
 * Admin panelni Telegram mini app sifatida ochish.
 *
 * Bot adminlarga «🛠 Admin panel» tugmasini ko'rsatadi (bot/bot.py) va
 * u shu sahifani (`admin.html`) Telegram ichida ochadi. Panel oddiy
 * brauzerda ham, Telegram ichida ham bir xil ishlaydi — bu modul
 * faqat Telegram ichida bo'lganda qo'shimcha sozlamalarni qo'llaydi:
 *
 *   • to'liq ekran (Bot API 8.0+);
 *   • pastga surganda oyna yopilib ketmasligi;
 *   • tepadagi Telegram boshqaruv tugmalari ostida qolmaslik uchun
 *     xavfsiz zona (`--adm-inset-top`).
 *
 * TO'LIQ EKRAN HAMMA JOYDA ISHLAMAYDI. Telegram hujjatiga ko'ra so'rov
 * `fullscreenFailed` bilan rad etilishi mumkin (`UNSUPPORTED`) — masalan
 * kompyuterdagi eski Telegram'da. Shu sabab panel ikki narsani beradi:
 * sarlavhadagi «to'liq ekran» tugmasi va qo'llab-quvvatlanmasa —
 * xuddi shu paneldan brauzerda ochish. Kompyuterda katta ekranda
 * ishlashning eng ishonchli yo'li — brauzer oynasi.
 *
 * Kirish (email/parol) o'zgarmaydi: Firebase seansi saqlanadi, admin
 * bir marta kiradi va keyingi ochilishlarda to'g'ridan-to'g'ri tushadi.
 */

type SafeArea = { top?: number; bottom?: number; left?: number; right?: number }

type TelegramWebApp = {
  initData?: string
  version?: string
  platform?: string
  isVersionAtLeast?: (v: string) => boolean
  ready?: () => void
  expand?: () => void
  requestFullscreen?: () => void
  exitFullscreen?: () => void
  isFullscreen?: boolean
  disableVerticalSwipes?: () => void
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void
  safeAreaInset?: SafeArea
  contentSafeAreaInset?: SafeArea
  onEvent?: (event: string, handler: (payload?: unknown) => void) => void
  initDataUnsafe?: { user?: { id: number; first_name?: string; username?: string } }
}

export function getTelegram(): TelegramWebApp | undefined {
  return (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp
}

/** Panel Telegram ichida ochilganmi (imzolangan initData bilan). */
export function isInTelegram(): boolean {
  return Boolean(getTelegram()?.initData)
}

/** Imzolangan initData — serverda Telegram ID ni tasdiqlash uchun. */
export function getInitData(): string {
  return getTelegram()?.initData || ''
}

/** Telegram ichidagi foydalanuvchi ismi (faqat ko'rsatish uchun). */
export function telegramUserLabel(): string {
  const user = getTelegram()?.initDataUnsafe?.user
  if (!user) return ''
  return user.username ? `@${user.username}` : user.first_name || ''
}

/* ── To'liq ekran holati ───────────────────────────────────── */

export type FullscreenState = {
  /** Telegram ichidamiz va usul mavjud. */
  available: boolean
  /** Hozir to'liq ekrandami. */
  active: boolean
  /** Telegram rad etdi (UNSUPPORTED) — bu qurilmada imkoni yo'q. */
  failed: boolean
}

let state: FullscreenState = { available: false, active: false, failed: false }
const listeners = new Set<(s: FullscreenState) => void>()

function setState(patch: Partial<FullscreenState>) {
  state = { ...state, ...patch }
  for (const listener of listeners) listener(state)
}

export function fullscreenState(): FullscreenState {
  return state
}

export function subscribeFullscreen(listener: (s: FullscreenState) => void) {
  listeners.add(listener)
  // useEffect tozalovchisi hech narsa qaytarmasligi kerak
  return () => {
    listeners.delete(listener)
  }
}

/** Tugmadan chaqiriladi: to'liq ekranga kirish yoki chiqish. */
export function toggleFullscreen() {
  const tg = getTelegram()
  if (!tg) return
  if (tg.isFullscreen) tg.exitFullscreen?.()
  else {
    setState({ failed: false })
    tg.requestFullscreen?.()
  }
}

/**
 * Panelni tashqi brauzerda ochadi.
 *
 * Kompyuterda Telegram oynasi telefon o'lchamida bo'lib qoladi va
 * to'liq ekran har doim ham ishlamaydi — brauzerda esa panel butun
 * ekranni egallaydi. Seans (kirish) o'sha domenga bog'liq: brauzerda
 * bir marta kirilsa, keyin ham saqlanib turadi.
 */
export function openInBrowser() {
  const url = `${location.origin}/admin.html`
  const tg = getTelegram()
  if (tg?.openLink) tg.openLink(url)
  else window.open(url, '_blank', 'noopener')
}

function applyInsets(tg: TelegramWebApp) {
  // To'liq ekranda Telegram o'z tugmalarini sahifa USTIGA chizadi.
  // `contentSafeAreaInset` — aynan o'sha tugmalar egallagan balandlik.
  const top = (tg.safeAreaInset?.top ?? 0) + (tg.contentSafeAreaInset?.top ?? 0)
  const bottom = (tg.safeAreaInset?.bottom ?? 0) + (tg.contentSafeAreaInset?.bottom ?? 0)
  const root = document.documentElement
  root.style.setProperty('--adm-inset-top', `${Math.round(top)}px`)
  root.style.setProperty('--adm-inset-bottom', `${Math.round(bottom)}px`)
}

/**
 * Telegram ichida bo'lsa panelni moslaydi. Brauzerda hech narsa qilmaydi.
 * `admin.html` yuklanishi bilan bir marta chaqiriladi.
 */
export function initAdminTelegram() {
  const tg = getTelegram()
  if (!tg || !tg.initData) return

  document.documentElement.classList.add('in-telegram')

  const canFullscreen = Boolean(tg.isVersionAtLeast?.('8.0') && tg.requestFullscreen)
  setState({ available: canFullscreen, active: Boolean(tg.isFullscreen) })

  try {
    tg.ready?.()
    tg.expand?.()

    // Ro'yxatni pastga surganda oyna yopilib ketmasin (7.7+)
    if (tg.isVersionAtLeast?.('7.7')) tg.disableVerticalSwipes?.()

    // Panel rangini `applyTheme` (src/utils/theme.ts) qo'yadi —
    // u tanlangan mavzuga qarab ishlaydi, shuning uchun bu yerda tegmaymiz.

    if (canFullscreen) {
      tg.requestFullscreen?.()
      // Ba'zi mijozlar oyna to'liq tayyor bo'lgunicha so'rovni e'tiborsiz
      // qoldiradi — bir marta qayta urinamiz. Allaqachon to'liq ekran
      // bo'lsa `ALREADY_FULLSCREEN` keladi va u xato hisoblanmaydi.
      window.setTimeout(() => {
        if (!state.active && !state.failed) tg.requestFullscreen?.()
      }, 400)
    }
  } catch (error) {
    // Telegram versiyasi qo'llab-quvvatlamasa — panel oddiy oynada ishlaydi
    console.warn('[admin/telegram] sozlab bo‘lmadi:', error)
  }

  tg.onEvent?.('fullscreenChanged', () => {
    setState({ active: Boolean(tg.isFullscreen), failed: false })
    applyInsets(tg)
  })
  tg.onEvent?.('fullscreenFailed', (payload) => {
    const error = (payload as { error?: string } | undefined)?.error
    // ALREADY_FULLSCREEN — xato emas, shunchaki takroriy so'rov
    if (error === 'ALREADY_FULLSCREEN') {
      setState({ active: true, failed: false })
      return
    }
    console.info('[admin/telegram] to‘liq ekran mumkin emas:', error)
    setState({ failed: true, active: false })
  })

  applyInsets(tg)
  for (const event of ['safeAreaChanged', 'contentSafeAreaChanged', 'viewportChanged']) {
    tg.onEvent?.(event, () => applyInsets(tg))
  }
}
