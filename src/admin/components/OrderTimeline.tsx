import {
  AlertTriangle, Ban, Bike, CheckCircle2, CircleDot, DoorOpen, PackageCheck, ShoppingBag, Star,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useOrderHistory, type AdminOrder } from '../lib/live'

type Event = { at: string; icon: LucideIcon; tone: string; title: string; note?: string }

const ROLE: Record<string, string> = {
  owner: 'ega', admin: 'admin', courier: 'kuryer', customer: 'mijoz', system: 'tizim',
}

const PROBLEM: Record<string, string> = {
  no_answer: 'Mijoz javob bermayapti',
  no_address: 'Manzil topilmadi',
  refused: 'Mijoz rad etdi',
}

function statusEvent(to: string): Pick<Event, 'icon' | 'tone'> {
  if (to === 'Qabul qilindi') return { icon: CheckCircle2, tone: 'var(--info)' }
  if (to === 'Yetkazilmoqda') return { icon: Bike, tone: 'var(--warning)' }
  if (to === 'Yetkazildi') return { icon: PackageCheck, tone: 'var(--success, var(--brand))' }
  if (to === 'Bekor qilingan' || to === 'Rad etildi') return { icon: Ban, tone: 'var(--danger)' }
  return { icon: CircleDot, tone: 'var(--muted)' }
}

const time = (at: string) => {
  const d = new Date(at)
  return Number.isFinite(d.getTime())
    ? d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—'
}

/**
 * Buyurtma ichidagi vaqt chizig'i — kim, qachon, nima qildi (24-band).
 *
 * Holat o'zgarishlari `orders/{id}/history` dan (server har o'zgarishda
 * yozadi), qolganlari buyurtmaning o'z maydonlaridan: yaratilgan vaqt,
 * «yetib keldim», muammo tugmalari va mijoz bahosi.
 */
export function OrderTimeline({ order }: { order: AdminOrder }) {
  const history = useOrderHistory(order.id)
  const extra = order as AdminOrder & {
    arrivedAt?: string | null
    courierRating?: { stars?: number; comment?: string; at?: string } | null
  }

  const events: Event[] = []
  if (order.createdAt) {
    events.push({
      at: order.createdAt, icon: ShoppingBag, tone: 'var(--brand)', title: 'Buyurtma berildi',
      note: order.customer?.name || undefined,
    })
  }
  for (const h of history) {
    const who = h.by?.name ? `${h.by.name}${h.by.role ? ` (${ROLE[h.by.role] ?? h.by.role})` : ''}` : undefined
    events.push({ at: h.at, ...statusEvent(h.to), title: h.to, note: who })
  }
  if (extra.arrivedAt) events.push({ at: extra.arrivedAt, icon: DoorOpen, tone: 'var(--gold, #d99b0f)', title: 'Kuryer eshik oldida' })
  for (const p of order.problems ?? []) {
    events.push({ at: p.at, icon: AlertTriangle, tone: 'var(--danger)', title: PROBLEM[p.code] ?? 'Muammo' })
  }
  if (extra.courierRating?.at && extra.courierRating.stars) {
    events.push({
      at: extra.courierRating.at, icon: Star, tone: 'var(--gold, #d99b0f)',
      title: `Mijoz bahosi: ${'★'.repeat(extra.courierRating.stars)}`,
      note: extra.courierRating.comment || undefined,
    })
  }
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))

  return (
    <section>
      <p className="adm-label">Tarix</p>
      <ol className="adm-timeline">
        {events.map((e, i) => (
          <li key={`${e.at}-${i}`} className="adm-timeline__item" style={{ ['--c' as string]: e.tone, animationDelay: `${i * 50}ms` }}>
            <span className="adm-timeline__dot"><e.icon size={13} /></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <b className="text-sm">{e.title}</b>
                <span className="shrink-0 text-[11px]" style={{ color: 'var(--faint)' }}>{time(e.at)}</span>
              </div>
              {e.note && <p className="truncate text-xs" style={{ color: 'var(--muted)' }}>{e.note}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
