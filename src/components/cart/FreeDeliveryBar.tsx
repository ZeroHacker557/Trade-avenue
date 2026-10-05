import { Gift, Truck } from 'lucide-react'
import { formatPrice } from '../../data'

export type FreeDeliveryText = {
  /** «Bepul yetkazishgacha yana {amount}» — amount qalin bo'lib qo'yiladi. */
  remaining: [before: string, after: string]
  reached: string
  saved: (amount: string) => string
  goal: (amount: string) => string
  fee: (amount: string) => string
}

type Props = {
  /** Savatdagi mahsulotlar summasi. */
  subtotal: number
  fee: number
  freeFrom: number
  text: FreeDeliveryText
}

/**
 * «Bepul yetkazishgacha yana 23 000 so'm» — savat ichidagi jonli chiziq.
 *
 * Mijoz mahsulot qo'shgan sari chiziq to'ladi; chegaraga yetganda
 * yashil bo'lib «Yetkazish bepul!» deydi. Maqsad — o'rtacha chekni
 * ko'tarish: odam «yana bitta muzqaymoq olsam, yetkazish tekin» deb
 * o'ylaydi.
 *
 * Admin panel sozlamalarida ham xuddi shu komponent namuna sifatida
 * ko'rsatiladi — admin mijoz nimani ko'rishini aniq biladi.
 */
export function FreeDeliveryBar({ subtotal, fee, freeFrom, text }: Props) {
  if (freeFrom <= 0) {
    if (fee <= 0) return null
    return (
      <div className="free-delivery">
        <div className="free-delivery__row">
          <Truck size={17} />
          <span>{text.fee(formatPrice(fee))}</span>
        </div>
      </div>
    )
  }

  const remaining = Math.max(0, freeFrom - subtotal)
  const reached = remaining === 0
  const percent = Math.min(100, Math.round((subtotal / freeFrom) * 100))

  return (
    <div
      className={'free-delivery ' + (reached ? 'is-reached' : '')}
      role="status"
      aria-live="polite"
    >
      <div className="free-delivery__row">
        {reached ? <Gift size={17} /> : <Truck size={17} />}
        {reached ? (
          <span>
            <b>{text.reached}</b>
            {fee > 0 && <span className="free-delivery__muted"> · {text.saved(formatPrice(fee))}</span>}
          </span>
        ) : (
          <span>
            {text.remaining[0]} <b>{formatPrice(remaining)}</b> {text.remaining[1]}
          </span>
        )}
      </div>

      <div
        className="free-delivery__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="free-delivery__fill" style={{ width: `${Math.max(percent, 4)}%` }} />
      </div>

      {!reached && (
        <div className="free-delivery__scale">
          <span>{formatPrice(subtotal)}</span>
          <span>{text.goal(formatPrice(freeFrom))}</span>
        </div>
      )}
    </div>
  )
}
