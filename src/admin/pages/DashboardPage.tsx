import {
  Clock, Package, ShoppingBag, TrendingDown, TrendingUp, Users, Wallet,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { datedNumber } from '../../utils/order-label'
import { formatPrice } from '../../data'
import { useCustomers, useOrders, useProducts, type AdminOrder } from '../lib/live'
import { StatusBadge } from '../components/StatusBadge'
import { MiniBarChart } from '../components/MiniBarChart'

/** Bekor qilingan va rad etilgan buyurtmalar tushumga kirmaydi. */
const REVENUE_STATUSES = new Set(['Yangi', 'Qabul qilindi', 'Yetkazilmoqda', 'Yetkazildi'])

function dayKey(iso: string): string {
  return (iso || '').slice(0, 10)
}

/**
 * Raqam sanab o'sadi (0 → qiymat, keyin eski → yangi). Qiymat jonli
 * o'zgarsa (yangi buyurtma) — ko'zga tashlanadi. «Harakatni kamaytirish»
 * yoqilgan bo'lsa — darhol.
 */
function useCountUp(target: number, duration = 800): number {
  const [shown, setShown] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const start = performance.now()
    const begin = from.current
    let frame = 0
    const step = (now: number) => {
      const k = reduce ? 1 : Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - k) ** 3
      const value = begin + (target - begin) * eased
      setShown(value)
      from.current = value
      if (k < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target, duration])
  return shown
}

/**
 * 7 kunlik egri chiziq — kartaning pastki qismida, butun kenglik bo'ylab.
 * Ilgari belgi bilan bir burchakda turib uning ustiga chiqib qolardi.
 * Kenglik kartaga cho'ziladi (`preserveAspectRatio="none"`), chiziq
 * qalinligi esa o'zgarmaydi (`non-scaling-stroke`).
 */
