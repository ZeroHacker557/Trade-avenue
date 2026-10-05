import { useEffect, useRef, useState } from 'react'
import { productThumb } from '../utils/product-image'
import {
  ArrowLeft, Banknote, Check, Copy, CreditCard, Loader2, MapPin,
  MessageSquare, Phone, Send, ShoppingBag, Store, Tag, User, UserRound,
} from 'lucide-react'
import { formatPrice } from '../data'
import { hapticFeedback } from '../utils/telegram'
import { getPaymentSettings, getDeliverySettings } from '../lib/firebase'
import { apiErrorText } from '../utils/api-error'
import { apiPost } from '../lib/api'
import { useI18n } from '../i18n'
import { deliveryDate, ruleFor } from '../utils/delivery-date'
import { formatDeliveryDay, formatWeekdays } from '../utils/date'
import type { DeliverySettings, OrderForm, PaymentSettings, Product, Shop, UserProfile } from '../types/domain'
import { PageTitle } from '../components/layout/PageTitle'
import { ReceiptSheet, type ReceiptUpload } from '../components/checkout/ReceiptSheet'

type AppliedPromo = {
  code: string
  discountPercent: number
  discount: number
  total: number
}

type Props = {
  profile: UserProfile | null
  cartProducts: { product: Product; quantity: number; size?: string; color?: string; cartKey: string }[]
  cartTotal: number
  orderForm: OrderForm
  onUpdateForm: (field: keyof OrderForm, value: unknown) => void
  /** Karta (o'tkazma) bilan to'lovda — chek rasmi. */
  onSubmit: (receipt?: ReceiptUpload) => Promise<boolean>
  isSubmitting: boolean
  onBack: () => void
  /** Faol do'kon — buyurtma shu nomidan, shu manzilga. */
  shop: Shop
}

