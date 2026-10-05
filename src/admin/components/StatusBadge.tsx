import type { OrderStatus } from '../../types/domain'

/** Har holatning o'z rangi — ro'yxatni ko'zdan kechirganda darhol ajraladi. */
const TONE: Record<OrderStatus, { fg: string; bg: string }> = {
  'Yangi': { fg: 'var(--info)', bg: 'var(--info-soft)' },
  'Qabul qilindi': { fg: 'var(--royal)', bg: 'var(--royal-soft)' },
  'Yetkazilmoqda': { fg: 'var(--gold)', bg: 'var(--gold-soft)' },
  'Yetkazildi': { fg: 'var(--brand)', bg: 'var(--brand-soft)' },
  'Bekor qilingan': { fg: 'var(--muted)', bg: 'var(--surface-3)' },
  'Rad etildi': { fg: 'var(--danger)', bg: 'var(--danger-soft)' },
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  const tone = TONE[status] ?? TONE['Yangi']
  return (
    <span className="adm-badge" style={{ background: tone.bg, color: tone.fg }}>
      {status}
    </span>
  )
}
