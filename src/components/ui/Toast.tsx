import { CheckCircle2, X } from 'lucide-react'
import { useState } from 'react'
import { usePresence } from '../../hooks/use-presence'
import { useT } from '../../i18n'

/** Yopilish animatsiyasi davomiyligi — styles.css dagi `.toast.leaving` bilan bir xil. */
const EXIT_MS = 220

/**
 * Pastdan chiqadigan qisqa xabar.
 *
 * `message` null bo'lganda ham oxirgi matn ushlab turiladi — aks holda
 * yopilish animatsiyasi paytida xabar bo'sh qolib, «sakrab» ketardi.
 */
export function Toast({ message, onClose }: { message: string | null; onClose: () => void }) {
  const t = useT()
  const { mounted, leaving } = usePresence(Boolean(message), EXIT_MS)
  const [shown, setShown] = useState(message)
  if (message && message !== shown) setShown(message)

  if (!mounted || !shown) return null

  return (
    <div className={'toast ' + (leaving ? 'leaving' : '')} role="status" aria-live="polite">
      <CheckCircle2 className="shrink-0" style={{ color: 'var(--success)' }} />
      <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{shown}</p>
      <button
        onClick={onClose}
        aria-label={t('common.close')}
        className="toast__close"
      >
        <X size={18} />
      </button>
    </div>
  )
}
