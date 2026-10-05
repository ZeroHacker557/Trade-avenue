import { KeyRound, Loader2, Phone, Send, Store, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { BrandLogo } from '../brand/BrandLogo'
import { DEFAULT_CONTACT, phoneHref, telegramHref, type ContactInfo } from '../../config/contact'
import { subscribeToContact } from '../../lib/firebase'
import { useT } from '../../i18n'
import { hapticFeedback } from '../../utils/telegram'

/** Kod alifbosi — server bilan bir xil (api/_lib/shops.ts): chalkash belgilarsiz. */
const CODE_RE = /[^ABCDEFGHJKMNPQRSTUVWXYZ23456789]/g
const CODE_LENGTH = 6

/** «901234567» → «90 123 45 67». */
function formatLocal(digits: string): string {
  const d = digits.slice(0, 9)
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' ')
}

/** Profildagi raqamdan 9 ta mahalliy raqam (998 siz). */
function localDigits(phone?: string | null): string {
  const d = String(phone ?? '').replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('998')) return d.slice(3)
  return d.length === 9 ? d : ''
}

type Props = {
  /** Server javobi: xato bo'lsa — mijoz tilidagi matn, bo'lmasa null. */
  onLogin: (phone: string, code: string) => Promise<string | null>
  /** Profildagi raqam — oldindan to'ldiriladi. */
  defaultPhone?: string | null
  /** Ikkinchi do'kon qo'shilayotganda — yopish tugmasi bilan. */
  onClose?: () => void
}

/**
 * Do'konga kirish: telefon + agent bergan 6 belgili kod.
 *
 * Birinchi ochilishda butun ekranni egallaydi (katalog va narxlar shundan
 * keyin ochiladi). Filial qo'shishda xuddi shu forma yopish tugmasi bilan.
 */
export function ShopLogin({ onLogin, defaultPhone, onClose }: Props) {
  const t = useT()
  const [phone, setPhone] = useState(() => localDigits(defaultPhone))
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [contact, setContact] = useState<ContactInfo>(DEFAULT_CONTACT)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => subscribeToContact(setContact), [])

  const ready = phone.length === 9 && code.length === CODE_LENGTH && !busy

  const submit = async () => {
    if (!ready) return
    setBusy(true)
    setError('')
    const message = await onLogin(`998${phone}`, code)
    setBusy(false)
    if (message) {
      setError(message)
      setCode('')
      codeRef.current?.focus()
    }
  }

  return (
    <div className={'shop-login' + (onClose ? ' shop-login--sheet' : '')} role="dialog" aria-modal="true" aria-label={t('shop.loginTitle')}>
      <div className="shop-login__card">
        {onClose && (
          <button className="shop-login__close" onClick={onClose} aria-label={t('common.close')}>
            <X size={18} />
          </button>
        )}

        <div className="flex flex-col items-center text-center">
          {onClose ? (
            <span className="shop-login__icon"><Store size={26} /></span>
          ) : (
            <BrandLogo size={56} markOnly />
          )}
          <h1 className="mt-4 text-[1.35rem] font-extrabold leading-tight" style={{ color: 'var(--ink)' }}>
            {onClose ? t('shop.add') : t('shop.loginTitle')}
          </h1>
          <p className="mt-2 max-w-[20rem] text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
            {onClose ? t('shop.addText') : t('shop.loginText')}
          </p>
        </div>

        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <div>
            <label className="field-label" htmlFor="shop-phone">{t('shop.phone')}</label>
            <div className="field">
              <Phone size={19} className="shrink-0" style={{ color: 'var(--faint)' }} />
              <span className="shrink-0 text-sm font-bold" style={{ color: 'var(--ink-2)' }}>+998</span>
              <input
                id="shop-phone"
                value={formatLocal(phone)}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 9)
                  setPhone(digits)
                  setError('')
                  if (digits.length === 9 && !code) codeRef.current?.focus()
                }}
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="90 123 45 67"
                className="text-sm font-semibold tracking-wide"
              />
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="shop-code">{t('shop.code')}</label>
            <div className="field shop-login__code">
              <KeyRound size={19} className="shrink-0" style={{ color: 'var(--faint)' }} />
              <input
                id="shop-code"
                ref={codeRef}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase().replace(CODE_RE, '').slice(0, CODE_LENGTH))
                  setError('')
                }}
                autoCapitalize="characters"
                autoComplete="one-time-code"
                autoCorrect="off"
                spellCheck={false}
                placeholder="••••••"
                aria-describedby="shop-code-hint"
              />
            </div>
            <p id="shop-code-hint" className="mt-1.5 pl-1 text-xs" style={{ color: 'var(--faint)' }}>{t('shop.codeHint')}</p>
          </div>

          {error && (
            <p className="shop-login__error" role="alert">{error}</p>
          )}

          <button type="submit" disabled={!ready} className="btn-primary w-full py-4" onClick={() => hapticFeedback('light')}>
            {busy ? <><Loader2 size={20} className="animate-spin" />{t('shop.loggingIn')}</> : t('shop.login')}
          </button>
        </form>

        <div className="shop-login__help">
          <b>{t('shop.noCode')}</b>
          <p>{t('shop.noCodeText')}</p>
          <div className="mt-2.5 flex flex-wrap justify-center gap-2">
            <a className="shop-login__link" href={phoneHref(contact.phone)}><Phone size={14} />{contact.phone}</a>
            <a className="shop-login__link" href={telegramHref(contact.telegram)} target="_blank" rel="noreferrer">
              <Send size={14} />@{contact.telegram}
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
