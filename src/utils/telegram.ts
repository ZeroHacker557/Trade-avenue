// Telegram WebApp SDK utilities
// https://core.telegram.org/bots/webapps

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp
    }
  }
}

export type TelegramUser = {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
  photo_url?: string
}

type SafeAreaInset = { top: number; bottom: number; left: number; right: number }

/** Telegram LocationManager qaytaradigan lokatsiya (Bot API 8.0+). */
type TelegramLocation = {
  latitude: number
  longitude: number
  horizontal_accuracy?: number | null
}

interface TelegramLocationManager {
  isInited: boolean
  isLocationAvailable: boolean
  isAccessRequested: boolean
  isAccessGranted: boolean
  init: (callback?: () => void) => void
  getLocation: (callback: (location: TelegramLocation | null) => void) => void
  openSettings: () => void
}

interface TelegramWebApp {
  initData: string
  initDataUnsafe: {
    user?: TelegramUser
    query_id?: string
    /** `t.me/<bot>?startapp=<param>` havolasi bilan ochilganda. */
    start_param?: string
  }
  version: string
  platform: string
  colorScheme: 'light' | 'dark'
  themeParams: Record<string, string>
  isExpanded: boolean
  viewportHeight: number
  viewportStableHeight: number
  safeAreaInset?: SafeAreaInset
  contentSafeAreaInset?: SafeAreaInset
  MainButton: {
    text: string
    isVisible: boolean
    isActive: boolean
    setText: (text: string) => void
    show: () => void
    hide: () => void
    onClick: (callback: () => void) => void
    offClick: (callback: () => void) => void
    enable: () => void
    disable: () => void
    showProgress: (leaveActive?: boolean) => void
    hideProgress: () => void
  }
  BackButton: {
    isVisible: boolean
    show: () => void
    hide: () => void
    onClick: (callback: () => void) => void
    offClick: (callback: () => void) => void
  }
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void
    selectionChanged: () => void
  }
  ready: () => void
  expand: () => void
  close: () => void
  sendData: (data: string) => void
  openLink: (url: string, options?: { try_instant_view?: boolean }) => void
  openTelegramLink: (url: string) => void
  showAlert: (message: string, callback?: () => void) => void
  showConfirm: (message: string, callback?: (confirmed: boolean) => void) => void
  setHeaderColor?: (color: string) => void
  setBackgroundColor?: (color: string) => void
  setBottomBarColor?: (color: string) => void
  enableClosingConfirmation?: () => void
  disableVerticalSwipes?: () => void
  /** Bot API 8.0+: Telegram sarlavhasisiz, butun ekran. */
  requestFullscreen?: () => void
  exitFullscreen?: () => void
  isFullscreen?: boolean
  onEvent?: (event: string, handler: (payload?: unknown) => void) => void
  offEvent?: (event: string, handler: (payload?: unknown) => void) => void
  isVersionAtLeast?: (version: string) => boolean
  /** Bot API 8.0+ da mavjud; eski mijozlarda undefined. */
  LocationManager?: TelegramLocationManager
}

// ── Asosiy kirish nuqtalari ──────────────────────────────────

export function getTelegram(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null
}

/** initData mavjudmi — autentifikatsiya uchun qat'iy tekshiruv. */
export function isTelegram(): boolean {
  return !!window.Telegram?.WebApp?.initData
}

/**
 * Telegram ichida ochilganmi — KENG tekshiruv.
 *
 * `initData` ba'zi mijozlarda (eski Desktop versiyalari, ayrim
 * Android build'lar) bo'sh kelishi mumkin, shuning uchun unga
 * yolg'iz tayanib bo'lmaydi. Uchta belgidan bittasi ham yetarli.
 * Shubha bo'lsa — ilovani ko'rsatamiz, to'sib qo'ymaymiz.
 */
export function isTelegramEnvironment(): boolean {
  const tg = getTelegram()
  if (!tg) return false
  if (tg.initData) return true
  if (tg.initDataUnsafe?.user) return true
  return Boolean(tg.platform && tg.platform !== 'unknown')
}

/**
 * telegram-web-app.js sekin yuklansa (yoki CDN javob bermasa),
 * darhol xulosa chiqarmaymiz — qisqa vaqt kutamiz.
 */
export function waitForTelegram(timeoutMs = 1500): Promise<void> {
  if (window.Telegram?.WebApp) return Promise.resolve()

  return new Promise((resolve) => {
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      if (window.Telegram?.WebApp || Date.now() - startedAt >= timeoutMs) {
        window.clearInterval(timer)
        resolve()
      }
    }, 50)
  })
}

/**
 * Foydalanuvchi. Telegram tashqarisida FAQAT dev rejimida soxta
 * foydalanuvchi qaytariladi — production'da null (F-06).
 */
