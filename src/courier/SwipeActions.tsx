import type { LucideIcon } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { hapticFeedback } from '../utils/telegram'

export type SwipeAction = {
  label: string
  icon: LucideIcon
  /** Fon rangi (CSS qiymat). */
  color: string
  onTrigger: () => void
}

type Props = {
  children: ReactNode
  /** O'ngga surilganda ochiladi (chap tomonda ko'rinadi). */
  left?: SwipeAction
  /** Chapga surilganda ochiladi (o'ng tomonda ko'rinadi). */
  right?: SwipeAction
}

/** Shu masofadan uzoq surilsa — amal bajariladi. */
const TRIGGER = 90
const MAX = 130

/**
 * Kartani barmoq bilan surib amal bajarish (20-band).
 *
 *   o'ngga → navigatsiya     chapga → «Yetib keldim»
 *
 * Faqat gorizontal harakat ushlanadi: vertikal scroll odatdagidek
 * ishlaydi (`touch-action: pan-y`). Surishdan keyingi «bosish»
 * kartadagi tugmalarga yetib bormaydi. Harakat React holatisiz —
 * to'g'ridan-to'g'ri transform bilan, sekin telefonda ham silliq.
 */
export function SwipeActions({ children, left, right }: Props) {
  const fg = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: number; x: number; y: number; dx: number; active: boolean; moved: boolean } | null>(null)

  if (!left && !right) return <>{children}</>

  const setX = (x: number, animate: boolean) => {
    const el = fg.current
    if (!el) return
    el.style.transition = animate ? 'transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none'
    el.style.transform = x ? `translateX(${x}px)` : ''
    root.current?.style.setProperty('--swipe', String(Math.min(1, Math.abs(x) / TRIGGER)))
    root.current?.setAttribute('data-side', x > 0 ? 'left' : x < 0 ? 'right' : '')
  }

  return (
    <div
      ref={root}
      className="swipe"
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, active: false, moved: false }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d || d.id !== e.pointerId) return
        const dx = e.clientX - d.x
        const dy = e.clientY - d.y
        if (!d.active) {
          // Vertikal harakat — bu scroll, surish emas
          if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
            drag.current = null
            return
          }
          if (Math.abs(dx) < 10) return
          d.active = true
          d.moved = true
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        }
        // Amal yo'q tomonga surilmaydi; chegaradan keyin qarshilik
        let x = dx
        if ((x > 0 && !left) || (x < 0 && !right)) x = 0
        if (Math.abs(x) > MAX) x = Math.sign(x) * (MAX + (Math.abs(x) - MAX) * 0.2)
        if (Math.abs(d.dx) < TRIGGER && Math.abs(x) >= TRIGGER) hapticFeedback('light')
        d.dx = x
        setX(x, false)
      }}
      onPointerUp={(e) => {
        const d = drag.current
        drag.current = d && d.moved ? { ...d, active: false } : null
        if (!d || d.id !== e.pointerId || !d.active) return
        setX(0, true)
        if (d.dx >= TRIGGER) left?.onTrigger()
        else if (d.dx <= -TRIGGER) right?.onTrigger()
      }}
      onPointerCancel={() => {
        drag.current = null
        setX(0, true)
      }}
      // Surilgan bo'lsa — keyingi bosish kartaning tugmalariga yetmasin
      onClickCapture={(e) => {
        if (drag.current?.moved) {
          e.stopPropagation()
          e.preventDefault()
        }
        drag.current = null
      }}
    >
      {left && (
        <div className="swipe__bg swipe__bg--left" style={{ background: left.color }} aria-hidden="true">
          <left.icon size={22} /> <span>{left.label}</span>
        </div>
      )}
      {right && (
        <div className="swipe__bg swipe__bg--right" style={{ background: right.color }} aria-hidden="true">
          <span>{right.label}</span> <right.icon size={22} />
        </div>
      )}
      <div ref={fg} className="swipe__fg">{children}</div>
    </div>
  )
}
