import { useCallback, useEffect, useState } from 'react'
import { DEMO } from './api'

/** Oxirgi ma'lum holat — ilova qayta ochilganda do'kon bir lahza chaqnab ketmasin. */
const COURIER_KEY = 'musa:courier'
/** Kuryer o'zi tanlagan rejim: do'kon yoki kuryer sahifasi. */
const MODE_KEY = 'musa:mode'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Saqlab bo'lmasa ham rejim shu seans davomida ishlaydi
  }
}

/** Bot xabaridagi tugmalar: `?courier=<buyurtma>` va `?support=<murojaat>`. */
function fromUrl(key: 'courier' | 'support'): string | null {
  try {
    return new URLSearchParams(location.search).get(key)
  } catch {
    return null
  }
}

/**
 * Ilova qaysi qobiqda ochiladi — do'kon yoki kuryer sahifasi.
 *
 * Kuryerlikni server hal qiladi: `users/{telegramId}.courier` belgisini
 * admin panel va /api/auth yozadi (api/_lib/courier-staff.ts). Profil
 * kelguncha oxirgi ma'lum holat ishlatiladi.
 *
 * Kuryer profildagi «Do'konga o'tish» bilan do'konga o'tishi mumkin.
 * Bot havolasi bilan ochilsa esa doim kuryer sahifasi chiqadi.
 */
export function useCourierMode(profile: { courier?: boolean } | null) {
  const [focusId] = useState(() => fromUrl('courier'))
  const [supportId] = useState(() => fromUrl('support'))
  const [mode, setMode] = useState<'courier' | 'shop'>(() =>
    focusId || supportId ? 'courier' : read(MODE_KEY) === 'shop' ? 'shop' : 'courier',
  )

  // Server shu seansda «kuryer emassiz» degan bo'lsa
  const [revoked, setRevoked] = useState(false)

  // Profil kelgan bo'lsa — undagi belgi, bo'lmasa oxirgi ma'lum holat
  const known = profile ? profile.courier === true : read(COURIER_KEY) === '1'
  const isCourier = DEMO || (known && !revoked)

  // Belgi keyingi ochilish uchun eslab qolinadi
  const loaded = profile !== null
  useEffect(() => {
    if (loaded) write(COURIER_KEY, known ? '1' : null)
  }, [loaded, known])

  const openShop = useCallback(() => {
    setMode('shop')
    write(MODE_KEY, 'shop')
    window.scrollTo(0, 0)
  }, [])

  const openCourier = useCallback(() => {
    setMode('courier')
    write(MODE_KEY, 'courier')
    window.scrollTo(0, 0)
  }, [])

  /** Server rad etdi — belgi eskirgan, do'konga qaytamiz. */
  const dropCourier = useCallback(() => {
    write(COURIER_KEY, null)
    setRevoked(true)
  }, [])

  return {
    isCourier,
    active: isCourier && mode === 'courier',
    focusId,
    supportId,
    openShop,
    openCourier,
    dropCourier,
  }
}
