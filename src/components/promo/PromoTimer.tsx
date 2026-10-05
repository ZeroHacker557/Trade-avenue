import { Timer } from 'lucide-react'
import { useTimeLeft } from '../../hooks/use-time-left'
import { useT } from '../../i18n'

/** Mahsulot sahifasidagi «Tugashiga 3 soat 12 daqiqa» belgisi. */
export function PromoTimer({ endsAt }: { endsAt: string }) {
  const t = useT()
  const time = useTimeLeft(endsAt)
  return (
    <span className="promo-timer">
      <Timer size={14} /> {t('promo.endsIn', { time })}
    </span>
  )
}
