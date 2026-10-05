import { useEffect, useState } from 'react'
import { useT } from '../i18n'

/** «2 kun 5 soat» / «3 soat 12 daqiqa» / «45 daqiqa» — joriy tilda. */
export function useTimeLeft(endsAt: string) {
  const t = useT()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const left = Math.max(0, Date.parse(endsAt) - now)
  const minutes = Math.floor(left / 60_000)
  const d = Math.floor(minutes / 1440)
  const h = Math.floor((minutes % 1440) / 60)
  const m = minutes % 60
  if (d > 0) return t('promo.days', { d, h })
  if (h > 0) return t('promo.hours', { h, m })
  return t('promo.minutes', { m: Math.max(1, m) })
}
