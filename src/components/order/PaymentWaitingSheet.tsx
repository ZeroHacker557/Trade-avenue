import { useEffect, useState } from 'react'
import { datedNumber } from '../../utils/order-label'
import { createPortal } from 'react-dom'
import { CreditCard, ExternalLink, Loader2, XCircle } from 'lucide-react'
import { useT } from '../../i18n'
import { formatPrice } from '../../data'
import { AWAITING_PAYMENT, openPayment, providerLabel } from '../../utils/payment'
import type { Order } from '../../types/domain'

type Props = {
  /** Jonli buyurtma (Firestore) — hali kelmagan bo'lishi mumkin. */
  order: Order | null
  onPaid: () => void
  onClose: () => void
  /** Holatni serverdan so'rash (webhook kechiksa) — natija jonli obuna orqali keladi. */
  onCheck: () => void
}

/** Server bilan bir xil (api/_lib/actions/payments.ts → PAYMENT_TTL_MIN). */
const TTL_MIN = 45
const LEAVE_MS = 220

/**
 * «To'lov kutilmoqda» — to'lov sahifasi ochilgach ilovada turadi.
 *
 * Mijoz Click/Payme'da to'laydi va qaytadi. Webhook buyurtmani «Yangi»
 * qilishi bilan (jonli obuna) oyna o'zi yopilib muvaffaqiyat animatsiyasi
 * chiqadi. To'lov bekor bo'lsa — sababi va yopish tugmasi.
 */
export function PaymentWaitingSheet({ order, onPaid, onClose, onCheck }: Props) {
  const t = useT()
  const [leaving, setLeaving] = useState(false)
  const paid = Boolean(order?.paidAt) || order?.paymentStatus === 'Tolangan'
  const failed = !paid && (order?.status === 'Bekor qilingan' || order?.status === 'Rad etildi')
  const provider = providerLabel(order?.payment?.provider ?? order?.paymentProvider) || 'Payme'
  const url = order?.payment?.checkoutUrl

  // To'landi — oyna yopilib, odatdagi «Buyurtma qabul qilindi» chiqadi
  useEffect(() => {
    if (paid) onPaid()
  }, [paid, onPaid])

  /*
   * Webhook kechiksa: mijoz to'lov sahifasidan qaytganda va har 5 soniyada
   * (ilova ko'rinib turganda) server WLCM'dan holatni so'raydi. Natija
   * buyurtmaning jonli obunasi orqali keladi — bu yerda javob kutilmaydi.
   */
  const waiting = order?.status === AWAITING_PAYMENT && !paid
  useEffect(() => {
    if (!waiting) return
    const tick = () => {
      if (document.visibilityState === 'visible') onCheck()
    }
    const timer = window.setInterval(tick, 5000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [waiting, onCheck])

  const close = () => {
    if (leaving) return
    setLeaving(true)
    window.setTimeout(onClose, LEAVE_MS)
  }

  return createPortal(
    <div className={'acf-overlay ' + (leaving ? 'leaving' : '')} role="dialog" aria-modal="true" aria-labelledby="pws-title">
      <div className={'acf-sheet ' + (leaving ? 'leaving' : '')}>
        <span className="acf-grip" aria-hidden="true" />

        {failed ? (
          <>
            <div className="pws-icon is-failed" aria-hidden="true"><XCircle size={30} /></div>
            <h2 id="pws-title" className="acf-title">{t('pay.failedTitle')}</h2>
            <p className="acf-sub">{t('pay.failedText')}</p>
            <div className="acf-actions">
              <button type="button" className="btn-primary acf-confirm" onClick={close}>{t('common.close')}</button>
            </div>
          </>
        ) : (
          <>
            <div className="acf-pin" aria-hidden="true">
              <span className="acf-pin__ring" />
              <span className="acf-pin__ring acf-pin__ring--late" />
              <span className="acf-pin__icon"><CreditCard size={26} strokeWidth={2.2} /></span>
            </div>
            <h2 id="pws-title" className="acf-title">{t('pay.waitTitle')}</h2>
            <p className="acf-sub">{t('pay.waitText', { provider })}</p>

            {order && (
              <div className="pws-amount">
                <span>{datedNumber(order.orderNumber, order.orderDay, order.createdAt)}</span>
                <b>{formatPrice(order.total)}</b>
              </div>
            )}
            <p className="pws-live"><Loader2 size={14} className="animate-spin" /> {order?.status === AWAITING_PAYMENT ? t('pay.waitTitle') : t('pay.opening')}</p>

            <div className="acf-actions">
              <button
                type="button"
                className="btn-primary acf-confirm"
                disabled={!url}
                onClick={() => url && openPayment(url)}
              >
                <ExternalLink size={18} /> {t('pay.reopen')}
              </button>
              <button type="button" className="acf-ghost w-full" onClick={close}>{t('pay.later')}</button>
              <p className="pws-hint">{t('pay.laterHint', { min: TTL_MIN })}</p>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
