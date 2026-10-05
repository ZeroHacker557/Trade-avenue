import { FileText, Map as MapIcon, Printer } from 'lucide-react'
import { datedNumber } from '../../utils/order-label'
import { useMemo, useState } from 'react'
import { formatPrice } from '../../data'
import type { AdminOrder } from '../lib/live'
import { Modal } from './Modal'

/**
 * Bir nechta buyurtmani chop etish: nakladnoylar (har biri alohida
 * sahifada) yoki kuryer uchun bitta marshrut varaqasi.
 *
 * Ro'yxat — Buyurtmalar sahifasida tanlangan davr (bugun, kecha …).
 * Sukut bo'yicha bekor qilinmagan va to'lovi kutilmayotganlar belgilanadi.
 */

const SKIP = new Set(['Bekor qilingan', 'Rad etildi', 'To‘lov kutilmoqda'])
const STATUS_CHIPS = ['Yangi', 'Qabul qilindi', 'Yetkazilmoqda', 'Yetkazildi'] as const

export function PrintOrdersModal({
  orders, onClose, onWaybills, onRoute,
}: {
  orders: AdminOrder[]
  onClose: () => void
  onWaybills: (orders: AdminOrder[]) => void
  onRoute: (orders: AdminOrder[]) => void
}) {
  const [statuses, setStatuses] = useState<string[]>(['Qabul qilindi', 'Yetkazilmoqda'])
  const [courier, setCourier] = useState('')
  const couriers = useMemo(
    () => [...new Set(orders.map((o) => o.courierName).filter((n): n is string => Boolean(n)))],
    [orders],
  )
  const pool = orders.filter((o) =>
    !SKIP.has(o.status) &&
    (!statuses.length || statuses.includes(o.status)) &&
    (!courier || (courier === '—' ? !o.courierName : o.courierName === courier)))
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set())
  const chosen = pool.filter((o) => !unchecked.has(o.id))
  const sum = chosen.reduce((s, o) => s + (o.total || 0), 0)

  const flip = (id: string) => {
    const next = new Set(unchecked)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setUnchecked(next)
  }

  return (
    <Modal
      wide
      title="Chop etish"
      onClose={onClose}
      footer={
        <>
          <button className="adm-btn adm-btn--ghost flex-1" onClick={() => onRoute(chosen)} disabled={!chosen.length}>
            <MapIcon size={16} /> Marshrut varaqasi
          </button>
          <button className="adm-btn adm-btn--primary flex-1" onClick={() => onWaybills(chosen)} disabled={!chosen.length}>
            <FileText size={16} /> Nakladnoylar ({chosen.length})
          </button>
        </>
      }
    >
      <p className="adm-label">Holati</p>
      <div className="flex flex-wrap gap-1.5">
        {STATUS_CHIPS.map((s) => (
          <button
            key={s}
            type="button"
            className={'adm-chip ' + (statuses.includes(s) ? 'active' : '')}
            onClick={() => setStatuses(statuses.includes(s) ? statuses.filter((x) => x !== s) : [...statuses, s])}
          >
            {s}
          </button>
        ))}
      </div>
      {couriers.length > 0 && (
        <>
          <p className="adm-label mt-3">Kuryer</p>
          <select className="adm-input" value={courier} onChange={(e) => setCourier(e.target.value)}>
            <option value="">Hammasi</option>
            {couriers.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value="—">Kuryer biriktirilmagan</option>
          </select>
        </>
      )}

      <div className="mt-3 flex items-center justify-between text-xs" style={{ color: 'var(--muted)' }}>
        <span>{chosen.length} / {pool.length} ta tanlangan · {formatPrice(sum)}</span>
        <span className="flex gap-3">
          <button type="button" className="adm-link" onClick={() => setUnchecked(new Set())}>Hammasi</button>
          <button type="button" className="adm-link" onClick={() => setUnchecked(new Set(pool.map((o) => o.id)))}>Hech biri</button>
        </span>
      </div>
      <div className="adm-picklist" style={{ maxHeight: '46vh' }}>
        {pool.map((o) => (
          <label key={o.id}>
            <input type="checkbox" checked={!unchecked.has(o.id)} onChange={() => flip(o.id)} />
            <span className="truncate"><b>{datedNumber(o.orderNumber, o.orderDay)}</b> · {o.customer?.name || '—'} · {o.customer?.address || ''}</span>
            <small>{formatPrice(o.total)}</small>
          </label>
        ))}
        {pool.length === 0 && (
          <p className="p-3 text-sm" style={{ color: 'var(--muted)' }}>
            Tanlangan davr va holatda buyurtma yo‘q. Yuqoridan boshqa kunni yoki holatni tanlang.
          </p>
        )}
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-xs" style={{ color: 'var(--faint)' }}>
        <Printer size={12} /> Rekvizitlar: Sozlamalar → Kompaniya rekvizitlari. Telefondan «PDF saqlash» ham mumkin.
      </p>
    </Modal>
  )
}
