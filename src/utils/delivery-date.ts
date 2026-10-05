/**
 * Yetkazish sanasi — qabul qilishning oxirgi vaqti va yetkazish kunlari bo'yicha.
 *
 *   «17:00 gacha bersangiz — ertaga» (keyin — indiniga), so'ng birinchi
 *   yetkazish kuniga suriladi. Kunlar — hafta kuni raqamlari (0 = yakshanba).
 *   Do'konning o'z kunlari bo'lsa (agent marshruti) — umumiysidan ustun.
 *
 * Toshkent vaqti (UTC+5, yozgi vaqt yo'q). Server nusxasi:
 * api/_lib/delivery-date.ts (bir xil bo'lishi shart).
 */
export type DeliveryRule = { cutoff: string; days: number[] }

export const DEFAULT_RULE: DeliveryRule = { cutoff: '17:00', days: [1, 2, 3, 4, 5, 6] }

const TASHKENT_MS = 5 * 3_600_000

export function readDays(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
}

export function readCutoff(value: unknown): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim())
  if (!match) return DEFAULT_RULE.cutoff
  const h = Math.min(23, Number(match[1]))
  const m = Math.min(59, Number(match[2]))
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Umumiy qoida + do'kon kunlari → amaldagi qoida. */
export function ruleFor(settings: { cutoff?: unknown; days?: unknown } | null | undefined, shopDays?: unknown): DeliveryRule {
  const own = readDays(shopDays)
  const common = readDays(settings?.days)
  return {
    cutoff: readCutoff(settings?.cutoff),
    days: own.length ? own : common.length ? common : DEFAULT_RULE.days,
  }
}

/** Eng yaqin yetkazish sanasi: «2026-10-07». */
export function deliveryDate(rule: DeliveryRule, now = Date.now()): string {
  const local = new Date(now + TASHKENT_MS)
  const [h, m] = rule.cutoff.split(':').map(Number)
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes()
  // Oxirgi vaqtgacha — ertaga, keyin — indiniga
  const day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()))
  day.setUTCDate(day.getUTCDate() + (minutes < h * 60 + m ? 1 : 2))
  const days = rule.days.length ? rule.days : DEFAULT_RULE.days
  for (let i = 0; i < 7 && !days.includes(day.getUTCDay()); i++) day.setUTCDate(day.getUTCDate() + 1)
  return day.toISOString().slice(0, 10)
}
