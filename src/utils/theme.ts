import { getTelegram } from './telegram'

export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'musaShopTheme'

/**
 * Ilova ko'rinishi.
 *
 * Standart — YORUG'. Tizim yoki Telegram temasiga avtomatik ergashmaymiz:
 * do'kon egasi ilova doim bir xil ko'rinishini xohlaydi, foydalanuvchi esa
 * xohlasa Profil bo'limidan qorong'iga o'tkazadi. Tanlov saqlanib qoladi.
 */
export function getStoredTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // localStorage yopiq bo'lishi mumkin
  }
  return 'light'
}

export function storeTheme(mode: ThemeMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // saqlanmasa ham joriy seansda ishlaydi
  }
}

/** Temani hujjatga qo'llaydi va Telegram panellarini moslaydi. */
export function applyTheme(mode: ThemeMode) {
  document.documentElement.setAttribute('data-theme', mode)

  // Tokenlar qo'llanib bo'lgach Telegram paneli ranglarini olamiz
  requestAnimationFrame(() => {
    const cs = getComputedStyle(document.documentElement)
    const surface = cs.getPropertyValue('--surface').trim()
    const bg = cs.getPropertyValue('--bg').trim()
    const tg = getTelegram()
    // Ochilish animatsiyasi paytida panel splash rangida turadi;
    // animatsiya tugagach main.tsx temani qayta qo'llaydi
    if (document.documentElement.hasAttribute('data-splash')) return

    /*
     * Telegram paneli ilova tepasidagi tus bilan bir xil bo'ladi —
     * shunda bot nomi turgan qator va sahifa bir butun ko'rinadi.
     *
     * AYNAN `--tint-top` olinadi, `--tint-mid` emas: sahifaning eng
     * yuqori 64px'i shu rangdagi tekis band (styles.css `.app-tint`).
     * Ochroq `--tint-mid` olinsa panel bilan sahifa o'rtasida ko'zga
     * tashlanadigan chok paydo bo'ladi.
     *
     * Qorong'i rejimda tus shaffof, shuning uchun yuza rangi olinadi.
     */
    const tint = cs.getPropertyValue('--tint-top').trim()
    const headerColor = tint && tint !== 'transparent' ? tint : surface
    if (headerColor) tg?.setHeaderColor?.(headerColor)
    if (bg) {
      tg?.setBackgroundColor?.(bg)
      tg?.setBottomBarColor?.(bg)
    }
  })
}
