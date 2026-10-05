import { Banknote, Check, Clock3, Loader2, Wallet, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatPrice } from '../../data'
import { apiPost } from '../lib/api'
import { useCashHandovers, useHeldCashOrders, type CashHandoverRow } from '../lib/live'
import { useToast } from '../components/Toast'

const when = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const STATUS: Record<CashHandoverRow['status'], { label: string; fg: string; bg: string }> = {
  pending: { label: 'Kutilmoqda', fg: 'var(--gold-strong)', bg: 'var(--gold-soft)' },
  confirmed: { label: 'Qabul qilindi', fg: 'var(--brand)', bg: 'var(--brand-soft)' },
  rejected: { label: 'Rad etildi', fg: 'var(--danger)', bg: 'var(--danger-soft)' },
}

/**
 * Kuryerlar kassasi.
 *
 * Kuryer naqd to'langan buyurtmani yetkazganda pul uning qo'lida qoladi.
 * U ilovada «Kassaga topshirish» bosadi — shu yerda kutilayotgan
 * topshirish paydo bo'ladi. Admin pulni sanab, «Qabul qildim» yoki
 * «Rad etish» bosadi; kuryerga Telegram orqali javob boradi.
 */
export function CashPage() {
  const { handovers, loading } = useCashHandovers()
  const orders = useHeldCashOrders()
  const { show, node: toast } = useToast()
  const [busy, setBusy] = useState<string | null>(null)

  // Har kuryerning qo'lidagi (hali topshirilmagan) naqd puli
  const held = useMemo(() => {
    const map = new Map<string, { name: string; amount: number; count: number }>()
    for (const o of orders) {
      if (o.cashStatus !== 'held' || !o.courierId) continue
      const row = map.get(o.courierId) ?? { name: o.courierName || 'Kuryer', amount: 0, count: 0 }
      row.amount += Number(o.total) || 0
      row.count += 1
      map.set(o.courierId, row)
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount)
  }, [orders])

  const pending = handovers.filter((h) => h.status === 'pending')
  const history = handovers.filter((h) => h.status !== 'pending').slice(0, 30)
  const totalHeld = held.reduce((s, r) => s + r.amount, 0)
  const totalPending = pending.reduce((s, h) => s + h.amount, 0)

  const decide = async (h: CashHandoverRow, accept: boolean) => {
    let note: string | null = null
    if (!accept) {
      note = window.prompt('Rad etish sababi (kuryerga yuboriladi):', '') ?? null
      if (note === null) return
    }
    setBusy(h.id)
    try {
      await apiPost('action', { action: accept ? 'cash.confirm' : 'cash.reject', handoverId: h.id, note })
      show(accept ? `${formatPrice(h.amount)} qabul qilindi` : 'Rad etildi — kuryerga xabar ketdi')
    } catch (error) {
      show(error instanceof Error ? error.message : 'Bajarilmadi', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="adm-card flex items-center gap-3 p-4">
          <span className="adm-cash__icon" style={{ background: 'var(--gold-soft)', color: 'var(--gold)' }}><Wallet size={22} /></span>
          <span>
            <span className="block text-xs font-bold" style={{ color: 'var(--muted)' }}>Kuryerlar qo‘lida</span>
            <b className="block text-2xl font-extrabold">{formatPrice(totalHeld)}</b>
          </span>
        </div>
        <div className="adm-card flex items-center gap-3 p-4">
          <span className="adm-cash__icon" style={{ background: 'var(--royal-soft)', color: 'var(--royal)' }}><Clock3 size={22} /></span>
          <span>
            <span className="block text-xs font-bold" style={{ color: 'var(--muted)' }}>Tasdiq kutmoqda</span>
            <b className="block text-2xl font-extrabold">{formatPrice(totalPending)}</b>
          </span>
        </div>
      </div>

      {/* Kutilayotgan topshirishlar */}
      <section className="adm-card mt-4 p-4">
        <h2 className="text-base font-extrabold">Topshirishlar — tasdiqlang</h2>
        {loading ? (
          <div className="grid place-items-center py-8"><Loader2 className="animate-spin" /></div>
        ) : pending.length === 0 ? (
          <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>Hozir kutilayotgan topshirish yo‘q.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {pending.map((h) => (
              <li key={h.id} className="adm-cash__row">
                <span className="min-w-0 flex-1">
                  <b className="block text-sm">{h.courierName} — {formatPrice(h.amount)}</b>
                  <span className="block truncate text-xs" style={{ color: 'var(--muted)' }}>
                    {when(h.createdAt)} · {h.orderNumbers.length} ta buyurtma: {h.orderNumbers.join(', ')}
                  </span>
                </span>
                <button className="adm-btn adm-btn--danger" disabled={busy !== null} onClick={() => decide(h, false)}>
                  <X size={15} /> <span className="hidden sm:inline">Rad etish</span>
                </button>
                <button className="adm-btn adm-btn--primary" disabled={busy !== null} onClick={() => decide(h, true)}>
                  {busy === h.id ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Qabul qildim
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Kim qancha ushlab turibdi */}
      <section className="adm-card mt-4 p-4">
        <h2 className="text-base font-extrabold">Kuryerlar qo‘lidagi naqd</h2>
        {held.length === 0 ? (
          <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>Hamma naqd kassaga topshirilgan.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {held.map((r) => (
              <li key={r.name} className="adm-cash__row">
                <Banknote size={18} style={{ color: 'var(--gold)' }} />
                <b className="min-w-0 flex-1 truncate text-sm">{r.name}</b>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>{r.count} ta buyurtma</span>
                <b className="text-sm">{formatPrice(r.amount)}</b>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Tarix */}
      {history.length > 0 && (
        <section className="adm-card mt-4 p-4">
          <h2 className="text-base font-extrabold">Tarix</h2>
          <ul className="mt-3 grid gap-2">
            {history.map((h) => (
              <li key={h.id} className="adm-cash__row">
                <span className="min-w-0 flex-1">
                  <b className="block text-sm">{h.courierName} — {formatPrice(h.amount)}</b>
                  <span className="block truncate text-xs" style={{ color: 'var(--muted)' }}>
                    {when(h.createdAt)} · {h.orderNumbers.length} ta buyurtma
                    {h.decidedBy ? ` · ${h.decidedBy}` : ''}{h.note ? ` · «${h.note}»` : ''}
                  </span>
                </span>
                <span className="adm-badge" style={{ background: STATUS[h.status].bg, color: STATUS[h.status].fg }}>
                  {STATUS[h.status].label}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {toast}
    </>
  )
}
