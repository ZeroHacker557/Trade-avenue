/**
 * Yangi buyurtma ovozi.
 *
 * Audio fayl ishlatilmadi: brauzer uni yuklashi, keshlashi va bundle'ga
 * qo'shilishi kerak bo'lardi. Web Audio bilan ikki notali yumshoq jaranh
 * o'sha zahoti, hech qanday faylsiz yasaladi.
 *
 * DIQQAT: brauzer foydalanuvchi sahifa bilan muloqot qilmaguncha ovozga
 * ruxsat bermaydi. Shuning uchun birinchi bosishda kontekst «uyg'otiladi»
 * (unlockAudio) — busiz birinchi buyurtma ovozsiz o'tib ketardi.
 */

let ctx: AudioContext | null = null

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  }
  return ctx
}

/** Sahifadagi birinchi bosishda chaqiriladi — brauzer talabini bajaradi. */
export function unlockAudio() {
  const audio = context()
  if (audio?.state === 'suspended') void audio.resume()
}

function tone(audio: AudioContext, freq: number, start: number, duration: number, gain: number) {
  const osc = audio.createOscillator()
  const vol = audio.createGain()

  osc.type = 'sine'
  osc.frequency.value = freq

  // Yumshoq kirish va chiqish — keskin boshlanish «chirt» etib eshitiladi
  vol.gain.setValueAtTime(0, start)
  vol.gain.linearRampToValueAtTime(gain, start + 0.02)
  vol.gain.exponentialRampToValueAtTime(0.0001, start + duration)

  osc.connect(vol)
  vol.connect(audio.destination)
  osc.start(start)
  osc.stop(start + duration + 0.05)
}

/** Ikki notali yoqimli jarang (C6 → E6). */
export function playNewOrderChime() {
  const audio = context()
  if (!audio) return
  if (audio.state === 'suspended') void audio.resume()

  const now = audio.currentTime
  tone(audio, 1046.5, now, 0.28, 0.16)
  tone(audio, 1318.5, now + 0.13, 0.38, 0.13)
}
