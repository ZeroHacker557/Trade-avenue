import { Check, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useT } from '../../i18n'

type Props = {
  /** Savatga qo'shilgan mahsulot nomi (hozircha faqat kalit sifatida). */
  productName: string
  onCheckout: () => void
  onDismiss: () => void
}

/** Javob kutmasa o'zi yopiladi — shuncha ms. */
const AUTO_CLOSE = 5000
const EXIT_MS = 200

/**
 * Savatga qo'shilgandan keyingi so'rov.
 *
 * ATAYLAB ingichka bir qator: mijoz katalogni ko'rishda davom etadi va
 * bu element mahsulotlarni to'sib qo'ymasligi kerak. Shuning uchun
 * mahsulot nomi ham, ikki qatorli matn ham yo'q — faqat savol,
 * «Ha» tugmasi va yopish.
 *
 * «Yo'q» alohida tugma emas: × va tashqarida davom etish o'sha ma'noni
 * beradi, ortiqcha tugma esa qatorni kengaytirardi.
 */
export function CartPrompt({ onCheckout, onDismiss }: Props) {
  const t = useT()
  const [leaving, setLeaving] = useState(false)

  const close = (then?: () => void) => {
    setLeaving(true)
    window.setTimeout(() => {
      onDismiss()
      then?.()
    }, EXIT_MS)
  }

  useEffect(() => {
    const timer = window.setTimeout(() => setLeaving(true), AUTO_CLOSE)
    const done = window.setTimeout(onDismiss, AUTO_CLOSE + EXIT_MS)
    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(done)
    }
  }, [onDismiss])

  return (
    <div className={'cart-prompt ' + (leaving ? 'leaving' : '')} role="status">
      <Check size={15} className="shrink-0" style={{ color: 'var(--brand)' }} />

      <span className="min-w-0 flex-1 truncate text-xs font-semibold" style={{ color: 'var(--ink)' }}>
        {t('cart.checkoutAsk')}
      </span>

      <button className="cart-prompt__yes" onClick={() => close(onCheckout)}>
        {t('common.yes')}
      </button>

      <button
        className="cart-prompt__close"
        onClick={() => close()}
        aria-label={t('common.close')}
      >
        <X size={14} />
      </button>
    </div>
  )
}
