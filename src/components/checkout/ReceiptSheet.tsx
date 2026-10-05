import { Check, Copy, ImagePlus, Loader2, ReceiptText, Send, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../../i18n'
import { formatPrice } from '../../data'
import { hapticFeedback } from '../../utils/telegram'

/**
 * «To'lov chekini yuklang» — Karta (o'tkazma) bilan buyurtmada «Buyurtma
 * berish» bosilganda ochiladi. Mijoz pulni kartaga o'tkazadi, chek rasmini
 * yuklaydi — shundan keyingina buyurtma yaratiladi (api/orders.ts →
 * `receipt`) va adminga chek bilan boradi.
 */

export type ReceiptUpload = { data: string; contentType: string }

type Props = {
  amount: number
  cardNumber: string
  cardOwner: string
  busy: boolean
  onSubmit: (receipt: ReceiptUpload) => Promise<boolean>
  onClose: () => void
}

/** Yopilish animatsiyasi — AddressConfirmSheet bilan bir xil. */
const LEAVE_MS = 220
/** Server chegarasi 3 MB — rasm siqib yuboriladi. */
const MAX_SIDE = 1600

/** Rasmni JPEG ga siqadi (uzun tomoni 1600px gacha) → base64. */
async function compress(file: File): Promise<ReceiptUpload> {
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('decode'))
      img.src = url
    })
    const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
    return { data: dataUrl.split(',')[1] || '', contentType: 'image/jpeg' }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function ReceiptSheet({ amount, cardNumber, cardOwner, busy, onSubmit, onClose }: Props) {
  const t = useT()
  const [leaving, setLeaving] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<ReceiptUpload | null>(null)
  const [error, setError] = useState('')
  const [reading, setReading] = useState(false)
  const [copied, setCopied] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Oyna ochiq turganda sahifa orqasi aylanmasin
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const leave = (action: () => void) => {
    if (leaving) return
    setLeaving(true)
    window.setTimeout(action, LEAVE_MS)
  }

  const pick = async (file: File | undefined) => {
    if (!file) return
    setError('')
    if (!file.type.startsWith('image/')) {
      setError(t('receiptSheet.notImage'))
      return
    }
    setReading(true)
    try {
      const packed = await compress(file)
      setReceipt(packed)
      setPreview(URL.createObjectURL(file))
      hapticFeedback('light')
    } catch {
      setError(t('receiptSheet.bad'))
    } finally {
      setReading(false)
    }
  }

  const copy = () => {
    void navigator.clipboard?.writeText(cardNumber.replace(/\s/g, '')).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    })
  }

  const send = async () => {
    if (!receipt || busy) return
    const ok = await onSubmit(receipt)
    if (ok) leave(onClose)
  }

  return createPortal(
    <div className={'acf-overlay ' + (leaving ? 'leaving' : '')} role="dialog" aria-modal="true" aria-labelledby="rcs-title">
      <div className={'acf-sheet rcs-sheet ' + (leaving ? 'leaving' : '')}>
        <span className="acf-grip" aria-hidden="true" />
        <button type="button" className="rcs-close" onClick={() => leave(onClose)} disabled={busy} aria-label={t('common.close')}>
          <X size={18} />
        </button>

        <div className="acf-pin" aria-hidden="true">
          <span className="acf-pin__ring" />
          <span className="acf-pin__icon"><ReceiptText size={26} strokeWidth={2.2} /></span>
        </div>
        <h2 id="rcs-title" className="acf-title">{t('receiptSheet.title')}</h2>
        <p className="acf-sub">{t('receiptSheet.sub', { amount: formatPrice(amount) })}</p>

        {/* Karta — nusxalash bilan */}
        <div className="rcs-card">
          <div className="min-w-0 flex-1">
            <p className="rcs-card__label">{t('checkout.cardNumber')}</p>
            <p className="rcs-card__number">{cardNumber}</p>
            <p className="rcs-card__owner">{cardOwner}</p>
          </div>
          <button type="button" className={'rcs-copy ' + (copied ? 'is-done' : '')} onClick={copy} aria-label={t('receiptSheet.copy')}>
            {copied ? <Check size={18} /> : <Copy size={18} />}
          </button>
        </div>
        <div className="rcs-amount">
          <span>{t('receiptSheet.amount')}</span>
          <b>{formatPrice(amount)}</b>
        </div>

        {/* Chek rasmi */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }}
        />
        <button type="button" className={'rcs-drop ' + (preview ? 'has-image' : '')} onClick={() => fileRef.current?.click()} disabled={busy || reading}>
          {preview ? (
            <>
              <img src={preview} alt="" className="rcs-drop__img" />
              <span className="rcs-drop__change">{t('receiptSheet.change')}</span>
            </>
          ) : (
            <span className="rcs-drop__empty">
              {reading ? <Loader2 size={26} className="animate-spin" /> : <ImagePlus size={26} />}
              <b>{t('receiptSheet.pick')}</b>
              <small>{t('receiptSheet.pickHint')}</small>
            </span>
          )}
        </button>
        {error && <p className="field-error text-center">{error}</p>}

        <div className="acf-actions">
          <button type="button" className="btn-primary acf-confirm" onClick={() => void send()} disabled={!receipt || busy || reading}>
            {busy ? <Loader2 size={19} className="animate-spin" /> : <Send size={18} />}
            {busy ? t('checkout.submitting') : t('receiptSheet.send')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
