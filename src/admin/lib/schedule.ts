import { useEffect, useState } from 'react'
import { apiPost } from './api'
import type { ScheduledRow } from '../components/ComposerTools'

/** `datetime-local` qiymati (mahalliy vaqt). */
export function localInput(ms: number): string {
  const d = new Date(ms)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`
}

export function useScheduled(onError: (message: string) => void) {
  const [rows, setRows] = useState<ScheduledRow[]>([])
  const reload = () =>
    apiPost<{ scheduled: ScheduledRow[] }>('action', { action: 'schedule.list' })
      .then((r) => setRows(r.scheduled))
      .catch((e: unknown) => onError(e instanceof Error ? e.message : 'Rejalar yuklanmadi'))
  // Birinchi yuklash — javob kelganda holat yoziladi
  useEffect(() => {
    let alive = true
    apiPost<{ scheduled: ScheduledRow[] }>('action', { action: 'schedule.list' })
      .then((r) => { if (alive) setRows(r.scheduled) })
      .catch(() => undefined)
    return () => { alive = false }
  }, [])
  return { rows, setRows, reload }
}

/** «Hozir» — har 30 soniyada yangilanadi. */
export function useNow(step = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), step)
    return () => window.clearInterval(timer)
  }, [step])
  return now
}
