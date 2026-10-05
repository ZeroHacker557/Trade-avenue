import { Navigation } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { openExternal } from './format'
import { googleRouteTo, yandexRouteTo, type Point } from './route'

/** Bitta manzilga yo'l — bosilganda Yandex yoki Google tanlanadi. */
export function NavigateButton({ point, block = false }: { point: Point; block?: boolean }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        className={'crr-btn crr-btn--ghost ' + (block ? 'crr-btn--block' : '')}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Navigation size={17} /> {t('courier.navigate')}
      </button>
      {open && (
        <div className="crr-menu">
          <button onClick={() => { setOpen(false); openExternal(yandexRouteTo(point)) }}>Yandex</button>
          <button onClick={() => { setOpen(false); openExternal(googleRouteTo(point)) }}>Google Maps</button>
        </div>
      )}
    </div>
  )
}
