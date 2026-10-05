import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** Keng shakllar uchun (masalan mahsulot tahriri). */
  wide?: boolean
}

/**
 * Modal oyna.
 *
 * Telefonda pastdan ko'tariladi (sheet), katta ekranda markazda turadi —
 * shu bitta komponent ikkala holatda ham qulay, alohida mobil variant
 * yozish shart emas.
 */
export function Modal({ title, onClose, children, footer, wide = false }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  return createPortal(
    <div className="adm-modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="adm-modal__backdrop" onClick={onClose} />
      <div className={'adm-modal__panel ' + (wide ? 'adm-modal__panel--wide' : '')}>
        <header className="adm-modal__head">
          <h2 className="truncate text-base font-extrabold">{title}</h2>
          <button
            className="grid size-9 shrink-0 place-items-center rounded-xl transition active:scale-90"
            style={{ background: 'var(--surface-2)' }}
            onClick={onClose}
            aria-label="Yopish"
          >
            <X size={18} />
          </button>
        </header>

        <div className="adm-modal__body">{children}</div>

        {footer && <footer className="adm-modal__foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}

/** Xavfli amalni tasdiqlash — o'chirish va bloklash uchun. */
export function ConfirmDialog({
  title, message, confirmLabel = 'Ha, davom etish', busy, onConfirm, onClose,
}: {
  title: string
  message: string
  confirmLabel?: string
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="adm-btn adm-btn--ghost flex-1" onClick={onClose} disabled={busy}>
            Bekor qilish
          </button>
          <button
            className="adm-btn flex-1"
            style={{ background: 'var(--danger)', color: '#fff' }}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Bajarilmoqda...' : confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        {message}
      </p>
    </Modal>
  )
}
