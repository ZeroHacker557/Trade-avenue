import { useCallback, useRef, useState } from 'react'

export type ToastKind = 'ok' | 'error'

/**
 * Bitta joyda turadigan qisqa xabar.
 *
 * Har sahifada takrorlanmasligi uchun hook: `show('Saqlandi')` yoki
 * `show(xato, 'error')`. Yangi xabar eskisining taymerini bekor qiladi.
 */
export function useToast() {
  const [toast, setToast] = useState<{ text: string; kind: ToastKind } | null>(null)
  const timer = useRef<number | null>(null)

  const show = useCallback((text: string, kind: ToastKind = 'ok') => {
    if (timer.current) window.clearTimeout(timer.current)
    setToast({ text, kind })
    timer.current = window.setTimeout(() => setToast(null), kind === 'error' ? 6000 : 3500)
  }, [])

  const node = toast ? (
    <div
      className="adm-toast"
      style={{
        background: toast.kind === 'error' ? 'var(--danger)' : 'var(--ink)',
        color: toast.kind === 'error' ? '#fff' : 'var(--surface)',
      }}
      role="status"
    >
      {toast.text}
    </div>
  ) : null

  return { show, node }
}
