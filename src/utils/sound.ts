/**
 * Qisqa ovozli eslatmalar (masalan «telefon raqamingizni kiriting»).
 * Foydalanuvchi bosgan paytda chaqiriladi — brauzer bloklamaydi.
 * Ovoz — bezak: hech qanday xato ilovani to'xtatmaydi.
 */
const cache = new Map<string, HTMLAudioElement>()

/** Oldindan yuklab qo'yish — bosilganda kechikmasin. */
export function preloadSound(src: string) {
  try {
    if (cache.has(src) || typeof Audio === 'undefined') return
    const audio = new Audio(src)
    audio.preload = 'auto'
    cache.set(src, audio)
  } catch {
    // ovozsiz davom etamiz
  }
}

export function playSound(src: string) {
  try {
    preloadSound(src)
    const audio = cache.get(src)
    if (!audio) return
    audio.currentTime = 0
    void audio.play()?.catch(() => {})
  } catch {
    // ovozsiz davom etamiz
  }
}
