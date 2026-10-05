/**
 * Miqdor chegirmasi: «10 qutidan — 3%, 30 qutidan — 5%».
 *
 * `min` — savatdagi miqdor (sotiladigan birlikda: o'ramli mahsulotda quti).
 * Aksiya bilan qo'shilmaydi — ikkisidan kattasi olinadi.
 * Server nusxasi: api/_lib/tiers.ts (bir xil bo'lishi shart).
 */
export type Tier = { min: number; percent: number }

const MAX_TIERS = 5

/** Admin yuborgan pog'onalarni tozalaydi: min ≥ 2, 0 < foiz ≤ 50, min bo'yicha o'sib boradi. */
export function readTiers(value: unknown): Tier[] {
  if (!Array.isArray(value)) return []
  const byMin = new Map<number, number>()
  for (const raw of value) {
    const min = Math.floor(Number((raw as { min?: unknown })?.min))
    const percent = Math.round(Number((raw as { percent?: unknown })?.percent) * 10) / 10
    if (!Number.isFinite(min) || min < 2 || min > 100_000) continue
    if (!Number.isFinite(percent) || percent <= 0 || percent > 50) continue
    byMin.set(min, Math.max(byMin.get(min) ?? 0, percent))
  }
  return [...byMin.entries()]
    .map(([min, percent]) => ({ min, percent }))
    .sort((a, b) => a.min - b.min)
    .slice(0, MAX_TIERS)
}

/** Shu miqdorga to'g'ri keladigan eng katta chegirma foizi (yo'q bo'lsa 0). */
export function tierPercent(tiers: unknown, quantity: number): number {
  return readTiers(tiers).reduce((best, tier) => (quantity >= tier.min ? Math.max(best, tier.percent) : best), 0)
}
