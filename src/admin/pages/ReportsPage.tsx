import {
  ArrowDownRight, ArrowUpRight, Ban, Download, Package, Receipt, ShoppingBag, TrendingUp, UserPlus, Wallet,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatPrice } from '../../data'
import { useOrders, useProducts } from '../lib/live'
import { buildReport, dayKey, dayLabel, reportSheets, type Period } from '../lib/reports'
import { downloadWorkbook } from '../lib/xlsx'
import { MiniBarChart } from '../components/MiniBarChart'
import { useToast } from '../components/Toast'

type Preset = 'today' | 'yesterday' | '7' | '30' | 'month' | 'lastMonth' | 'custom'

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today', label: 'Bugun' },
  { key: 'yesterday', label: 'Kecha' },
  { key: '7', label: '7 kun' },
  { key: '30', label: '30 kun' },
  { key: 'month', label: 'Shu oy' },
  { key: 'lastMonth', label: 'O‘tgan oy' },
  { key: 'custom', label: 'Sana tanlash' },
]

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

function periodOf(preset: Preset, from: string, to: string, base: number): Period {
  const today = startOfDay(new Date(base))
  switch (preset) {
    case 'today': return { from: today, to: addDays(today, 1) }
    case 'yesterday': return { from: addDays(today, -1), to: today }
    case '7': return { from: addDays(today, -6), to: addDays(today, 1) }
    case '30': return { from: addDays(today, -29), to: addDays(today, 1) }
    case 'month': return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: addDays(today, 1) }
    case 'lastMonth': return { from: new Date(today.getFullYear(), today.getMonth() - 1, 1), to: new Date(today.getFullYear(), today.getMonth(), 1) }
    default: {
      const a = from ? new Date(`${from}T00:00`) : today
      const b = to ? new Date(`${to}T00:00`) : today
      const [start, end] = a <= b ? [a, b] : [b, a]
      return { from: start, to: addDays(end, 1) }
    }
  }
}

/**
 * Hisobotlar: tushum, buyurtmalar, eng ko'p sotilganlar, kategoriyalar,
 * kuryerlar, to'lov turlari, soatlar bo'yicha — va hammasi bitta
 * tugma bilan tartibli Excel faylga.
 */