export function getTelegramUser(): TelegramUser | null {
  const tg = getTelegram()

  if (tg?.initDataUnsafe?.user) {
    return tg.initDataUnsafe.user
  }

  if (!import.meta.env.DEV) return null

  try {
    const mockUserStr = localStorage.getItem('mockTelegramUser')
    if (mockUserStr) {
      return JSON.parse(mockUserStr) as TelegramUser
    }

    const randomId = Math.floor(Math.random() * 1000000)
    const newMockUser: TelegramUser = {
      id: randomId,
      first_name: 'Test',
      last_name: 'Foydalanuvchi',
      username: `testuser_${randomId}`,
    }
    localStorage.setItem('mockTelegramUser', JSON.stringify(newMockUser))
    return newMockUser
  } catch {
    return null
  }
}

export function initTelegram() {
  const tg = getTelegram()
  if (!tg) return

  tg.ready()
  tg.expand()

  // Xarid jarayonida tasodifan yopilib qolmasin
  tg.enableClosingConfirmation?.()

  enterFullscreen(tg)
}

/** To'liq ekran faqat telefonda: kompyuterda u butun monitorni egallab oladi. */
const MOBILE_PLATFORMS = ['ios', 'android', 'android_x']

/**
 * Telegram sarlavhasini olib tashlab, ilovani butun ekranga chiqaradi.
 *
 * Bot API 8.0+. Sarlavha o'rnida Telegram faqat ikki kichik suzuvchi
 * tugma qoldiradi (yopish/orqaga va «...»), ilova esa status paneligacha
 * cho'ziladi. Ilova kontenti o'sha tugmalar ostida qolmasligi uchun
 * xavfsiz zona `applySafeArea` da hisoblanadi.
 *
 * Eski Telegram yoki rad javobi (`fullscreenFailed`) — ilova oddiy
 * oynada ishlayveradi, foydalanuvchi hech narsani sezmaydi.
 */
function enterFullscreen(tg: TelegramWebApp) {
  if (!MOBILE_PLATFORMS.includes(tg.platform)) return
  if (!tg.isVersionAtLeast?.('8.0') || !tg.requestFullscreen) return

  const root = document.documentElement
  const sync = () => {
    root.classList.toggle('tg-fullscreen', Boolean(tg.isFullscreen))
    applySafeArea()
  }
  tg.onEvent?.('fullscreenChanged', sync)
  tg.onEvent?.('fullscreenFailed', (payload) => {
    const error = (payload as { error?: string } | undefined)?.error
    if (error !== 'ALREADY_FULLSCREEN') console.info('[telegram] to‘liq ekran mumkin emas:', error)
    sync()
  })

  try {
    tg.requestFullscreen()
    // Sarlavha yo'q — ro'yxatni tepaga surganda oyna yopilib ketmasin (7.7+).
    // Yopish uchun Telegram'ning suzuvchi tugmasi qoladi.
    if (tg.isVersionAtLeast('7.7')) tg.disableVerticalSwipes?.()
  } catch (error) {
    console.info('[telegram] to‘liq ekran yoqilmadi:', error)
  }
  sync()
}

/**
 * Telegram xavfsiz zonasini CSS o'zgaruvchilariga yozamiz.
 *
 * Ikki qatlam QO'SHILADI (Telegram hujjati bo'yicha):
 *   safeAreaInset        — qurilmaniki: status panel, «chelka», pastki chiziq;
 *   contentSafeAreaInset — Telegram'niki: to'liq ekrandagi suzuvchi tugmalar.
 * Ilgari ulardan bittasi olinardi — to'liq ekranda kontent status panel
 * yoki Telegram tugmalari ostida qolib ketardi.
 */
export function applySafeArea() {
  const tg = getTelegram()
  const root = document.documentElement

  const bottom = (tg?.safeAreaInset?.bottom ?? 0) + (tg?.contentSafeAreaInset?.bottom ?? 0)
  const top = (tg?.safeAreaInset?.top ?? 0) + (tg?.contentSafeAreaInset?.top ?? 0)

  // Tepa panel (TopBar) nomni aynan Telegram tugmalari qatoriga qo'yishi uchun
  root.style.setProperty('--tg-status', `${tg?.safeAreaInset?.top ?? 0}px`)
  root.style.setProperty('--tg-controls', `${tg?.contentSafeAreaInset?.top ?? 0}px`)

  // env() qiymati mavjud bo'lsa u ham hisobga olinsin
  root.style.setProperty('--safe-bottom', `max(${bottom}px, env(safe-area-inset-bottom, 0px))`)
  root.style.setProperty('--safe-top', `${top}px`)
}

/**
 * Ekran o'lchami o'zgarishini kuzatamiz (klaviatura ochilishi, aylantirish).
 * Tema bu yerda emas — u foydalanuvchi tanlovi, utils/theme.ts da.
 */
export function watchSafeArea(): () => void {
  const tg = getTelegram()
  const onViewport = () => applySafeArea()

  applySafeArea()

  tg?.onEvent?.('viewportChanged', onViewport)
  tg?.onEvent?.('safeAreaChanged', onViewport)
  tg?.onEvent?.('contentSafeAreaChanged', onViewport)
  tg?.onEvent?.('fullscreenChanged', onViewport)

  return () => {
    tg?.offEvent?.('viewportChanged', onViewport)
    tg?.offEvent?.('safeAreaChanged', onViewport)
    tg?.offEvent?.('contentSafeAreaChanged', onViewport)
    tg?.offEvent?.('fullscreenChanged', onViewport)
  }
}

