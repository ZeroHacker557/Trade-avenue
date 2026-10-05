import { DEFAULT_VOICE, voiceForDay, type VoiceItem } from '../config/voices'
import { tashkentToday } from './order-label'

/**
 * Kirish ovozi: intro (ochilish reklamasi) tugagach, asosiy sahifada.
 * Qaysi ovoz va qanchalik tez-tez — admin panel → «Kirish ovozlari»
 * (`settings/voices`, src/config/voices.ts):
 *   always — har kirishda (mini app fonga ketib qaytganda ham);
 *   daily  — shu qurilmada kuniga bir marta;
 *   once   — shu qurilmada bir marta.
 *
 * Telefon brauzerlari (ayniqsa iOS / Telegram) foydalanuvchi ekranga
 * tegmaguncha ovozni bloklaydi: introdagi «O'tkazib yuborish» bosilganda
 * o'sha bosish ichida chalinadi; bloklansa — birinchi tegishda (bir necha
 * soniya ichida), kech qolsa chalinmaydi.
 *
 * MUHIM: bu yerdagi hech qanday xato ilovani to'xtatmasligi kerak — ovoz
 * ixtiyoriy bezak. Hammasi try/catch ichida.
 */

/** Bloklangan ovozni birinchi tegishda chalish uchun kutish muddati. */
const GESTURE_WINDOW_MS = 8000
/** Ketma-ket ikki marta (masalan intro + qaytish bir vaqtda) chalinmasin. */
const MIN_GAP_MS = 5000
/** Intro tugaganda sozlama hali kelmagan bo'lsa — shuncha vaqt kutiladi. */
const CONFIG_WAIT_MS = 6000
const SEEN_KEY = 'musaVoiceSeen'

/** undefined — sozlama hali kelmadi; null — bugun ovoz yo'q. */
let choice: VoiceItem | null | undefined
let audio: HTMLAudioElement | null = null
let audioUrl = ''
let lastPlayedAt = 0
let wantedAt = 0
let pendingCleanup: (() => void) | null = null

function readSeen(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') as Record<string, string>
  } catch {
    return {}
  }
}

function markSeen(voice: VoiceItem) {
  try {
    if (voice.mode === 'always') return
    localStorage.setItem(SEEN_KEY, JSON.stringify({ ...readSeen(), [voice.id]: tashkentToday() }))
  } catch {
    // saqlab bo'lmasa — keyingi safar yana chalinadi, xolos
  }
}

/** Shu qurilmada bu ovoz endi chalinmasinmi (rejimiga ko'ra). */
function alreadyHeard(voice: VoiceItem): boolean {
  const seen = readSeen()[voice.id]
  if (!seen) return false
  return voice.mode === 'once' || (voice.mode === 'daily' && seen === tashkentToday())
}

/**
 * Sozlama keldi (yoki o'zgardi). `null` — hujjat yo'q: ilova ichidagi
 * standart ovoz. Bo'sh ro'yxat — ovoz o'chirilgan.
 */
export function setWelcomeVoices(items: VoiceItem[] | null) {
  try {
    choice = items === null ? DEFAULT_VOICE : voiceForDay(items, tashkentToday())
    if (choice && choice.url !== audioUrl && typeof Audio !== 'undefined') {
      audio = new Audio(choice.url)
      audio.preload = 'auto'
      audioUrl = choice.url
    }
    // Intro sozlamadan oldin tugagan bo'lsa — endi chalamiz
    if (wantedAt && Date.now() - wantedAt < CONFIG_WAIT_MS) {
      wantedAt = 0
      playWelcomeVoice()
    }
  } catch {
    choice = null
  }
}

export function playWelcomeVoice() {
  try {
    if (choice === undefined) {
      wantedAt = Date.now()
      return
    }
    const voice = choice
    const sound = audio
    if (!voice || !sound || alreadyHeard(voice)) return
    if (Date.now() - lastPlayedAt < MIN_GAP_MS) return
    lastPlayedAt = Date.now()
    pendingCleanup?.()
    sound.currentTime = 0

    const attempt = sound.play()
    if (!attempt || typeof attempt.then !== 'function') return
    attempt.then(() => markSeen(voice)).catch(() => {
      // Bloklandi — birinchi tegishda (muddat ichida) qayta urinamiz
      const until = Date.now() + GESTURE_WINDOW_MS
      const onGesture = () => {
        cleanup()
        if (Date.now() > until) return
        try {
          void sound.play()?.then(() => markSeen(voice)).catch(() => {})
        } catch {
          // ovozsiz davom etamiz
        }
      }
      const timer = window.setTimeout(() => cleanup(), GESTURE_WINDOW_MS)
      const cleanup = () => {
        window.clearTimeout(timer)
        window.removeEventListener('pointerdown', onGesture, true)
        window.removeEventListener('keydown', onGesture, true)
        if (pendingCleanup === cleanup) pendingCleanup = null
      }
      pendingCleanup = cleanup
      window.addEventListener('pointerdown', onGesture, true)
      window.addEventListener('keydown', onGesture, true)
    })
  } catch {
    // ovozsiz davom etamiz
  }
}

/**
 * Mini app yopilmay fonga ketib, qayta ochilganda — «har ochilganda»
 * rejimidagi ovoz yana chalinadi (`isHome` — faqat asosiy sahifada).
 */
export function watchWelcomeReturns(isHome: () => boolean): () => void {
  let hiddenAt = 0
  const onVisibility = () => {
    try {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        audio?.pause()
        return
      }
      if (hiddenAt && isHome() && choice?.mode === 'always') playWelcomeVoice()
      hiddenAt = 0
    } catch {
      // ovozsiz davom etamiz
    }
  }
  document.addEventListener('visibilitychange', onVisibility)
  return () => document.removeEventListener('visibilitychange', onVisibility)
}
