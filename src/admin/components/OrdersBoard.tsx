import { AlertTriangle, ArrowRight, Bike, Banknote, CreditCard, GripVertical, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { formatPrice } from '../../data'
import type { OrderStatus } from '../../types/domain'
import { datedNumber } from '../../utils/order-label'
import { isCashPayment } from '../../utils/payment'
import type { AdminOrder } from '../lib/live'

type Column = { status: OrderStatus; title: string; tone: string }

const COLUMNS: Column[] = [
  { status: 'Yangi', title: 'Yangi', tone: 'var(--warning)' },
  { status: 'Qabul qilindi', title: 'Qabul qilindi', tone: 'var(--info)' },
  { status: 'Yetkazilmoqda', title: 'Yo‘lda', tone: 'var(--royal, #4f46e5)' },
  { status: 'Yetkazildi', title: 'Yetkazildi', tone: 'var(--brand)' },
  { status: 'Bekor qilingan', title: 'Bekor / rad', tone: 'var(--danger)' },
]

/** «Keyingi holat» tugmasi — sudramasdan bir bosishda. */
const NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  'Yangi': 'Qabul qilindi',
  'Qabul qilindi': 'Yetkazilmoqda',
  'Yetkazilmoqda': 'Yetkazildi',
}

const columnOf = (status: string): OrderStatus =>
  status === 'Rad etildi' ? 'Bekor qilingan' : (status as OrderStatus)