export function CheckoutPage({
  cartProducts, cartTotal, orderForm, onUpdateForm, onSubmit, isSubmitting, onBack, profile, shop,
}: Props) {
  const { t, lang } = useI18n()
  /* Qabul qiluvchi boshqa odammi — qo'shimcha maydonlar shunga qarab ochiladi */
  const [otherRecipient, setOtherRecipient] = useState(
    Boolean(orderForm.recipientName || orderForm.recipientPhone),
  )
  const [promoInput, setPromoInput] = useState('')
  const [promoLoading, setPromoLoading] = useState(false)
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>(null)
  const [promoError, setPromoError] = useState('')
  const [payment, setPayment] = useState<PaymentSettings | null>(null)
  const [delivery, setDelivery] = useState<DeliverySettings | null>(null)

  useEffect(() => {
    let alive = true
    getPaymentSettings().then((s) => alive && setPayment(s))
    getDeliverySettings().then((s) => alive && setDelivery(s))
    return () => { alive = false }
  }, [])

  // Profil ma'lumotlari bilan avtomatik to'ldirish.
  // Render paytida emas, effekt ichida — aks holda React ogohlantiradi (F-11).
  useEffect(() => {
    if (!profile) return
    if (!orderForm.name && profile.first_name) {
      onUpdateForm('name', `${profile.first_name}${profile.last_name ? ' ' + profile.last_name : ''}`)
    }
    if (!orderForm.phone && profile.phone) {
      onUpdateForm('phone', profile.phone)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  const discount = appliedPromo?.discount ?? 0
  const discountedSubtotal = Math.max(cartTotal - discount, 0)
  const deliveryFee =
    delivery === null || (delivery.freeFrom > 0 && discountedSubtotal >= delivery.freeFrom)
      ? 0
      : delivery.fee
  const finalTotal = discountedSubtotal + deliveryFee

  /*
   * Minimal summa — mahsulotlar summasi bo'yicha (yetkazish va promokod
   * chegirmasisiz). Sozlanmagan bo'lsa 0 keladi va cheklov ishlamaydi.
   */
  const minOrder = delivery?.minOrder ?? 0
  const belowMin = minOrder > 0 && cartTotal < minOrder

  const handleApplyPromo = async () => {
    const code = promoInput.trim().toUpperCase()
    if (!code) return
    setPromoLoading(true)
    setPromoError('')
    try {
      const result = await apiPost<AppliedPromo>('/api/promo', { code, subtotal: cartTotal })
      setAppliedPromo(result)
      onUpdateForm('promoCode', result.code)
    } catch (error) {
      setAppliedPromo(null)
      onUpdateForm('promoCode', undefined)
      setPromoError(apiErrorText(error, t, 'checkout.promoFailed', formatPrice))
    } finally {
      setPromoLoading(false)
    }
  }

  const handleClearPromo = () => {
    setAppliedPromo(null)
    setPromoInput('')
    setPromoError('')
    onUpdateForm('promoCode', undefined)
  }

  /*
   * Karta (o'tkazma): kartaga pul o'tkaziladi, «Buyurtma berish» da chek
   * yuklash oynasi ochiladi — buyurtma chek bilan birga yaratiladi.
   * Karta raqami sozlanmagan bo'lsa bu usul ko'rinmaydi.
   */
  const transferOn = Boolean(payment?.cardNumber) && payment?.transfer !== false
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyCard = () => {
    if (!payment?.cardNumber) return
    void navigator.clipboard?.writeText(payment.cardNumber.replace(/\s/g, '')).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    })
  }
  // Karta sozlanmagan (yoki o'chirilgan) bo'lsa — naqdga qaytadi
  useEffect(() => {
    if (payment !== null && !transferOn && orderForm.paymentMethod === 'Karta') onUpdateForm('paymentMethod', 'Naqd')
  }, [payment, transferOn, orderForm.paymentMethod, onUpdateForm])

  // Manzil — do'konniki (server qo'yadi); formada faqat mas'ul shaxs
  const isValid = Boolean(orderForm.name.trim() && orderForm.phone.trim())
  const canSubmit = isValid && !isSubmitting && !belowMin

  /*
   * Tugma doim bosiladi: to'ldirilmagan joy bo'lsa — o'sha maydonga
   * aylantiriladi, qizil bilan belgilanadi.
   */
  type Missing = 'name' | 'phone'
  const [missing, setMissing] = useState<Missing[]>([])
  /** Har bosishda silkinish animatsiyasi qayta boshlansin. */
  const [shake, setShake] = useState(0)
  const nameRef = useRef<HTMLInputElement>(null)
  const phoneRef = useRef<HTMLInputElement>(null)
  // Maydon to'ldirilishi bilan qizil belgisi ketadi
  const stillMissing = missing.filter((key) =>
    key === 'name' ? !orderForm.name.trim()
      : !orderForm.phone.trim())

  /** To'ldirilmaganini ko'rsatadi. `true` — hammasi joyida. */
  const checkForm = (): boolean => {
    const list: Missing[] = []
    if (!orderForm.name.trim()) list.push('name')
    if (!orderForm.phone.trim()) list.push('phone')
    setMissing(list)
    if (!list.length) return true

    hapticFeedback('heavy')
    setShake((n) => n + 1)
    const first = list[0]
    const target = first === 'name' ? nameRef.current : phoneRef.current
    try {
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      if (target instanceof HTMLInputElement) target.focus({ preventScroll: true })
    } catch {
      // eski brauzer — aylantirishsiz ham qizil belgi ko'rinadi
    }
    return false
  }
  // Ikki xil nomli animatsiya almashadi — har bosishda qayta silkinadi, maydon qayta yaratilmaydi (fokus yo'qolmaydi)
  const shakeClass = shake % 2 ? ' shake-a' : ' shake-b'
  const fieldClass = (key: Missing) => 'field' + (stillMissing.includes(key) ? ' is-error' + shakeClass : '')
  const errorText = (key: Missing, text: string) =>
    stillMissing.includes(key) ? <p key={`${key}-${shake}`} className="field-error">{text}</p> : null

  return (
    <>
      <header className="page-head page-head--solo flex items-center gap-3 px-5 pt-8 sm:px-10 page-animate">
        <button onClick={onBack} className="back-button" aria-label={t('common.back')}>
          <ArrowLeft size={20} />
        </button>
        <PageTitle className="text-2xl font-extrabold">{t('checkout.title')}</PageTitle>
      </header>

      <div className="kb-safe px-5 pt-6 sm:px-10 page-animate">
        {/* Buyurtma tarkibi */}
        <section className="rounded-2xl border p-4" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
          <h3 className="flex items-center gap-2 font-bold" style={{ color: 'var(--ink)' }}>
            <ShoppingBag size={18} style={{ color: 'var(--brand)' }} />
            {t('checkout.summary', { count: cartProducts.length })}
          </h3>

          <div className="mt-3 space-y-3">
            {cartProducts.map(({ product, quantity, size, color, cartKey }) => (
              <div key={cartKey} className="flex items-center gap-3">
                <img
                  src={productThumb(product)}
                  alt={product.name}
                  loading="lazy"
                  className="size-14 shrink-0 rounded-xl border object-contain p-1"
                  style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold" style={{ color: 'var(--ink)' }}>{product.name}</p>
                  {(size || color) && (
                    <p className="mt-0.5 text-[11px] font-medium" style={{ color: 'var(--muted)' }}>
                      {size}{size && color && ' · '}{color}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
                    {quantity} × {formatPrice(product.price)}
                  </p>
                </div>
                <b className="text-sm" style={{ color: 'var(--ink)' }}>{formatPrice(product.price * quantity)}</b>
              </div>
            ))}
          </div>

          <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
            {/* Promokod */}
            <div className="mb-3 flex items-start gap-2">
              <div className="flex-1">
                <div
                  className="field h-11 py-0"
                  style={{ borderColor: appliedPromo ? 'var(--success)' : promoError ? 'var(--danger)' : 'var(--line)' }}
                >
                  <Tag size={16} style={{ color: appliedPromo ? 'var(--success)' : 'var(--faint)' }} />
                  <input
                    value={promoInput}
                    onChange={(e) => { setPromoInput(e.target.value.toUpperCase()); setPromoError(''); setAppliedPromo(null) }}
                    placeholder={t('checkout.promoPlaceholder')}
                    className="text-sm font-bold"
                    style={{ color: appliedPromo ? 'var(--success)' : 'var(--ink)' }}
                    readOnly={!!appliedPromo}
                  />
                </div>
                {promoError && (
                  <p className="mt-1 pl-1 text-[11px] font-bold" style={{ color: 'var(--danger)' }}>{promoError}</p>
                )}
                {appliedPromo && (
                  <p className="mt-1 pl-1 text-[11px] font-bold" style={{ color: 'var(--success)' }}>
                    {t('checkout.promoApplied', { percent: appliedPromo.discountPercent })}
                  </p>
                )}
              </div>
              {!appliedPromo ? (
                <button
                  onClick={handleApplyPromo}
                  disabled={!promoInput.trim() || promoLoading}
                  className="btn-primary h-11 w-24 text-sm"
                >
                  {promoLoading ? <Loader2 size={16} className="animate-spin" /> : t('checkout.promoApply')}
                </button>
              ) : (
                <button onClick={handleClearPromo} className="btn-ghost h-11 w-24 text-sm">
                  {t('checkout.promoClear')}
                </button>
              )}
            </div>

            {/* Hisob-kitob */}
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span style={{ color: 'var(--muted)' }}>{t('checkout.products')}</span>
                <span className="font-bold" style={{ color: 'var(--ink)' }}>{formatPrice(cartTotal)}</span>
              </div>

              {discount > 0 && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--muted)' }}>
                    {t('checkout.discount')} {appliedPromo ? `(${appliedPromo.discountPercent}%)` : ''}
                  </span>
                  <span className="font-bold" style={{ color: 'var(--success)' }}>-{formatPrice(discount)}</span>
                </div>
              )}

              <div className="flex justify-between">
                <span style={{ color: 'var(--muted)' }}>{t('checkout.delivery')}</span>
                {delivery === null ? (
                  <span className="skeleton h-4 w-16" />
                ) : deliveryFee === 0 ? (
                  <span className="font-bold" style={{ color: 'var(--success)' }}>{t('checkout.deliveryFree')}</span>
                ) : (
                  <span className="font-bold" style={{ color: 'var(--ink)' }}>{formatPrice(deliveryFee)}</span>
                )}
              </div>

              {/* Yetkazish sanasi — oxirgi vaqt va kunlar bo'yicha (server ham shunday hisoblaydi) */}
              {delivery !== null && (
                <div className="flex justify-between gap-3">
                  <span style={{ color: 'var(--muted)' }}>{t('checkout.deliveryDate')}</span>
                  <span className="text-right font-bold" style={{ color: 'var(--brand)' }}>
                    {formatDeliveryDay(deliveryDate(ruleFor(delivery, shop.deliveryDays)), lang)}
                  </span>
                </div>
              )}

              {belowMin && (
                <p
                  className="rounded-xl px-3 py-2 text-xs font-semibold"
                  style={{ background: 'var(--danger-soft, var(--surface))', color: 'var(--danger)' }}
                >
                  {t('checkout.minOrderLeft', { amount: formatPrice(minOrder - cartTotal) })}
                </p>
              )}

              <div className="flex items-center justify-between border-t pt-2.5" style={{ borderColor: 'var(--line)' }}>
                <span className="font-bold" style={{ color: 'var(--ink)' }}>{t('checkout.total')}</span>
                <b className="text-lg" style={{ color: 'var(--brand)' }}>{formatPrice(finalTotal)}</b>
              </div>
            </div>
          </div>
        </section>

        {/* Yetkazib berish ma'lumotlari */}
        <section className="mt-6">
          <h3 className="mb-4 font-bold" style={{ color: 'var(--ink)' }}>{t('shop.contact')}</h3>
          <div className="space-y-5">
            <div>
              <label className="field-label">
                {t('checkout.name')} <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <div className={fieldClass('name')}>
                <User size={19} className="shrink-0" style={{ color: 'var(--faint)' }} />
                <input
                  ref={nameRef}
                  value={orderForm.name}
                  onChange={(e) => onUpdateForm('name', e.target.value)}
                  placeholder={t('checkout.namePlaceholder')}
                  className="text-sm"
                />
              </div>
              {errorText('name', t('checkout.fillName'))}
            </div>

            <div>
              <label className="field-label">
                {t('checkout.phone')} <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <div className={fieldClass('phone')}>
                <Phone size={19} className="shrink-0" style={{ color: 'var(--faint)' }} />
                <input
                  ref={phoneRef}
                  value={orderForm.phone}
                  onChange={(e) => onUpdateForm('phone', e.target.value)}
                  placeholder="+998 90 123 45 67"
                  type="tel"
                  inputMode="tel"
                  className="text-sm"
                />
              </div>
              {errorText('phone', t('checkout.fillPhone'))}
            </div>

            <div>
              <label className="field-label">{t('shop.deliveryTo')}</label>
              <div className="checkout-shop">
                <span className="checkout-shop__icon"><Store size={19} /></span>
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-sm" style={{ color: 'var(--ink)' }}>{shop.name}</b>
                  <p className="mt-0.5 flex items-start gap-1 text-xs leading-snug" style={{ color: 'var(--muted)' }}>
                    <MapPin size={13} className="mt-px shrink-0" />
                    {shop.address || t('shop.noAddress')}
                  </p>
                </div>
              </div>
              {delivery !== null && (
                <p className="mt-1.5 pl-1 text-xs" style={{ color: 'var(--faint)' }}>
                  {shop.deliveryDays.length
                    ? t('checkout.routeDays', { days: formatWeekdays(shop.deliveryDays, lang) })
                    : t('checkout.cutoffHint', { time: delivery.cutoff })}
                </p>
              )}
            </div>

            {/* Buyurtmani boshqa odam oladimi */}
            <div>
              <button
                type="button"
                onClick={() => {
                  // O'chirilganda maydonlar tozalanadi — aks holda
                  // ko'rinmay turgan eski qiymat buyurtmaga tushardi
                  if (otherRecipient) {
                    onUpdateForm('recipientName', '')
                    onUpdateForm('recipientPhone', '')
                  }
                  setOtherRecipient((v) => !v)
                }}
                className="flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition"
                style={{
                  borderColor: otherRecipient ? 'var(--brand)' : 'var(--line)',
                  background: otherRecipient ? 'var(--brand-soft)' : 'var(--surface)',
                }}
              >
                <span
                  className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border-2 transition"
                  style={{
                    borderColor: otherRecipient ? 'var(--brand)' : 'var(--line)',
                    background: otherRecipient ? 'var(--brand)' : 'transparent',
                    color: 'var(--brand-ink)',
                  }}
                >
                  {otherRecipient && <Check size={13} strokeWidth={3} />}
                </span>
                <span className="min-w-0">
                  <b className="block text-sm" style={{ color: 'var(--ink)' }}>
                    {t('checkout.otherRecipient')}
                  </b>
                  <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                    {t('checkout.otherRecipientHint')}
                  </span>
                </span>
              </button>

              {otherRecipient && (
                <div className="mt-3 space-y-3" style={{ animation: 'fadeInUp 0.25s ease' }}>
                  <div className="field">
                    <UserRound size={19} className="shrink-0" style={{ color: 'var(--faint)' }} />
                    <input
                      value={orderForm.recipientName || ''}
                      onChange={(e) => onUpdateForm('recipientName', e.target.value)}
                      placeholder={t('checkout.recipientName')}
                    />
                  </div>
                  <div className="field">
                    <Phone size={19} className="shrink-0" style={{ color: 'var(--faint)' }} />
                    <input
                      type="tel"
                      inputMode="tel"
                      value={orderForm.recipientPhone || ''}
                      onChange={(e) => onUpdateForm('recipientPhone', e.target.value)}
                      placeholder={t('checkout.recipientPhone')}
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="field-label">
                {t('checkout.comment')} <span style={{ color: 'var(--faint)' }}>({t('common.optional')})</span>
              </label>
              <div className="field items-start">
                <MessageSquare size={19} className="mt-0.5 shrink-0" style={{ color: 'var(--faint)' }} />
                <textarea
                  value={orderForm.comment}
                  onChange={(e) => onUpdateForm('comment', e.target.value)}
                  placeholder={t('checkout.commentPlaceholder')}
                  rows={3}
                  className="resize-none text-sm"
                />
              </div>
            </div>
          </div>
        </section>

        {/* To'lov usuli */}
        <section className="mt-6">
          <h3 className="mb-4 font-bold" style={{ color: 'var(--ink)' }}>{t('checkout.paymentMethod')}</h3>

          {/* To'lov usullari: karta (o'tkazma, chek bilan) va naqd */}
          <div className="pay-tiles">
            {transferOn && (
              <button
                type="button"
                className={'pay-tile pay-tile--cash ' + (orderForm.paymentMethod === 'Karta' ? 'is-on' : '')}
                onClick={() => { hapticFeedback('light'); onUpdateForm('paymentMethod', 'Karta') }}
                aria-pressed={orderForm.paymentMethod === 'Karta'}
              >
                <span className="pay-tile__logo">
                  <span className="plogo plogo--cash"><CreditCard size={22} strokeWidth={2.2} /> {t('checkout.card')}</span>
                </span>
                <span className="pay-tile__name">{t('checkout.cardSub')}</span>
                {orderForm.paymentMethod === 'Karta' && (
                  <span className="pay-tile__check"><Check size={12} strokeWidth={3.2} /></span>
                )}
              </button>
            )}
            <button
              type="button"
              className={'pay-tile pay-tile--cash ' + (orderForm.paymentMethod === 'Naqd' ? 'is-on' : '')}
              onClick={() => { hapticFeedback('light'); onUpdateForm('paymentMethod', 'Naqd') }}
              aria-pressed={orderForm.paymentMethod === 'Naqd'}
            >
              <span className="pay-tile__logo">
                <span className="plogo plogo--cash"><Banknote size={22} strokeWidth={2.2} /> {t('checkout.cash')}</span>
              </span>
              <span className="pay-tile__name">{t('checkout.cashSub')}</span>
              {orderForm.paymentMethod === 'Naqd' && (
                <span className="pay-tile__check"><Check size={12} strokeWidth={3.2} /></span>
              )}
            </button>
          </div>

          {orderForm.paymentMethod === 'Karta' && payment?.cardNumber && (
            <div className="transfer-card" style={{ animation: 'fadeInUp 0.25s ease' }}>
              <p className="transfer-card__title">{t('checkout.cardDetails')}</p>
              <div className="transfer-card__row">
                <div className="min-w-0">
                  <p className="transfer-card__label">{t('checkout.cardNumber')}</p>
                  <p className="transfer-card__number">{payment.cardNumber}</p>
                  <p className="transfer-card__owner">{payment.cardOwner}</p>
                </div>
                <button
                  type="button"
                  onClick={copyCard}
                  className={'transfer-card__copy ' + (copied ? 'is-done' : '')}
                  aria-label={t('receiptSheet.copy')}
                >
                  {copied ? <Check size={18} /> : <Copy size={18} />}
                </button>
              </div>
              <p className="transfer-card__note">{t('checkout.transferNote', { amount: formatPrice(finalTotal) })}</p>
            </div>
          )}

        </section>

        <button
          onClick={async () => {
            if (isSubmitting) return
            if (!canSubmit && !checkForm()) return
            if (!canSubmit) return
            // Karta (o'tkazma) — avval chek yuklanadi, buyurtma shundan keyin
            if (orderForm.paymentMethod === 'Karta') {
              hapticFeedback('light')
              setReceiptOpen(true)
              return
            }
            await onSubmit()
          }}
          disabled={isSubmitting || belowMin}
          className="btn-primary mt-8 w-full py-4"
        >
          {isSubmitting ? (
            <><Loader2 size={20} className="animate-spin" />{t('checkout.submitting')}</>
          ) : orderForm.paymentMethod === 'Karta' ? (
            <><Send size={20} />{t('checkout.submitTransfer')}</>
          ) : (
            <><Send size={20} />{t('checkout.submit')}</>
          )}
        </button>

        {belowMin && (
          <p className="mt-3 text-center text-xs font-semibold" style={{ color: 'var(--danger)' }}>
            {t('checkout.minOrder', { amount: formatPrice(minOrder) })}
          </p>
        )}

        <p className="mt-3 text-center text-xs" style={{ color: 'var(--faint)' }}>{t('checkout.disclaimer')}</p>
      </div>

      {receiptOpen && payment?.cardNumber && (
        <ReceiptSheet
          amount={finalTotal}
          cardNumber={payment.cardNumber}
          cardOwner={payment.cardOwner}
          busy={isSubmitting}
          onSubmit={(receipt) => onSubmit(receipt)}
          onClose={() => setReceiptOpen(false)}
        />
      )}

    </>
  )
}