export function ReportsPage() {
  const { products } = useProducts()
  const { show, node: toast } = useToast()

  const [now] = useState(() => Date.now())
  const [preset, setPreset] = useState<Preset>('30')
  const [from, setFrom] = useState(() => dayKey(addDays(new Date(now), -6)))
  const [to, setTo] = useState(() => dayKey(new Date(now)))

  const period = useMemo(() => periodOf(preset, from, to, now), [preset, from, to, now])
  // Faqat tanlangan davr boshidan beri — butun tarix yuklanmaydi
  const days = Math.max(1, Math.ceil((startOfDay(new Date(now)).getTime() - period.from.getTime()) / 86_400_000) + 1)
  const { orders, loading } = useOrders(undefined, days)
  const report = useMemo(() => buildReport(orders, products, period), [orders, products, period])
  const periodText = `${dayLabel(period.from)} — ${dayLabel(addDays(period.to, -1))}`

  const exportExcel = () => {
    const name = `MUSA-hisobot-${dayKey(period.from)}_${dayKey(addDays(period.to, -1))}.xlsx`
    downloadWorkbook(name, reportSheets(report))
    show('Hisobot Excel faylga yuklab olindi')
  }

  const maxHour = Math.max(1, ...report.hours.map((h) => h.orders))
  const busiest = report.hours.reduce((best, h) => (h.orders > best.orders ? h : best), report.hours[0])

  return (
    <>
      <div className="adm-page-head">
        <div className="scrollbar-none flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
          {PRESETS.map((p) => (
            <button key={p.key} type="button" className={'adm-chip shrink-0 ' + (preset === p.key ? 'active' : '')} onClick={() => setPreset(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="adm-page-head__actions">
          <button className="adm-btn adm-btn--primary" onClick={exportExcel} disabled={loading}>
            <Download size={16} /> Excel yuklab olish
          </button>
        </div>
      </div>

      {preset === 'custom' && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor="report-from" style={{ color: 'var(--muted)' }}>Dan</label>
          <input id="report-from" type="date" className="adm-input w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
          <label htmlFor="report-to" style={{ color: 'var(--muted)' }}>gacha</label>
          <input id="report-to" type="date" className="adm-input w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      )}

      <p className="mb-3 text-sm" style={{ color: 'var(--muted)' }}>
        Davr: <b style={{ color: 'var(--ink)' }}>{periodText}</b> · {report.orders.length} ta buyurtma
      </p>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="adm-skeleton h-24" />)}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Tushum" value={formatPrice(report.revenue)} icon={Wallet} tone="brand"
              delta={report.revenueDelta} hint="Oldingi shunday davrga nisbatan" />
            <Stat label="Buyurtmalar" value={String(report.count)} icon={ShoppingBag} tone="info" hint={`${report.delivered} tasi yetkazildi`} />
            <Stat label="O‘rtacha chek" value={formatPrice(report.average)} icon={Receipt} tone="warning" />
            <Stat label="Yangi mijozlar" value={String(report.newCustomers)} icon={UserPlus} tone="brand" hint={`Jami xaridor: ${report.buyers}`} />
            <Stat label="Sotilgan mahsulot" value={`${report.units} dona`} icon={Package} tone="info" />
            <Stat label="Bekor qilingan" value={String(report.cancelled)} icon={Ban} tone="danger" hint={`${report.cancelRate.toFixed(1)}% buyurtmalardan`} />
            <Stat label="Chegirmalar" value={formatPrice(report.promoDiscount + report.actionDiscount)} icon={TrendingUp} tone="warning"
              hint={`Promokod ${formatPrice(report.promoDiscount)} · aksiya ${formatPrice(report.actionDiscount)}`} />
            <Stat label="Yetkazish to‘lovlari" value={formatPrice(report.deliveryIncome)} icon={Wallet} tone="info" />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            {/* min-w-0: grid ustuni ichidagi grafik o'z kengligi bilan ustunni cho'zmasin */}
            <section className="adm-card min-w-0 p-4">
              <h2 className="text-sm font-extrabold">Kunlik tushum</h2>
              {report.days.length > 1 ? (
                <MiniBarChart data={report.days.slice(-31).map((d) => ({ label: d.label.slice(0, 5), hint: d.label, value: d.revenue }))} />
              ) : (
                <p className="mt-6 text-3xl font-extrabold">{formatPrice(report.revenue)}</p>
              )}
            </section>

            <section className="adm-card min-w-0 p-4">
              <h2 className="text-sm font-extrabold">Buyurtmalar soatlar bo‘yicha</h2>
              <div className="adm-hours" role="img" aria-label={`Eng gavjum soat: ${busiest.hour}:00`}>
                {report.hours.map((h) => (
                  <span key={h.hour} title={`${h.hour}:00 — ${h.orders} ta`} style={{ height: `${Math.max(3, (h.orders / maxHour) * 100)}%`, opacity: h.orders ? 1 : 0.35 }} />
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[0.68rem]" style={{ color: 'var(--faint)' }}>
                <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
              </div>
              <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
                {busiest.orders ? <>Eng gavjum vaqt: <b style={{ color: 'var(--ink)' }}>{busiest.hour}:00 – {busiest.hour + 1}:00</b></> : 'Bu davrda buyurtma yo‘q'}
              </p>
            </section>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Table
              title="Eng ko‘p sotilgan mahsulotlar"
              headers={['Mahsulot', 'Dona', 'Tushum', 'Ulushi']}
              rows={report.topProducts.slice(0, 10).map((p) => [p.name, String(p.units), formatPrice(p.revenue), `${p.share.toFixed(1)}%`])}
              empty="Bu davrda sotuv yo‘q"
            />
            <Table
              title="Kategoriyalar"
              headers={['Kategoriya', 'Buyurtma', 'Dona', 'Tushum']}
              rows={report.categories.map((c) => [c.name, String(c.orders), String(c.units), formatPrice(c.revenue)])}
              empty="Bu davrda sotuv yo‘q"
            />
            <Table
              wide
              title="Kuryerlar samaradorligi"
              hint="Vaqt — «Olaman» dan «Yetkazdim» gacha. Vaqtida — mijozga aytilgan vaqtdan kechikmagan (5 daqiqa bardosh bilan)."
              headers={['Kuryer', 'Yetkazdi', 'O‘rt. vaqt', 'Vaqtida', 'Reyting', 'Muammo', 'Naqd', 'Karta']}
              rows={report.couriers.map((c) => [
                c.name,
                String(c.delivered),
                c.avgMinutes === null ? '—' : `${Math.round(c.avgMinutes)} daq`,
                c.onTimeRate === null ? '—' : `${Math.round(c.onTimeRate)}%${c.late ? ` · ${c.late} kech` : ''}`,
                c.rating === null ? '—' : `★ ${c.rating.toFixed(1)} (${c.ratings})`,
                c.problems ? `⚠️ ${c.problems}` : '—',
                formatPrice(c.cash),
                formatPrice(c.card),
              ])}
              empty="Bu davrda yetkazilgan buyurtma yo‘q"
            />
            <Table
              title="To‘lov turlari"
              headers={['To‘lov', 'Buyurtma', 'Tushum']}
              rows={report.payments.map((p) => [p.method, String(p.orders), formatPrice(p.revenue)])}
              empty="—"
            />
          </div>
        </>
      )}
      {toast}
    </>
  )
}

const TONES = {
  brand: { fg: 'var(--brand)', bg: 'var(--brand-soft)' },
  info: { fg: 'var(--info)', bg: 'var(--info-soft)' },
  warning: { fg: 'var(--warning)', bg: 'var(--warning-soft)' },
  danger: { fg: 'var(--danger)', bg: 'var(--danger-soft)' },
}

function Stat({ label, value, icon: Icon, tone, hint, delta }: {
  label: string
  value: string
  icon: typeof Wallet
  tone: keyof typeof TONES
  hint?: string
  delta?: number | null
}) {
  const up = (delta ?? 0) >= 0
  return (
    <div className="adm-card adm-stat">
      <span className="adm-stat__icon" style={{ background: TONES[tone].bg, color: TONES[tone].fg }}><Icon size={18} /></span>
      <p className="adm-stat__label">{label}</p>
      <p className="adm-stat__value">{value}</p>
      {delta !== undefined && delta !== null ? (
        <p className="mt-1 flex items-center gap-1 text-xs font-bold" style={{ color: up ? 'var(--brand)' : 'var(--danger)' }}>
          {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {up ? '+' : ''}{delta.toFixed(1)}%
          <span className="font-medium" style={{ color: 'var(--faint)' }}>{hint}</span>
        </p>
      ) : hint ? (
        <p className="mt-1 truncate text-xs" style={{ color: 'var(--faint)' }}>{hint}</p>
      ) : null}
    </div>
  )
}

function Table({ title, headers, rows, empty, wide = false, hint }: {
  title: string
  headers: string[]
  rows: string[][]
  empty: string
  /** Ustunlari ko'p — ikki ustunli joyni to'liq egallaydi. */
  wide?: boolean
  hint?: string
}) {
  return (
    <section className={'adm-card min-w-0 overflow-hidden ' + (wide ? 'xl:col-span-2' : '')}>
      <h2 className="px-4 pt-4 text-sm font-extrabold">{title}</h2>
      {hint && <p className="px-4 pt-1 text-xs" style={{ color: 'var(--muted)' }}>{hint}</p>}
      {rows.length ? (
        <div className="adm-table-wrap mt-3">
          <table className="adm-table">
            <thead>
              <tr>{headers.map((h, i) => <th key={h} style={i ? { textAlign: 'right' } : undefined}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} style={c ? { textAlign: 'right', fontVariantNumeric: 'tabular-nums' } : { maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 pb-4 pt-2 text-sm" style={{ color: 'var(--muted)' }}>{empty}</p>
      )}
    </section>
  )
}
