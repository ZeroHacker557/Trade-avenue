import { GripVertical } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'

export type SortableRow = {
  key: string
  /** Sudrab bo'ladimi. Sarlavhalar joyida turadi, faqat atrofidagilar suriladi. */
  draggable: boolean
  render: (handle: ReactNode) => ReactNode
}

type Props = {
  rows: SortableRow[]
  /** Element `from` o'rnidan `to` o'rniga ko'chirildi. */
  onMove: (from: number, to: number) => void
  /** Bundan yuqoriga tushirib bo'lmaydi (masalan birinchi sarlavha ustiga). */
  minIndex?: number
  className?: string
}

type Drag = {
  from: number
  to: number
  dy: number
  /** Sudralayotgan qatorning bo'yi + oraliq — boshqalar shuncha suriladi. */
  slot: number
  /** Qatorlar markazi, sahifa koordinatasida, sudrash boshlangan paytdagi. */
  centers: number[]
  startPageY: number
}

/** Ekran chetiga shuncha piksel yaqinlashganda sahifa o'zi aylanadi. */
const EDGE = 90

/**
 * Sudrab tartiblanadigan ro'yxat.
 *
 * Qator faqat TUTQICHDAN (⋮⋮) ushlab suriladi: qolgan joyi odatdagidek
 * bosiladi va telefonda sahifani aylantiradi. Tutqichda `touch-action:
 * none` — barmoq bilan sudraganda brauzer sahifani aylantirib yubormaydi.
 *
 * Sudralayotgan qator barmoq ortidan ergashadi, qolganlari silliq surilib
 * joy bo'shatadi. Qo'yib yuborilganda BITTA `onMove` chaqiriladi — har
 * piksel uchun emas, shuning uchun serverga bitta so'rov ketadi.
 *
 * Klaviatura: tutqichda ↑/↓ — bir qatorga ko'chiradi.
 *
 * Tashqi kutubxonasiz: loyihada npm ishlamaydi va bu yerda kerak bo'lgan
 * narsa bitta ustunli ro'yxat — qo'lda yozilgani yengilroq.
 */
export function SortableList({ rows, onMove, minIndex = 0, className = '' }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)

  const dragRef = useRef<Drag | null>(null)
  const lastClientY = useRef(0)
  const raf = useRef(0)

  const targetFor = (state: Drag, pageY: number): number => {
    const center = state.centers[state.from] + (pageY - state.startPageY)
    let to = state.from
    for (let i = state.from + 1; i < state.centers.length; i++) {
      if (center > state.centers[i]) to = i
    }
    for (let i = state.from - 1; i >= 0; i--) {
      if (center < state.centers[i]) to = i
    }
    return Math.max(minIndex, to)
  }

  const update = (clientY: number) => {
    const state = dragRef.current
    if (!state) return
    const pageY = clientY + window.scrollY
    const next = { ...state, dy: pageY - state.startPageY, to: targetFor(state, pageY) }
    dragRef.current = next
    setDrag(next)
  }

  // Chetga yaqin turganda sahifani aylantirib turish (barmoq qimirlamasa ham)
  useEffect(() => {
    if (!drag) return
    const tick = () => {
      const y = lastClientY.current
      let speed = 0
      if (y < EDGE) speed = -Math.ceil((EDGE - y) / 6)
      else if (y > window.innerHeight - EDGE) speed = Math.ceil((y - (window.innerHeight - EDGE)) / 6)
      if (speed) {
        window.scrollBy(0, speed)
        update(y)
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(drag)])

  const start = (index: number, event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    const elements = container.current?.querySelectorAll<HTMLElement>(':scope > [data-sort-row]')
    if (!elements?.length) return

    const rects = [...elements].map((el) => el.getBoundingClientRect())
    const gap = rects.length > 1 ? Math.max(0, rects[1].top - rects[0].bottom) : 0

    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Sun'iy hodisalarda capture ishlamasligi mumkin — sudrash baribir ishlaydi
    }
    event.preventDefault()

    lastClientY.current = event.clientY
    const state: Drag = {
      from: index,
      to: index,
      dy: 0,
      slot: rects[index].height + gap,
      centers: rects.map((r) => r.top + window.scrollY + r.height / 2),
      startPageY: event.clientY + window.scrollY,
    }
    dragRef.current = state
    setDrag(state)
  }

  const move = (event: PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) return
    lastClientY.current = event.clientY
    update(event.clientY)
  }

  const end = () => {
    const state = dragRef.current
    if (!state) return
    dragRef.current = null
    // Sudrash tugashi va yangi tartib BIR renderda: qatorlar animatsiyasiz
    // yangi joyida paydo bo'ladi, eski joyiga «sakrab qaytmaydi»
    setDrag(null)
    if (state.to !== state.from) onMove(state.from, state.to)
  }

  const keyMove = (index: number, event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
    if (!step) return
    event.preventDefault()
    const to = index + step
    if (to < minIndex || to >= rows.length) return
    onMove(index, to)
  }

  const shiftFor = (index: number): number => {
    if (!drag || index === drag.from) return 0
    if (drag.from < drag.to && index > drag.from && index <= drag.to) return -drag.slot
    if (drag.to < drag.from && index >= drag.to && index < drag.from) return drag.slot
    return 0
  }

  return (
    <div ref={container} className={'adm-sortable ' + className}>
      {rows.map((row, index) => {
        const dragging = drag?.from === index
        const handle = row.draggable ? (
          <button
            type="button"
            className="adm-drag-handle"
            aria-label="Sudrab joyini o‘zgartirish (yoki ↑/↓)"
            onPointerDown={(e) => start(index, e)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            onKeyDown={(e) => keyMove(index, e)}
          >
            <GripVertical size={18} />
          </button>
        ) : null

        return (
          <div
            key={row.key}
            data-sort-row
            className={'adm-sort-row ' + (dragging ? 'is-dragging' : '')}
            style={{
              transform: `translate3d(0, ${dragging ? drag.dy : shiftFor(index)}px, 0)`,
              transition: dragging || !drag ? 'none' : 'transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1)',
            }}
          >
            {row.render(handle)}
          </div>
        )
      })}
    </div>
  )
}