// ── BackButton ───────────────────────────────────────────────

/**
 * Telegram'ning yuqoridagi "orqaga" tugmasi. Android'da qurilmaning
 * o'z orqaga tugmasi ham shu bilan bog'lanadi — ilgari u butun
 * mini appni yopib yuborardi (D-03).
 */
export function setupBackButton(handler: () => void): () => void {
  const tg = getTelegram()
  if (!tg) return () => {}

  tg.BackButton.onClick(handler)
  return () => tg.BackButton.offClick(handler)
}

export function toggleBackButton(visible: boolean) {
  const tg = getTelegram()
  if (!tg) return
  if (visible) tg.BackButton.show()
  else tg.BackButton.hide()
}

// ── Haptic ───────────────────────────────────────────────────

export function hapticFeedback(type: 'light' | 'medium' | 'heavy' = 'light') {
  getTelegram()?.HapticFeedback.impactOccurred(type)
}

export function hapticSuccess() {
  getTelegram()?.HapticFeedback.notificationOccurred('success')
}

export function hapticError() {
  getTelegram()?.HapticFeedback.notificationOccurred('error')
}

export function hapticSelection() {
  getTelegram()?.HapticFeedback.selectionChanged()
}

// ── Boshqalar ────────────────────────────────────────────────

export function getImageUrl(path: string): string {
  return path
}

export function openBotDeepLink(botUsername: string, payload: string) {
  const tg = getTelegram()
  const url = `https://t.me/${botUsername}?start=${payload}`
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(url)
  } else {
    window.open(url, '_blank')
  }
}

export function showAlert(message: string) {
  const tg = getTelegram()
  if (tg?.showAlert) tg.showAlert(message)
  else window.alert(message)
}


// ── Lokatsiya ────────────────────────────────────────────────

export type LocationResult =
  | { ok: true; lat: number; lng: number }
  | { ok: false; reason: 'denied' | 'timeout' | 'unavailable'; openSettings?: () => void }

/** Hech qanday holatda cheksiz kutib qolmasligi uchun umumiy chegara. */
const LOCATION_TIMEOUT_MS = 12_000

function withTimeout(promise: Promise<LocationResult>): Promise<LocationResult> {
  return Promise.race([
    promise,
    new Promise<LocationResult>((resolve) =>
      setTimeout(() => resolve({ ok: false, reason: 'timeout' }), LOCATION_TIMEOUT_MS),
    ),
  ])
}

/**
 * Foydalanuvchining joriy joylashuvi.
 *
 * Avval Telegram'ning LocationManager'i (Bot API 8.0+) — mini app ichida
 * ishonchli ishlaydigan yagona yo'l. Telegram'ning WebView'i brauzer
 * Geolocation API'sini ko'pincha butunlay bloklaydi, shuning uchun
 * navigator.geolocation faqat zaxira sifatida (Telegram tashqarisida yoki
 * eski mijozlarda) qoladi.
 *
 * Hech qachon xato tashlamaydi — natija doim tushunarli sabab bilan qaytadi.
 */
export function requestLocation(): Promise<LocationResult> {
  const tg = getTelegram()
  const lm = tg?.LocationManager

  if (lm && tg?.isVersionAtLeast?.('8.0')) {
    return withTimeout(
      new Promise<LocationResult>((resolve) => {
        const read = () => {
          if (!lm.isLocationAvailable) {
            return resolve({ ok: false, reason: 'unavailable' })
          }
          lm.getLocation((loc) => {
            if (loc) return resolve({ ok: true, lat: loc.latitude, lng: loc.longitude })
            // Ruxsat bir marta so'ralib rad etilgan bo'lsa Telegram qayta
            // so'ramaydi — yagona yo'l sozlamalar oynasi.
            const blocked = lm.isAccessRequested && !lm.isAccessGranted
            resolve({
              ok: false,
              reason: blocked ? 'denied' : 'unavailable',
              openSettings: blocked ? () => lm.openSettings() : undefined,
            })
          })
        }
        if (lm.isInited) read()
        else lm.init(read)
      }),
    )
  }

  return withTimeout(
    new Promise<LocationResult>((resolve) => {
      if (!navigator.geolocation) {
        return resolve({ ok: false, reason: 'unavailable' })
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ ok: true, lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) =>
          resolve({
            ok: false,
            reason:
              err.code === err.PERMISSION_DENIED
                ? 'denied'
                : err.code === err.TIMEOUT
                  ? 'timeout'
                  : 'unavailable',
          }),
        // timeout ATAYLAB berilgan: standart qiymati Infinity va javob
        // kelmasa tugma abadiy kutib qoladi (F-xato).
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
      )
    }),
  )
}

/** Tashqi havola: t.me — Telegram ichida, boshqasi — brauzerda (banner tugmalari). */
export function openExternalLink(url: string) {
  const tg = getTelegram()
  if (/^https?:\/\/t\.me\//i.test(url) && tg?.openTelegramLink) tg.openTelegramLink(url)
  else if (tg?.openLink) tg.openLink(url)
  else window.open(url, '_blank', 'noopener')
}
