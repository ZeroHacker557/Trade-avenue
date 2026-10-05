import { Check, ChevronLeft, CreditCard, Home, RotateCcw, Wallet } from 'lucide-react'
import { datedNumber } from '../utils/order-label'
import { formatPrice } from '../data'
import { BRAND } from '../config/brand'
import { productThumb } from '../utils/product-image'
import { formatDateTime, formatTime } from '../utils/date'
import { BrandLogo } from '../components/brand/BrandLogo'
import { PageTitle } from '../components/layout/PageTitle'
import { useT, type TranslationKey } from '../i18n'
import type { Order } from '../types/domain'
import { bundleText } from '../utils/bundle'
import { isCashPayment } from '../utils/payment'

type Props = {
  order: Order
  onBack: () => void
  onHome: () => void
  onReorder: (order: Order) => void
}

/** Holat chizig'i — bekor qilinmagan buyurtma qaysi bosqichda. */
const STEPS: { status: Order['status']; label: TranslationKey }[] = [
  { status: 'Yangi', label: 'receipt.stepNew' },
  { status: 'Qabul qilindi', label: 'receipt.stepAccepted' },
  { status: 'Yetkazilmoqda', label: 'receipt.stepOnWay' },
  { status: 'Yetkazildi', label: 'receipt.stepDone' },
]

/** Bosqich vaqti — bilinadiganlari (yaratilgan, olingan, yetkazilgan). */
function stepTime(order: Order, index: number): string {
  const at = index === 0 ? order.createdAt : index === 2 ? order.takenAt : index === 3 ? order.deliveredAt : null
  return at ? formatTime(at) : ''
}

/**
 * Mijozning cheki.
 *
 * «Buyurtmalarim» dagi kartochka bosilganda ochiladi: buyurtmadagi hamma
 * narsa bitta sahifada — mahsulotlar, hisob-kitob va to'lov.
 * Chop etish uchun emas, telefonda ko'rish uchun: kerak bo'lsa mijoz
 * skrinshot olib yuboradi.
 */
