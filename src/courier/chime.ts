/**
 * Yangi buyurtma ovozi — fayl yuklamasdan, Web Audio bilan chalinadigan
 * ikki tonli qisqa «din-don».
 *
 * Brauzer ovozni faqat foydalanuvchi ekranga tekkandan keyin ruxsat
 * beradi, shuning uchun AudioContext birinchi bosishda «uyg'otiladi»
 * (`unlockChime`). Ungacha ovoz chiqmaydi — faqat titrash.
 */

type Ctx = AudioContext
let ctx: Ctx | null = null

function context(): Ctx | null {
  if (ctx) return ctx
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  ctx = new Ctor()
  return ctx
}

/** Birinchi bosishda chaqiriladi — keyin ovoz ishlaydi. */
export function unlockChime() {
  const c = context()
  if (c && c.state === 'suspended') void c.resume()
}

export function playChime() {
  const c = context()
  if (!c || c.state !== 'running') return
  const now = c.currentTime
  // Ikki nota: E6 → A6, yumshoq so'nuvchi
  for (const [i, freq] of [1318.5, 1760].entries()) {
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    const start = now + i * 0.16
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45)
    osc.connect(gain).connect(c.destination)
    osc.start(start)
    osc.stop(start + 0.5)
  }
}
