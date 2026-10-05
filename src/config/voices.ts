/**
 * Kirish ovozlari — admin panel → «Kirish ovozlari» (Firestore: `settings/voices`).
 *
 * Ovoz faqat intro (ochilish reklamasi) tugagach, asosiy sahifada chalinadi
 * (src/utils/welcome-voice.ts). Qaysi ovoz — sanaga qarab tanlanadi
 * (`voiceForDay`). Hujjat hali yo'q bo'lsa — ilova ichidagi standart ovoz.
 * Server tekshiruvi: api/_lib/actions/voices.ts.
 */

/** always — har ochilganda; daily — kuniga bir marta; once — har mijozga bir marta. */
export type VoiceMode = 'always' | 'daily' | 'once'

export type VoiceItem = {
  id: string
  name: string
  /** Storage havolasi yoki ilova ichidagi fayl («/sounds/…»). */
  url: string
  active: boolean
  /** «2026-10-01» — shu kundan (bo'sh — cheklovsiz). */
  from: string | null
  /** «2026-10-07» — shu kungacha, shu kun ham kiradi (bo'sh — cheklovsiz). */
  to: string | null
  mode: VoiceMode
}

export const VOICE_MODES: { key: VoiceMode; label: string }[] = [
  { key: 'always', label: 'Har ochilganda' },
  { key: 'daily', label: 'Kuniga bir marta' },
  { key: 'once', label: 'Bir marta (har mijozga)' },
]

/** Hujjat yo'q paytda chalinadigan ilova ichidagi ovoz. */
export const DEFAULT_VOICE: VoiceItem = {
  id: 'default',
  name: 'Standart kirish ovozi',
  url: '/sounds/welcome.mp3?v=2',
  active: true,
  from: null,
  to: null,
  mode: 'always',
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

export function readVoices(raw: unknown): VoiceItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((v) => (v ?? {}) as Record<string, unknown>)
    .map((v): VoiceItem => ({
      id: String(v.id || ''),
      name: String(v.name || ''),
      url: String(v.url || ''),
      active: v.active !== false,
      from: typeof v.from === 'string' && DAY.test(v.from) ? v.from : null,
      to: typeof v.to === 'string' && DAY.test(v.to) ? v.to : null,
      mode: v.mode === 'daily' || v.mode === 'once' ? v.mode : 'always',
    }))
    .filter((v) => v.id && v.url)
}

const span = (v: VoiceItem) =>
  v.from && v.to ? (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000 : Number.MAX_SAFE_INTEGER

/**
 * Shu kuni qaysi ovoz: faol va sanasi mos kelganlardan — sanasi
 * belgilanganlar oldin (oralig'i torroq bo'lgani ustun), keyin
 * «har kuni»lar ro'yxatdagi tartibda. Hech biri — null (ovoz yo'q).
 */
export function voiceForDay(items: VoiceItem[], day: string): VoiceItem | null {
  const fits = items.filter((v) => v.active && v.url && (!v.from || day >= v.from) && (!v.to || day <= v.to))
  const dated = fits.filter((v) => v.from || v.to).sort((a, b) => span(a) - span(b))
  return dated[0] ?? fits[0] ?? null
}
