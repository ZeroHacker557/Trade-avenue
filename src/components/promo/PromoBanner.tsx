import { BadgePercent } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useT } from '../../i18n'
import type { Promotion } from '../../utils/promotions'

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Bosh sahifadagi aksiya banneri.
 *
 * To'q ko'k fon, chapda aksiya belgisi va taymer, o'ngda qiya amber
 * chegirma yorlig'i. Taymer soniyalab sanaydi — «ulgurib qolish kerak» hissi.
 *
 * Balandligi oldingi banner bilan bir xil: ostidagi bo'limlarni itarmaydi.
 * Bosilganda aksiya tegishli kategoriya (yoki katalog) ochiladi.
 */
export function PromoBanner({ promotion, onOpen }: { promotion: Promotion; onOpen: () => void }) {
  const t = useT()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const left = Math.max(0, Math.floor((Date.parse(promotion.endsAt) - now) / 1000))
  const days = Math.floor(left / 86400)
  const clock = [Math.floor((left % 86400) / 3600), Math.floor((left % 3600) / 60), left % 60].map(pad)

  return (
    <button className="promo-deal" onClick={onOpen} aria-label={`${promotion.title}, −${promotion.percent}%`}>
      <span className="promo-deal__icon" aria-hidden="true"><BadgePercent size={22} /></span>

      <span className="promo-deal__body">
        <span className="promo-deal__label">{t('promo.banner')} · {t('promo.leftLabel')}</span>
        <span className="promo-deal__clock" aria-live="off">
          {days > 0 && <span className="promo-deal__days">{t('promo.daysShort', { d: days })}</span>}
          {clock.map((part, i) => (
            <span key={i} className="promo-deal__unit">
              {i > 0 && <i aria-hidden="true">:</i>}
              <b>{part}</b>
            </span>
          ))}
        </span>
        <span className="promo-deal__title">{promotion.title}</span>
      </span>

      <span className="promo-deal__tag">
        <span>−{promotion.percent}%</span>
      </span>
    </button>
  )
}
