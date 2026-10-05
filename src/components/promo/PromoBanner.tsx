import { Snowflake } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useT } from '../../i18n'
import type { Promotion } from '../../utils/promotions'

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Bosh sahifadagi aksiya banneri — «Muzli» uslub.
 *
 * To'q yashil muzli fon, chetida qirov naqshi va qor parchalari, o'ngda
 * qiya turgan sariq narx yorlig'i. Ochilish animatsiyasi bilan bir
 * uslubda. Taymer soniyalab sanaydi — «ulgurib qolish kerak» hissi.
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
    <button className="promo-ice" onClick={onOpen} aria-label={`${promotion.title}, −${promotion.percent}%`}>
      {/* Chetdagi qirov va qor parchalari — bezak */}
      <svg className="promo-ice__frost" viewBox="0 0 120 76" aria-hidden="true" preserveAspectRatio="xMaxYMid slice">
        <g fill="none" stroke="currentColor" strokeLinecap="round">
          <path d="M120 6 L86 22 M104 13 l-4 -9 M104 13 l2 10 M94 18 l-5 -7 M94 18 l1 8" strokeWidth="1.1" />
          <path d="M120 70 L90 56 M106 63 l-2 9 M106 63 l-6 -7 M97 59 l-5 6 M97 59 l0 -8" strokeWidth="1.1" />
          <path d="M120 38 L100 38 M110 38 l-5 -6 M110 38 l-5 6" strokeWidth="0.9" />
        </g>
      </svg>
      <Snowflake className="promo-ice__flake promo-ice__flake--a" size={13} aria-hidden="true" />
      <Snowflake className="promo-ice__flake promo-ice__flake--b" size={9} aria-hidden="true" />

      <span className="promo-ice__body">
        <span className="promo-ice__label">{t('promo.banner')} · {t('promo.leftLabel')}</span>
        <span className="promo-ice__clock" aria-live="off">
          {days > 0 && <span className="promo-ice__days">{t('promo.daysShort', { d: days })}</span>}
          {clock.map((part, i) => (
            <span key={i} className="promo-ice__unit">
              {i > 0 && <i aria-hidden="true">:</i>}
              <b>{part}</b>
            </span>
          ))}
        </span>
        <span className="promo-ice__title">{promotion.title}</span>
      </span>

      <span className="promo-ice__tag">
        <span>−{promotion.percent}%</span>
      </span>
    </button>
  )
}
