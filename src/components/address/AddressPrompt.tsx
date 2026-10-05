import { LocateFixed, MapPin, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useT } from '../../i18n'
import { hapticFeedback } from '../../utils/telegram'

type Props = {
  /** «Shu yer» — joylashuv avtomatik olinadi. */
  onHere: () => void
  /** «Boshqa joy» — xaritadan belgilanadi. */
  onOther: () => void
  /** «Keyinroq» yoki tashqariga bosish. */
  onDismiss: () => void
}

const EXIT_MS = 220

/**
 * Yangi mijozga chiqadigan «Manzilingiz shu yermi?» taklifi.
 *
 * Ilova ochilgandan 2 soniya keyin ko'rinadi (vaqtni do'kon holati
 * belgilaydi) va faqat manzili yo'q mijozga chiqadi.
 *
 * ATAYLAB majburiy emas: yopish tugmasi ham, «Keyinroq» ham,
 * tashqariga bosish ham taklifni yopadi — mijoz do'konni ko'rishda
 * davom etadi. Maqsad — buyurtma paytida manzil yozish bilan ovora
 * bo'lmaslik, shuning uchun taklif oldindan beriladi.
 */
export function AddressPrompt({ onHere, onOther, onDismiss }: Props) {
  const t = useT()
  const [leaving, setLeaving] = useState(false)

  const close = (then?: () => void) => {
    if (leaving) return
    hapticFeedback('light')
    setLeaving(true)
    window.setTimeout(() => {
      onDismiss()
      then?.()
    }, EXIT_MS)
  }

  // Telegram'ning «orqaga» tugmasi bosilsa ham yopilsin
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div
      className={'addr-sheet ' + (leaving ? 'leaving' : '')}
      onClick={() => close()}
      role="dialog"
      aria-modal="true"
      aria-label={t('addressAsk.title')}
    >
      <div className="addr-sheet__card" onClick={(e) => e.stopPropagation()}>
        <button className="addr-sheet__close" onClick={() => close()} aria-label={t('common.close')}>
          <X size={16} />
        </button>

        <div className="addr-sheet__icon" aria-hidden="true">
          <MapPin size={24} />
        </div>

        <h3 className="addr-sheet__title">{t('addressAsk.title')}</h3>
        <p className="addr-sheet__text">{t('addressAsk.text')}</p>

        <div className="mt-4 flex flex-col gap-2.5">
          <button type="button" className="mode-card" onClick={() => close(onHere)}>
            <span
              className="grid size-11 shrink-0 place-items-center rounded-2xl"
              style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}
            >
              <LocateFixed size={20} />
            </span>
            <span className="min-w-0">
              <b className="block text-[0.95rem]" style={{ color: 'var(--ink)' }}>
                {t('addressAsk.here')}
              </b>
              <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                {t('addressAsk.hereHint')}
              </span>
            </span>
          </button>

          <button type="button" className="mode-card" onClick={() => close(onOther)}>
            <span
              className="grid size-11 shrink-0 place-items-center rounded-2xl"
              style={{ background: 'var(--royal-soft)', color: 'var(--royal)' }}
            >
              <MapPin size={20} />
            </span>
            <span className="min-w-0">
              <b className="block text-[0.95rem]" style={{ color: 'var(--ink)' }}>
                {t('addressAsk.other')}
              </b>
              <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                {t('addressAsk.otherHint')}
              </span>
            </span>
          </button>
        </div>

        <button type="button" className="addr-sheet__later" onClick={() => close()}>
          {t('addressAsk.later')}
        </button>
        <p className="addr-sheet__optional">{t('addressAsk.optional')}</p>
      </div>
    </div>
  )
}
