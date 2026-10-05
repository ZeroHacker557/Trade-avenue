import { BadgePercent, TrendingUp } from 'lucide-react'
import { formatPrice } from '../../data'
import { useT } from '../../i18n'
import { promoPrice } from '../../utils/promotions'
import { readTiers } from '../../utils/tiers'
import type { Product } from '../../types/domain'
import { profitOf } from '../../utils/profit'

/**
 * Mahsulot sahifasi: miqdor chegirmasi pog'onalari va tavsiya narx/foyda.
 * Hech biri bo'lmasa — hech narsa chizilmaydi.
 */
export function WholesaleInfo({ product }: { product: Product }) {
  const t = useT()
  const tiers = readTiers(product.tiers)
  const profit = profitOf(product)
  if (!tiers.length && !product.retailPrice) return null

  const unit = product.pack ? t('product.unitPack') : t('product.unitPiece')
  // Pog'ona narxi aksiyagacha bo'lgan narxdan hisoblanadi (server bilan bir xil)
  const base = product.promotion ? product.oldPrice ?? product.price : product.price

  return (
    <section className="wholesale">
      {tiers.length > 0 && (
        <div>
          <p className="wholesale__title"><BadgePercent size={16} /> {t('product.tiersTitle')}</p>
          <ul className="wholesale__tiers">
            {tiers.map((tier) => (
              <li key={tier.min}>
                <span>{t('product.tierRow', { min: tier.min, unit })}</span>
                <b>{formatPrice(promoPrice(base, tier.percent))}</b>
                <em>−{tier.percent}%</em>
              </li>
            ))}
          </ul>
        </div>
      )}
      {product.retailPrice ? (
        <div className="wholesale__retail">
          <TrendingUp size={16} className="shrink-0" />
          <span className="min-w-0">
            <span className="block text-xs" style={{ color: 'var(--muted)' }}>{t('product.retail')}</span>
            <b className="block text-sm" style={{ color: 'var(--ink)' }}>{t('product.retailPer', { price: formatPrice(product.retailPrice) })}</b>
            {profit && (
              <span className="block text-xs font-bold" style={{ color: 'var(--success)' }}>
                {t('product.profit', { amount: formatPrice(profit.amount), percent: profit.percent })}
              </span>
            )}
          </span>
        </div>
      ) : null}
    </section>
  )
}