function ago(iso: string, now: number): string {
  const m = Math.round((now - Date.parse(iso)) / 60_000)
  if (!Number.isFinite(m)) return ''
  if (m < 60) return `${Math.max(0, m)} daq`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h} soat` : `${Math.floor(h / 24)} kun`
}

type Drag = {
  order: AdminOrder
  pointerId: number
  startX: number
  startY: number
  offsetX: number
  offsetY: number
  width: number
  active: boolean
  holdTimer: ReturnType<typeof setTimeout> | null
}

/**
 * Buyurtmalar kanban doskasi (22-band).
 *
 * Kartani boshqa ustunga sudrab qo'yish — holatni o'zgartiradi
 * (server orqali: xabarlar, Linko, kuryer — hammasi odatdagidek).
 * Telefonda karta biroz bosib turilgach suriladi — oddiy scroll
 * buzilmasin. Har kartada «→» — keyingi holatga bir bosishda.
 * Bekor qilishga o'tkazish tasdiq so'raydi.
 */
export function OrdersBoard({
  orders, busyId, onOpen, onMove,
}: {
  orders: AdminOrder[]
  busyId: string | null
  onOpen: (id: string) => void
  onMove: (order: AdminOrder, status: OrderStatus) => void
}) {
  const board = useRef<HTMLDivElement>(null)
  const ghost = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [hover, setHover] = useState<OrderStatus | null>(null)
  // «12 daq» — vaqt holatda (render toza), daqiqada bir yangilanadi
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  // Tashlashdan keyingi «bosish» kartani ochib yubormasin
  const justDropped = useRef(false)

  /*
   * Telefonda: karta ushlab turilgach sahifa scroll bo'lmasin. React'ning
   * touchmove tinglovchisi passiv (preventDefault ishlamaydi), shuning
   * uchun o'zimiz passiv bo'lmagan tinglovchi qo'yamiz.
   */
  useEffect(() => {
    const el = board.current
    if (!el) return
    const stop = (e: TouchEvent) => {
      if (drag.current?.active) e.preventDefault()
    }
    el.addEventListener('touchmove', stop, { passive: false })
    return () => el.removeEventListener('touchmove', stop)
  }, [])

  const move = (order: AdminOrder, to: OrderStatus) => {
    if (columnOf(order.status) === to) return
    if (to === 'Bekor qilingan' && !window.confirm(`${datedNumber(order.orderNumber, order.orderDay)} ni bekor qilasizmi? Mijozga xabar boradi.`)) return
    onMove(order, to)
  }

  const startDrag = (d: Drag) => {
    d.active = true
    setDragging(d.order.id)
    navigator.vibrate?.(12)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.active) {
      if (e.pointerType === 'mouse') {
        if (Math.hypot(dx, dy) > 6) startDrag(d)
      } else if (Math.hypot(dx, dy) > 8) {
        // Telefonda ushlab turilmasdan surildi — bu scroll
        if (d.holdTimer) clearTimeout(d.holdTimer)
        drag.current = null
      }
      if (!d.active) return
    }
    e.preventDefault()
    if (ghost.current) {
      ghost.current.style.transform = `translate(${e.clientX - d.offsetX}px, ${e.clientY - d.offsetY}px) rotate(2deg)`
    }
    // Chetga yaqinlashsa doska o'zi suriladi (telefonda ustunlar ko'p)
    const el = board.current
    if (el) {
      const r = el.getBoundingClientRect()
      if (e.clientX < r.left + 40) el.scrollLeft -= 14
      else if (e.clientX > r.right - 40) el.scrollLeft += 14
    }
    // Barmoq qaysi ustun ustida — ustun chegaralari bo'yicha
    let col: OrderStatus | null = null
    for (const el of board.current?.querySelectorAll<HTMLElement>('[data-col]') ?? []) {
      const r = el.getBoundingClientRect()
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        col = el.dataset.col as OrderStatus
        break
      }
    }
    setHover((prev) => (col === prev ? prev : col))
  }

  const finish = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    if (d.holdTimer) clearTimeout(d.holdTimer)
    drag.current = null
    const wasActive = d.active
    const target = hover
    setDragging(null)
    setHover(null)
    if (!wasActive) return
    justDropped.current = true
    setTimeout(() => { justDropped.current = false }, 50)
    if (target) move(d.order, target)
  }

  const dragged = dragging ? orders.find((o) => o.id === dragging) ?? null : null

  return (
    <div
      ref={board}
      className={'adm-board ' + (dragging ? 'is-dragging' : '')}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      {COLUMNS.map((col) => {
        const list = orders.filter((o) => columnOf(o.status) === col.status)
        const sum = list.reduce((s, o) => s + (Number(o.total) || 0), 0)
        return (
          <section
            key={col.status}
            data-col={col.status}
            className={'adm-board__col ' + (hover === col.status && dragged && columnOf(dragged.status) !== col.status ? 'is-over' : '')}
            style={{ ['--c' as string]: col.tone }}
          >
            <header className="adm-board__head">
              <span className="adm-board__dot" />
              <b>{col.title}</b>
              <span className="adm-board__count">{list.length}</span>
              {sum > 0 && <span className="adm-board__sum">{formatPrice(sum)}</span>}
            </header>
            <div className="adm-board__list">
              {list.length === 0 && <p className="adm-board__empty">Bo‘sh</p>}
              {list.map((order) => {
                const next = NEXT[columnOf(order.status)]
                const busy = busyId === order.id
                return (
                  <article
                    key={order.id}
                    className={'adm-board__card ' + (dragging === order.id ? 'is-ghosted' : '') + (busy ? ' is-busy' : '')}
                    onPointerDown={(e) => {
                      if ((e.target as HTMLElement).closest('button')) return
                      if (e.pointerType === 'mouse' && e.button !== 0) return
                      const r = e.currentTarget.getBoundingClientRect()
                      const d: Drag = {
                        order, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY,
                        offsetX: e.clientX - r.left, offsetY: e.clientY - r.top, width: r.width,
                        active: false, holdTimer: null,
                      }
                      if (e.pointerType !== 'mouse') d.holdTimer = setTimeout(() => startDrag(d), 260)
                      drag.current = d
                      e.currentTarget.setPointerCapture(e.pointerId)
                      if (ghost.current) {
                        ghost.current.style.width = `${r.width}px`
                        ghost.current.style.transform = `translate(${r.left}px, ${r.top}px)`
                      }
                    }}
                    onClick={() => {
                      if (!justDropped.current) onOpen(order.id)
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <GripVertical size={14} className="adm-board__grip" />
                      <b className="text-sm">{datedNumber(order.orderNumber, order.orderDay)}</b>
                      {!!order.problems?.length && <AlertTriangle size={13} style={{ color: 'var(--warning)' }} />}
                      <span className="ml-auto text-[11px]" style={{ color: 'var(--faint)' }}>{ago(order.createdAt, now)}</span>
                    </div>
                    <p className="mt-1 truncate text-xs" style={{ color: 'var(--muted)' }}>
                      {order.customer?.name || '—'}{order.customer?.address ? ` · ${order.customer.address}` : ''}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      {isCashPayment(order.paymentMethod)
                        ? <Banknote size={13} style={{ color: 'var(--brand)' }} />
                        : <CreditCard size={13} style={{ color: 'var(--info)' }} />}
                      <b className="text-sm">{formatPrice(order.total)}</b>
                      {order.courierName && (
                        <span className="adm-board__courier"><Bike size={11} /> {order.courierName}</span>
                      )}
                      {next && (
                        <button
                          className="adm-board__next"
                          disabled={busy}
                          onClick={(e) => {
                            e.stopPropagation()
                            move(order, next)
                          }}
                          title={`«${next}» ga o‘tkazish`}
                          aria-label={`«${next}» ga o‘tkazish`}
                        >
                          {busy ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
                        </button>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        )
      })}

      {/* Sudralayotgan karta nusxasi — barmoq ortidan yuradi */}
      <div ref={ghost} className={'adm-board__ghost ' + (dragged ? 'is-on' : '')} aria-hidden="true">
        {dragged && (
          <div className="adm-board__card">
            <b className="text-sm">{datedNumber(dragged.orderNumber, dragged.orderDay)}</b>
            <p className="mt-1 truncate text-xs" style={{ color: 'var(--muted)' }}>{dragged.customer?.name || '—'}</p>
            <b className="mt-1 block text-sm">{formatPrice(dragged.total)}</b>
          </div>
        )}
      </div>
    </div>
  )
}