function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(1, ...values)
  const w = 100
  const h = 34
  const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * w, h - 4 - (v / max) * (h - 10)])
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const id = `spark-${color.replace(/[^a-z0-9]/gi, '')}`
  return (
    <svg className="adm-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.22 }} />
          <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#${id})`} />
      <path
        className="adm-spark__line"
        d={line}
        fill="none"
        style={{ stroke: color }}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

function StatCard({
  label, value, format = (n) => String(Math.round(n)), icon: Icon, tone, delay, delta, spark,
}: {
  label: string
  value: number
  format?: (n: number) => string
  icon: typeof ShoppingBag
  tone: { fg: string; bg: string }
  delay: number
  /** Kechagi kunga nisbatan, foiz (null — solishtirib bo'lmaydi). */
  delta?: number | null
  spark?: number[]
}) {
  const shown = useCountUp(value)
  return (
    <div className={'adm-card adm-stat' + (spark ? ' has-spark' : '')} style={{ animationDelay: `${delay}ms` }}>
      <span className="adm-stat__icon" style={{ background: tone.bg, color: tone.fg }}>
        <Icon size={18} />
      </span>
      {spark && <Sparkline values={spark} color={tone.fg} />}
      <p className="adm-stat__label">{label}</p>
      <p className="adm-stat__value">{format(shown)}</p>
      {delta !== undefined && delta !== null && (
        <p className={'adm-stat__delta ' + (delta >= 0 ? 'is-up' : 'is-down')}>
          {delta >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {delta >= 0 ? '+' : ''}{delta}% <span>kechagidan</span>
        </p>
      )}
    </div>
  )
}

/** Kechagidan o'zgarish, foiz. Kecha 0 bo'lsa — solishtirilmaydi. */
function change(now: number, before: number): number | null {
  if (!before) return null
  return Math.round(((now - before) / before) * 100)
}

export function DashboardPage({ courierId }: { courierId?: string }) {
  const { orders, loading } = useOrders(courierId)
  const { customers } = useCustomers()
  const { products } = useProducts()

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const paid = orders.filter((o) => REVENUE_STATUSES.has(o.status))

    const revenue = paid.reduce((sum, o) => sum + (Number(o.total) || 0), 0)
    const todayOrders = orders.filter((o) => dayKey(o.createdAt) === today)
    const todayRevenue = todayOrders
      .filter((o) => REVENUE_STATUSES.has(o.status))
      .reduce((sum, o) => sum + (Number(o.total) || 0), 0)

    // Kecha — «kechagidan +12%» uchun
    const yesterdayDate = new Date()
    yesterdayDate.setDate(yesterdayDate.getDate() - 1)
    const yesterday = yesterdayDate.toISOString().slice(0, 10)
    const yesterdayOrders = orders.filter((o) => dayKey(o.createdAt) === yesterday)
    const yesterdayRevenue = yesterdayOrders
      .filter((o) => REVENUE_STATUSES.has(o.status))
      .reduce((sum, o) => sum + (Number(o.total) || 0), 0)

    // Oxirgi 14 kunlik tushum — grafik uchun
    const days: { label: string; value: number }[] = []
    const dayCounts: number[] = []
    for (let i = 13; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const key = date.toISOString().slice(0, 10)
      const value = paid
        .filter((o) => dayKey(o.createdAt) === key)
        .reduce((sum, o) => sum + (Number(o.total) || 0), 0)
      days.push({ label: key.slice(8), value })
      dayCounts.push(orders.filter((o) => dayKey(o.createdAt) === key).length)
    }

    // Eng ko'p sotilgan mahsulotlar
    const counter = new Map<string, { name: string; qty: number; sum: number }>()
    for (const order of paid) {
      for (const line of order.products || []) {
        const name = line.product?.name || 'Nomsiz'
        const entry = counter.get(name) || { name, qty: 0, sum: 0 }
        entry.qty += line.quantity || 0
        entry.sum += (line.product?.price || 0) * (line.quantity || 0)
        counter.set(name, entry)
      }
    }
    const top = [...counter.values()].sort((a, b) => b.qty - a.qty).slice(0, 5)

    return {
      revenue,
      todayRevenue,
      todayCount: todayOrders.length,
      revenueDelta: change(todayRevenue, yesterdayRevenue),
      countDelta: change(todayOrders.length, yesterdayOrders.length),
      revenueSpark: days.slice(-7).map((d) => d.value),
      countSpark: dayCounts.slice(-7),
      total: orders.length,
      pending: orders.filter((o) => o.status === 'Yangi').length,
      inProgress: orders.filter(
        (o) => o.status === 'Qabul qilindi' || o.status === 'Yetkazilmoqda',
      ).length,
      days,
      top,
      average: paid.length ? Math.round(revenue / paid.length) : 0,
    }
  }, [orders])

  const recent: AdminOrder[] = orders.slice(0, 6)

  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="adm-skeleton h-24" />
        ))}
      </div>
    )
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Bugungi tushum"
          value={stats.todayRevenue}
          format={(n) => formatPrice(Math.round(n))}
          icon={Wallet}
          tone={{ fg: 'var(--brand)', bg: 'var(--brand-soft)' }}
          delay={0}
          delta={stats.revenueDelta}
          spark={stats.revenueSpark}
        />
        <StatCard
          label="Bugungi buyurtmalar"
          value={stats.todayCount}
          icon={ShoppingBag}
          tone={{ fg: 'var(--royal)', bg: 'var(--royal-soft)' }}
          delay={40}
          delta={stats.countDelta}
          spark={stats.countSpark}
        />
        <StatCard
          label="Yangi — javob kutmoqda"
          value={stats.pending}
          icon={Clock}
          tone={{ fg: 'var(--warning)', bg: 'var(--warning-soft)' }}
          delay={80}
        />
        <StatCard
          label="Tushum · 30 kun"
          value={stats.revenue}
          format={(n) => formatPrice(Math.round(n))}
          icon={TrendingUp}
          tone={{ fg: 'var(--brand)', bg: 'var(--brand-soft)' }}
          delay={120}
        />
        <StatCard
          label="Mijozlar"
          value={customers.length}
          icon={Users}
          tone={{ fg: 'var(--info)', bg: 'var(--info-soft)' }}
          delay={160}
        />
        <StatCard
          label="Mahsulotlar"
          value={products.length}
          icon={Package}
          tone={{ fg: 'var(--gold)', bg: 'var(--gold-soft)' }}
          delay={200}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <section className="adm-card p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-base font-extrabold">Oxirgi 14 kun</h2>
            <p className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
              O‘rtacha chek: {formatPrice(stats.average)}
            </p>
          </div>
          <MiniBarChart data={stats.days} />
        </section>

        <section className="adm-card p-4 sm:p-5">
          <h2 className="text-base font-extrabold">Eng ko‘p sotilganlar</h2>
          {stats.top.length === 0 ? (
            <p className="mt-4 text-sm" style={{ color: 'var(--muted)' }}>
              Hali sotuv yo‘q.
            </p>
          ) : (
            <ol className="mt-3 flex flex-col gap-2.5">
              {stats.top.map((item, i) => (
                <li key={item.name} className="flex items-center gap-3">
                  <span
                    className="grid size-7 shrink-0 place-items-center rounded-lg text-xs font-extrabold"
                    style={{
                      background: i === 0 ? 'var(--gold-soft)' : 'var(--surface-2)',
                      color: i === 0 ? 'var(--gold)' : 'var(--muted)',
                    }}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.name}</span>
                  <span className="shrink-0 text-sm font-extrabold">{item.qty} dona</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className="adm-card mt-4 overflow-hidden">
        <h2 className="px-4 pt-4 text-base font-extrabold sm:px-5">Oxirgi buyurtmalar</h2>
        {recent.length === 0 ? (
          <div className="adm-empty">
            <ShoppingBag size={30} />
            <p className="text-sm font-semibold">Hozircha buyurtma yo‘q</p>
          </div>
        ) : (
          <div className="adm-table-wrap mt-3">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Raqam</th>
                  <th>Mijoz</th>
                  <th>Summa</th>
                  <th>Holat</th>
                  <th>Sana</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((order) => (
                  <tr key={order.id}>
                    <td className="font-extrabold">{datedNumber(order.orderNumber, order.orderDay)}</td>
                    <td>{order.customer?.name || '—'}</td>
                    <td className="font-bold">{formatPrice(order.total)}</td>
                    <td>
                      <StatusBadge status={order.status} />
                    </td>
                    <td style={{ color: 'var(--muted)' }}>
                      {order.createdAt ? new Date(order.createdAt).toLocaleString('ru-RU') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
