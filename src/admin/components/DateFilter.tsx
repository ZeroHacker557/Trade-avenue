import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { dayKey, type Range } from '../lib/date-range'

const PRESETS: { key: Range; label: string }[] = [
  { key: 'today', label: 'Bugun' },
  { key: 'week', label: '7 kun' },
  { key: 'month', label: '30 kun' },
  { key: 'all', label: 'Hammasi' },
]

const WEEKDAYS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya']
const MONTHS = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
]

type Props = {
  value: Range
  onChange: (range: Range) => void
  /** Sana kaliti → o'sha kundagi buyurtmalar soni. */
  counts: Map<string, number>
}

/**
 * Buyurtmalarni kun bo'yicha ko'rish.
 *
 * Tayyor oraliqlar (bugun / 7 kun / 30 kun / hammasi) va taqvim.
 * Taqvimda har kunning tagida o'sha kundagi buyurtmalar soni turadi —
 * shunda qaysi kunlar sermahsul bo'lgani bir qarashda ko'rinadi.
 */
export function DateFilter({ value, onChange, counts }: Props) {
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => {
    const d = new Date()
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    return d
  })

  const days = useMemo(() => {
    const first = new Date(month)
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    // Dushanbadan boshlanadigan hafta
    const offset = (first.getDay() + 6) % 7

    const cells: (Date | null)[] = Array.from({ length: offset }, () => null)
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(new Date(month.getFullYear(), month.getMonth(), d))
    }
    return cells
  }, [month])

  const today = dayKey(new Date())
  const shiftMonth = (step: number) => {
    const next = new Date(month)
    next.setMonth(next.getMonth() + step)
    setMonth(next)
  }

  const customLabel = value.includes('-')
    ? new Date(value).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
    : null

  return (
    <div>
      <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
        {PRESETS.map((preset) => (
          <button
            key={preset.key}
            onClick={() => onChange(preset.key)}
            className="shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-bold transition active:scale-95"
            style={{
              borderColor: value === preset.key ? 'var(--brand-line)' : 'var(--line)',
              background: value === preset.key ? 'var(--brand-soft)' : 'var(--surface)',
              color: value === preset.key ? 'var(--brand-strong)' : 'var(--muted)',
            }}
          >
            {preset.label}
          </button>
        ))}

        <button
          onClick={() => setOpen((v) => !v)}
          className="flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-bold transition active:scale-95"
          style={{
            borderColor: customLabel ? 'var(--brand-line)' : 'var(--line)',
            background: customLabel ? 'var(--brand-soft)' : 'var(--surface)',
            color: customLabel ? 'var(--brand-strong)' : 'var(--muted)',
          }}
        >
          <CalendarDays size={15} />
          {customLabel || 'Sana'}
        </button>
      </div>

      {open && (
        <div className="adm-card mt-2 p-3" style={{ animation: 'admFade 0.2s ease' }}>
          <div className="flex items-center justify-between">
            <button
              className="grid size-8 place-items-center rounded-lg"
              style={{ background: 'var(--surface-2)' }}
              onClick={() => shiftMonth(-1)}
              aria-label="Oldingi oy"
            >
              <ChevronLeft size={16} />
            </button>
            <b className="text-sm">
              {MONTHS[month.getMonth()]} {month.getFullYear()}
            </b>
            <button
              className="grid size-8 place-items-center rounded-lg"
              style={{ background: 'var(--surface-2)' }}
              onClick={() => shiftMonth(1)}
              aria-label="Keyingi oy"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1">
            {WEEKDAYS.map((day) => (
              <span
                key={day}
                className="py-1 text-center text-[0.65rem] font-bold uppercase"
                style={{ color: 'var(--faint)' }}
              >
                {day}
              </span>
            ))}

            {days.map((date, i) => {
              if (!date) return <span key={`empty-${i}`} />
              const key = dayKey(date)
              const count = counts.get(key) || 0
              const selected = value === key
              return (
                <button
                  key={key}
                  onClick={() => {
                    onChange(key)
                    setOpen(false)
                  }}
                  className="flex flex-col items-center rounded-lg py-1 transition active:scale-90"
                  style={{
                    background: selected ? 'var(--brand)' : count ? 'var(--brand-soft)' : 'transparent',
                    color: selected ? 'var(--brand-ink)' : 'var(--ink)',
                    outline: key === today && !selected ? '1.5px solid var(--brand-line)' : 'none',
                  }}
                >
                  <span className="text-sm font-bold leading-tight">{date.getDate()}</span>
                  {/* Kun tagidagi son — o'sha kundagi buyurtmalar */}
                  <span
                    className="text-[0.6rem] font-extrabold leading-tight"
                    style={{
                      color: selected
                        ? 'var(--brand-ink)'
                        : count
                          ? 'var(--brand)'
                          : 'transparent',
                    }}
                  >
                    {count || '·'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
