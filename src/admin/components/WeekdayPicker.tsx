/** Dushanbadan yakshanbagacha (0 — yakshanba, JS Date bilan bir xil). */
const DAYS: { id: number; label: string }[] = [
  { id: 1, label: 'Du' },
  { id: 2, label: 'Se' },
  { id: 3, label: 'Ch' },
  { id: 4, label: 'Pa' },
  { id: 5, label: 'Ju' },
  { id: 6, label: 'Sh' },
  { id: 0, label: 'Ya' },
]

/** Yetkazish kunlari — sozlamalar va do'kon formasida. */
export function WeekdayPicker({ value, onChange }: { value: number[]; onChange: (days: number[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {DAYS.map((day) => {
        const on = value.includes(day.id)
        return (
          <button
            key={day.id}
            type="button"
            className={'adm-chip ' + (on ? 'active' : '')}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((d) => d !== day.id) : [...value, day.id])}
          >
            {day.label}
          </button>
        )
      })}
    </div>
  )
}
