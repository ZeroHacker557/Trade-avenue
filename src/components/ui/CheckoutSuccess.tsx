import { ShoppingBag } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useT } from '../../i18n'
import { snowBurst } from '../../utils/burst'

type Props = {
  /** «Buyurtmalarim» — oyna shu zahoti yopiladi va sahifa ochiladi. */
  onViewOrders: () => void
  /** Fon bosilganda — faqat yopiladi. */
  onClose: () => void
}

/**
 * «Buyurtma qabul qilindi» — bayram: ✓ belgisi aylana bilan chizilib
 * paydo bo'ladi, atrofga muz kristallari sochiladi (brend: muzlatilgan
 * mahsulot). Tugma bosilishi bilan oyna darhol yo'qoladi — kutish yo'q.
 */
export function CheckoutSuccess({ onViewOrders, onClose }: Props) {
  const t = useT()
  const badge = useRef<HTMLSpanElement>(null)

  // Belgi chizilib bo'lgach — sochilish
  useEffect(() => {
    const timer = setTimeout(() => snowBurst(badge.current), 420)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="checkout-success-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="checkout-success-card" onClick={(e) => e.stopPropagation()}>
        <span ref={badge} className="cs-badge" aria-hidden="true">
          <svg viewBox="0 0 52 52" width="84" height="84">
            <circle className="cs-badge__ring" cx="26" cy="26" r="23" />
            <path className="cs-badge__check" d="M15 27.5l7.2 7.2L37.5 19" />
          </svg>
        </span>
        <h2 className="cs-title mt-6 text-2xl font-extrabold" style={{ color: 'var(--ink)' }}>
          {t('checkout.successTitle')}
        </h2>
        <p className="cs-text mt-3 text-sm" style={{ color: 'var(--muted)' }}>
          {t('checkout.successText')}
        </p>
        <button onClick={onViewOrders} className="cs-cta btn-primary mt-7 w-full py-4">
          <ShoppingBag size={20} />
          {t('checkout.viewOrders')}
        </button>
      </div>
    </div>
  )
}
