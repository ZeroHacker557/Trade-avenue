import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, MessageSquareText, ShieldCheck } from 'lucide-react'
import { useT } from '../../i18n'
import { hapticError } from '../../utils/telegram'

type Props = {
  /** Kod yuborilgan raqam — yulduzchali (+9989*****67). */
  phone: string | null
  /** «8600 •••• •••• 7878». */
  cardMask: string | null
  /** Kodni tekshiradi: xato bo'lsa — matni, to'g'ri bo'lsa — null. */
  onConfirm: (code: string) => Promise<string | null>
  onClose: () => void
}

const CODE_LENGTH = 6
const LEAVE_MS = 220

/**
 * Karta bilan to'lov — SMS kod oynasi.
 *
 * Kod karta egasining telefoniga keladi. 6 ta raqam yozilishi bilan o'zi
 * yuboriladi; noto'g'ri bo'lsa maydon silkinadi va qayta yozish mumkin.
 * Telefon SMS'dan kodni o'zi taklif qiladi (autocomplete="one-time-code").
 */
export function CardOtpSheet({ phone, cardMask, onConfirm, onClose }: Props) {
  const t = useT()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 350)
    return () => window.clearTimeout(timer)
  }, [])

  const submit = async (value: string) => {
    if (busy || value.length !== CODE_LENGTH) return
    setBusy(true)
    setError(null)
    const problem = await onConfirm(value)
    setBusy(false)
    if (problem) {
      hapticError()
      setError(problem)
      setCode('')
      inputRef.current?.focus()
    }
  }

  const close = () => {
    if (leaving) return
    setLeaving(true)
    window.setTimeout(onClose, LEAVE_MS)
  }

  return createPortal(
    <div className={'acf-overlay ' + (leaving ? 'leaving' : '')} role="dialog" aria-modal="true" aria-labelledby="otp-title">
      <div className={'acf-sheet ' + (leaving ? 'leaving' : '')}>
        <span className="acf-grip" aria-hidden="true" />

        <div className="acf-pin" aria-hidden="true">
          <span className="acf-pin__ring" />
          <span className="acf-pin__icon"><MessageSquareText size={26} strokeWidth={2.2} /></span>
        </div>
        <h2 id="otp-title" className="acf-title">{t('otp.title')}</h2>
        <p className="acf-sub">{phone ? t('otp.sentTo', { phone }) : t('otp.sent')}</p>
        {cardMask && <p className="otp-card">{cardMask}</p>}

        <input
          ref={inputRef}
          className={'otp-input ' + (error ? 'is-error' : '')}
          value={code}
          onChange={(e) => {
            const next = e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH)
            setCode(next)
            setError(null)
            if (next.length === CODE_LENGTH) void submit(next)
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="••••••"
          aria-label={t('otp.title')}
          disabled={busy}
        />
        {error && <p className="otp-error" role="alert">{error}</p>}

        <div className="acf-actions">
          <button
            type="button"
            className="btn-primary acf-confirm"
            onClick={() => void submit(code)}
            disabled={busy || code.length !== CODE_LENGTH}
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
            {t('otp.confirm')}
          </button>
          <button type="button" className="acf-ghost w-full" onClick={close} disabled={busy}>
            {t('common.cancel')}
          </button>
          <p className="pws-hint">{t('otp.hint')}</p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
