import {
  AlertTriangle, CheckCircle2, ChevronDown, Clock, Loader2, RefreshCw, Search, Send, XCircle,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatPrice } from '../../data'
import { datedNumber } from '../../utils/order-label'
import { apiPost } from '../lib/api'
import { useOrders, type AdminOrder } from '../lib/live'
import { StatusBadge } from '../components/StatusBadge'
import { useToast } from '../components/Toast'

/** Buyurtmadagi Linko belgisi — server yozadi (api/_lib/actions/linko-orders.ts). */
type LinkoMark = {
  orderId?: number | null
  marketId?: number | null
  status?: string
  syncedAt?: string
  at?: string
  error?: string | null
  skipped?: string[]
}

/** MUSA holati → Linko'da bo'lishi kerak bo'lgan holat (server bilan bir xil). */
const EXPECTED: Record<string, string> = {
  'Yangi': 'not_delivered',
  'Qabul qilindi': 'not_delivered',
  'Yetkazilmoqda': 'given',
  'Yetkazildi': 'delivered',
  'Bekor qilingan': 'cancelled',
  'Rad etildi': 'cancelled',
}

const LINKO_LABEL: Record<string, string> = {
  not_delivered: 'Kutilmoqda',
  given: 'Topshirildi (yo‘lda)',
  delivered: 'Yetkazildi',
  cancelled: 'Bekor qilingan',
}

type State = 'ok' | 'error' | 'missing' | 'stale'
type Filter = 'all' | State

function stateOf(order: AdminOrder): State {
  const l = (order as AdminOrder & { linko?: LinkoMark }).linko
  if (!l) return 'missing'
  if (l.error) return 'error'
  if (!l.orderId) return 'missing'
  if (l.status !== EXPECTED[order.status]) return 'stale'
  return 'ok'
}

const STATE_META: Record<State, { label: string; tone: string; icon: typeof CheckCircle2 }> = {
  ok: { label: 'Linko bilan bir xil', tone: 'var(--brand)', icon: CheckCircle2 },
  error: { label: 'Xato', tone: 'var(--danger)', icon: XCircle },
  missing: { label: 'Yuborilmagan', tone: 'var(--muted)', icon: Clock },
  stale: { label: 'Holati farq qiladi', tone: 'var(--warning)', icon: AlertTriangle },
}

const PERIODS = [
  { days: 1, label: 'Bugun' },
  { days: 7, label: '7 kun' },
  { days: 30, label: '30 kun' },
] as const

const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'

/**
 * «Linko'ga yuborilganlar» — har buyurtma Linko'ga yetib borganmi,
 * Linko'da qaysi raqam va holatda, qachon yuborilgan, xato bo'lsa nima.
 *
 * Ma'lumot buyurtmaning o'zidan (`order.linko`) — jonli: holat
 * o'zgarib Linko'ga ketishi bilan shu yerda yangilanadi. Bog'lanmagan
 * mahsulotlar (Linko'ga ketmagan qatorlar) ham ko'rsatiladi.
 */