export function ReceiptPage({ order, onBack, onHome, onReorder }: Props) {
  const t = useT()

  const lines = order.products || []
  const subtotal = order.subtotal ?? lines.reduce((sum, l) => sum + (l.product?.price || 0) * (l.quantity || 0), 0)
  const paid = isCashPayment(order.paymentMethod) || order.paymentStatus === 'Tolangan'
  const delivered = order.status === 'Yetkazildi'
  const cancelled = order.status === 'Bekor qilingan' || order.status === 'Rad etildi'

  const payStatus = !isCashPayment(order.paymentMethod)
    ? t(`payStatus.${order.paymentStatus ?? 'Kutilmoqda'}` as TranslationKey)
    : t('payStatus.Naqd')

  return (
    <>
      <header className="page-head page-head--solo flex items-center gap-3 px-5 pt-8 sm:px-10">
        <button onClick={onBack} className="back-button" aria-label={t('common.back')}>
          <ChevronLeft size={22} />
        </button>
        <PageTitle className="text-2xl font-extrabold">{t('receipt.title')}</PageTitle>
      </header>

      <div className="px-4 pb-32 pt-4 sm:px-10 page-animate">
        <article className="rcpt">
          {/* Brend chizig'i */}
          <div className="rcpt__brand">
            <BrandLogo size={54} markOnly />
            <p className="rcpt__tagline">{BRAND.tagline}</p>
          </div>

          <div className="rcpt__body">
            {/* Sarlavha va holat */}
            <div className="rcpt__head">
              <div className="min-w-0">
                <h2 className="rcpt__name">{t('receipt.title')}</h2>
                <p className="rcpt__no">{datedNumber(order.orderNumber, order.orderDay, order.createdAt)}</p>
                <p className="rcpt__date">{formatDateTime(order.createdAt) || order.date}</p>
              </div>
              <div className={'rcpt__state ' + (cancelled ? 'is-off' : '')}>
                <span className="rcpt__state-badge">
                  <Check size={16} strokeWidth={3} />
                  {t(`status.${order.status}` as TranslationKey)}
                </span>
                <p className="rcpt__state-note">
                  {cancelled ? t('receipt.stateCancelled') : delivered ? t('receipt.stateDone') : t('receipt.stateActive')}
                </p>
              </div>
            </div>

            {/* Holat chizig'i — ixcham: 4 nuqta va chiziq, joriy bosqich lipillaydi */}
            {!cancelled && (() => {
              const current = Math.max(0, STEPS.findIndex((s) => s.status === order.status))
              return (
                <ol className="rcpt-steps" style={{ ['--p' as string]: String(delivered ? 1 : current / (STEPS.length - 1)) }}>
                  {STEPS.map((step, i) => (
                    <li
                      key={step.status}
                      className={'rcpt-steps__item ' + (i < current || delivered ? 'is-done' : i === current ? 'is-now' : '')}
                    >
                      <span className="rcpt-steps__dot">{(i < current || delivered) && <Check size={10} strokeWidth={4} />}</span>
                      <span className="rcpt-steps__label">{t(step.label)}</span>
                      <span className="rcpt-steps__time">{stepTime(order, i)}</span>
                    </li>
                  ))}
                </ol>
              )
            })()}

            {/* Mahsulotlar */}
            <div className="rcpt__items">
              <div className="rcpt__items-head">
                <span>{t('receipt.product')}</span>
                <span>{t('receipt.sum')}</span>
              </div>
              {lines.map((line, i) => {
                const price = line.product?.price || 0
                const qty = line.quantity || 0
                return (
                  <div key={line.cartKey ?? i} className="rcpt__item">
                    <img
                      className="rcpt__thumb"
                      src={productThumb(line.product)}
                      alt=""
                      loading="lazy"
                    />
                    <div className="min-w-0">
                      <p className="rcpt__item-name">{line.product?.name || '—'}</p>
                      <p className="rcpt__item-meta">
                        {[line.size, line.color].filter(Boolean).join(' · ')}
                        {(line.size || line.color) && ' · '}
                        {t('orders.itemCount', { count: qty })} × {formatPrice(price)}
                      </p>
                      {!!line.product?.bundle?.length && (
                        <p className="set-lines">{t('receipt.setIncludes')} {bundleText(line.product.bundle)}</p>
                      )}
                    </div>
                    <b className="rcpt__item-sum">{formatPrice(price * qty)}</b>
                  </div>
                )
              })}
            </div>

            {/* Hisob-kitob */}
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

            {/* To'lov */}
            <div className="rcpt__pay">
              <span className="rcpt__pay-icon">
                {order.paymentMethod === 'Karta' ? <CreditCard size={20} /> : <Wallet size={20} />}
              </span>
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

            {/* Buyurtma raqami va minnatdorchilik */}
            <div className="rcpt__foot">
              <div className="rcpt__foot-left">
                <div className="min-w-0">
                  <p className="rcpt__pay-label">{t('receipt.orderId')}</p>
                  <p className="rcpt__id">{datedNumber(order.orderNumber, order.orderDay, order.createdAt).replace(/^#/, '')}</p>
                  <p className="rcpt__note">{t('receipt.note')}</p>
                </div>
              </div>
              <div className="rcpt__thanks">
                <p className="rcpt__thanks-text">{t('receipt.thanks')}</p>
                <span className="rcpt__thanks-line" aria-hidden="true" />
                <p className="rcpt__thanks-brand">{BRAND.name} — {BRAND.tagline}</p>
              </div>
            </div>
          </div>
        </article>

        <button onClick={onHome} className="btn-primary rcpt__home mt-4 w-full py-4">
          <Home size={18} />
          {t('receipt.home')}
        </button>
        {(delivered || cancelled) && (
          <button onClick={() => onReorder(order)} className="reorder-link mx-auto mt-3">
            <RotateCcw size={14} /> {t('orders.reorder')}
          </button>
        )}
      </div>
    </>
  )
}
