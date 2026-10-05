import { Bike, Check, CreditCard, Package, Wallet } from 'lucide-react'
import { datedNumber } from '../utils/order-label'
import { useState } from 'react'
import { formatPrice } from '../data'
import { BRAND } from '../config/brand'
import { BrandLogo } from '../components/brand/BrandLogo'
import { formatDateTime } from '../utils/date'
import { useI18n, type TranslationKey } from '../i18n'
import type { CourierOrder } from './api'
import { bundleText } from '../utils/bundle'
import { isCashPayment } from '../utils/payment'

/**
 * Yetkazilgan buyurtmaning cheki — kuryer tarixidan ochiladi.
 *
 * Mijozning chekidagi (src/pages/ReceiptPage.tsx) `.rcpt` ko'rinishi:
 * kuryer va mijoz bir xil hujjatni ko'radi. Qo'shimcha — kim va qachon
 * yetkazgani.
 */
export function CourierReceipt({ order }: { order: CourierOrder }) {
  const { t } = useI18n()
  const subtotal = order.subtotal || order.items.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const card = !isCashPayment(order.paymentMethod)
  const paid = !card || order.paymentStatus === 'Tolangan'
  const payStatus = card
    ? t(`payStatus.${order.paymentStatus ?? 'Kutilmoqda'}` as TranslationKey)
    : t('payStatus.Naqd')

  return (
    <article className="rcpt crr-receipt">
      <div className="rcpt__brand">
        <BrandLogo size={46} markOnly />
        <p className="rcpt__tagline">{BRAND.tagline}</p>
      </div>

      <div className="rcpt__body">
        <div className="rcpt__head">
          <div className="min-w-0">
            <h2 className="rcpt__name">{t('receipt.title')}</h2>
            <p className="rcpt__no">{datedNumber(order.number, order.orderDay, order.createdAt)}</p>
            <p className="rcpt__date">{formatDateTime(order.createdAt || undefined)}</p>
          </div>
          <div className="rcpt__state">
            <span className="rcpt__state-badge">
              <Check size={16} strokeWidth={3} />
              {t('courier.statusDone')}
            </span>
            <p className="rcpt__state-note">{t('receipt.stateDone')}</p>
          </div>
        </div>

        <div className="rcpt__items">
          <div className="rcpt__items-head">
            <span>{t('receipt.product')}</span>
            <span>{t('receipt.sum')}</span>
          </div>
          {order.items.map((item, i) => (
            <div key={i} className="rcpt__item">
              <ReceiptThumb src={item.image} />
              <div className="min-w-0">
                <p className="rcpt__item-name">{item.name || '—'}</p>
                <p className="rcpt__item-meta">
                  {item.size ? `${item.size} · ` : ''}
                  {t('orders.itemCount', { count: item.quantity })} × {formatPrice(item.price)}
                </p>
                {!!item.bundle?.length && <p className="set-lines">{t('receipt.setIncludes')} {bundleText(item.bundle)}</p>}
              </div>
              <b className="rcpt__item-sum">{formatPrice(item.price * item.quantity)}</b>
            </div>
          ))}
        </div>

        <div className="rcpt__totals">
          <div>
            <span>{t('receipt.subtotal')}</span>
            <b>{formatPrice(subtotal)}</b>
          </div>
          {!!order.deliveryFee && (
            <div>
              <span>{t('receipt.delivery')}</span>
              <b>{formatPrice(order.deliveryFee)}</b>
            </div>
          )}
          {!!order.discount && (
            <div className="is-discount">
              <span>{t('receipt.discount')}{order.promoCode ? ` · ${order.promoCode}` : ''}</span>
              <b>−{formatPrice(order.discount)}</b>
            </div>
          )}
        </div>

        <div className="rcpt__grand">
          <span>{t('receipt.total')}</span>
          <b>{formatPrice(order.total)}</b>
        </div>

        <div className="rcpt__pay">
          <span className="rcpt__pay-icon">{card ? <CreditCard size={20} /> : <Wallet size={20} />}</span>
          <div className="min-w-0 flex-1">
            <p className="rcpt__pay-label">{t('receipt.payMethod')}</p>
            <p className="rcpt__pay-value">{order.paymentMethod || 'Naqd'}</p>
          </div>
          <div className="rcpt__pay-divider" aria-hidden="true" />
          <div className="min-w-0 text-right">
            <p className="rcpt__pay-label">{t('receipt.payStatus')}</p>
            <p className={'rcpt__pay-value ' + (paid ? 'is-paid' : 'is-waiting')}>{payStatus}</p>
          </div>
        </div>

        {/* Kim va qachon yetkazdi */}
        <div className="rcpt__pay">
          <span className="rcpt__pay-icon"><Bike size={20} /></span>
          <div className="min-w-0 flex-1">
            <p className="rcpt__pay-label">{t('courier.deliveredBy')}</p>
            <p className="rcpt__pay-value">{order.courierName || '—'}</p>
          </div>
          <div className="rcpt__pay-divider" aria-hidden="true" />
          <div className="min-w-0 text-right">
            <p className="rcpt__pay-label">{t('courier.statusDone')}</p>
            <p className="rcpt__pay-value is-paid">{formatDateTime(order.deliveredAt || undefined)}</p>
          </div>
        </div>
      </div>
    </article>
  )
}

function ReceiptThumb({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <span className="rcpt__thumb grid place-items-center" style={{ color: 'var(--faint)' }}>
        <Package size={20} />
      </span>
    )
  }
  return <img className="rcpt__thumb" src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
}