export function LinkoOrdersPage() {
  const [days, setDays] = useState<number>(7)
  const { orders, loading } = useOrders(undefined, days)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const { show, node: toast } = useToast()

  const counts = useMemo(() => {
    const map: Record<Filter, number> = { all: orders.length, ok: 0, error: 0, missing: 0, stale: 0 }
    for (const o of orders) map[stateOf(o)]++
    return map
  }, [orders])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return orders.filter((o) => {
      if (filter !== 'all' && stateOf(o) !== filter) return false
      if (!needle) return true
      const l = (o as AdminOrder & { linko?: LinkoMark }).linko
      return (
        o.orderNumber.toLowerCase().includes(needle) ||
        String(l?.orderId ?? '').includes(needle) ||
        (o.customer?.name || '').toLowerCase().includes(needle) ||
        (o.customer?.phone || '').includes(needle)
      )
    })
  }, [orders, filter, query])

  const resend = async (order: AdminOrder) => {
    setBusy(order.id)
    try {
      const result = await apiPost<{ ok: boolean; error?: string; linkoOrderId?: number }>('action', {
        action: 'order.linkoPush',
        orderId: order.id,
      })
      if (result.ok) show(`${datedNumber(order.orderNumber, order.orderDay)} Linko’ga yuborildi (№${result.linkoOrderId})`)
      else show(result.error || 'Yuborilmadi', 'error')
    } catch (err) {
      show(err instanceof Error ? err.message : 'Yuborilmadi', 'error')
    } finally {
      setBusy(null)
    }
  }

  const checkAll = async () => {
    setBusy('all')
    try {
      const r = await apiPost<{ sent?: number; failed?: number; skipped?: number | string }>('action', {
        action: 'linko.pushOrders',
        days,
      })
      show(`${r.sent ?? 0} ta yuborildi, ${r.failed ?? 0} ta xato, ${typeof r.skipped === 'number' ? r.skipped : 0} ta o‘zgarmagan`)
    } catch (err) {
      show(err instanceof Error ? err.message : 'Tekshirib bo‘lmadi', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="adm-page-head">
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((p) => (
            <button key={p.days} className={'adm-chip ' + (days === p.days ? 'active' : '')} onClick={() => setDays(p.days)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="adm-page-head__actions">
          <button className="adm-btn adm-btn--primary" onClick={checkAll} disabled={busy === 'all'}>
            {busy === 'all' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Hammasini tekshirish
          </button>
        </div>
      </div>

      {/* Umumiy holat — kartani bosish filtrlaydi */}
      <div className="lko-stats">
        {(['all', 'ok', 'stale', 'error', 'missing'] as Filter[]).map((key) => {
          const meta = key === 'all' ? { label: 'Jami buyurtma', tone: 'var(--ink)', icon: Send } : STATE_META[key]
          return (
            <button
              key={key}
              className={'lko-stat ' + (filter === key ? 'is-on' : '')}
              style={{ ['--c' as string]: meta.tone }}
              onClick={() => setFilter(key)}
            >
              <meta.icon size={16} />
              <b>{counts[key]}</b>
              <span>{meta.label}</span>
            </button>
          )
        })}
      </div>

      <div className="relative mt-3">
        <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--faint)' }} />
        <input
          className="adm-input icon-left"
          placeholder="Buyurtma raqami, Linko №, mijoz yoki telefon…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="mt-4 grid gap-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="adm-skeleton h-16" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="adm-card adm-empty mt-4">
          <Send size={30} />
          <p className="text-sm font-semibold">Bu davrda buyurtma topilmadi</p>
        </div>
      ) : (
        <div className="mt-4 grid gap-2.5">
          {visible.map((order) => {
            const l = (order as AdminOrder & { linko?: LinkoMark }).linko
            const state = stateOf(order)
            const meta = STATE_META[state]
            const open = openId === order.id
            const skipped = l?.skipped ?? []
            return (
              <article key={order.id} className={'adm-card lko-row ' + (open ? 'is-open' : '')} style={{ ['--c' as string]: meta.tone }}>
                <button className="lko-row__main" onClick={() => setOpenId(open ? null : order.id)} aria-expanded={open}>
                  <span className="lko-row__state" title={meta.label}><meta.icon size={17} /></span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <b className="text-sm">{datedNumber(order.orderNumber, order.orderDay)}</b>
                      <StatusBadge status={order.status} />
                      {l?.orderId ? (
                        <span className="lko-pill">Linko №{l.orderId}</span>
                      ) : null}
                      {l?.status && <span className="lko-pill lko-pill--soft">{LINKO_LABEL[l.status] ?? l.status}</span>}
                    </span>
                    <span className="mt-0.5 block truncate text-xs" style={{ color: 'var(--muted)' }}>
                      {order.customer?.name || '—'} · {formatPrice(order.total)} · {when(order.createdAt)}
                    </span>
                    {l?.error && <span className="mt-1 block text-xs font-semibold" style={{ color: 'var(--danger)' }}>{l.error}</span>}
                    {state === 'stale' && (
                      <span className="mt-1 block text-xs font-semibold" style={{ color: 'var(--warning)' }}>
                        Linko’da «{LINKO_LABEL[l?.status ?? ''] ?? l?.status}», bo‘lishi kerak — «{LINKO_LABEL[EXPECTED[order.status]]}». Keyingi avtomatik tekshiruvda to‘g‘rilanadi.
                      </span>
                    )}
                  </span>
                  <ChevronDown size={17} className="lko-row__chev" />
                </button>

                {open && (
                  <div className="lko-row__body">
                    <dl className="lko-facts">
                      <div><dt>Linko buyurtma</dt><dd>{l?.orderId ? `№${l.orderId}` : '—'}</dd></div>
                      <div><dt>Linko holati</dt><dd>{l?.status ? LINKO_LABEL[l.status] ?? l.status : '—'}</dd></div>
                      <div><dt>Bo‘lishi kerak</dt><dd>{LINKO_LABEL[EXPECTED[order.status]] ?? '—'}</dd></div>
                      <div><dt>Oxirgi yuborilgan</dt><dd>{when(l?.syncedAt ?? l?.at)}</dd></div>
                      <div><dt>Linko mijoz (market)</dt><dd>{l?.marketId ?? '—'}</dd></div>
                      <div><dt>To‘lov</dt><dd>{order.paymentMethod || 'Naqd'}</dd></div>
                    </dl>

                    <p className="adm-label mt-3">Mahsulotlar</p>
                    <ul className="lko-items">
                      {(order.products || []).map((line, i) => {
                        const name = line.product?.name || '—'
                        const missed = skipped.includes(name) || skipped.includes(String(line.product?.id ?? ''))
                        return (
                          <li key={i} className={missed ? 'is-missed' : ''}>
                            <span className="min-w-0 flex-1 truncate">{name}</span>
                            <span className="shrink-0">×{line.quantity}</span>
                            <b className="shrink-0">{formatPrice((line.product?.price || 0) * (line.quantity || 0))}</b>
                            {missed && <span className="lko-miss">Linko’ga bog‘lanmagan — ketmadi</span>}
                          </li>
                        )
                      })}
                    </ul>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button className="adm-btn adm-btn--ghost" onClick={() => void resend(order)} disabled={busy === order.id}>
                        {busy === order.id ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                        Qayta yuborish
                      </button>
                      {skipped.length > 0 && (
                        <span className="text-xs" style={{ color: 'var(--warning)' }}>
                          Bog‘lanmagan mahsulotni «Linko integratsiya» bo‘limida bog‘lang, keyin qayta yuboring.
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
      {toast}
    </>
  )
}
