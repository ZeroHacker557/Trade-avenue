import { Check, ChevronDown, LogOut, MapPin, Plus, Store, UserRound, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useT } from '../../i18n'
import { hapticFeedback } from '../../utils/telegram'
import type { Shop } from '../../types/domain'

const EXIT_MS = 220

/** Bosh sahifa va profildagi tugma: faol do'kon nomi va manzili. */
export function ShopChip({ shop, onClick }: { shop: Shop; onClick: () => void }) {
  const t = useT()
  return (
    <button className="shop-chip" onClick={onClick} aria-label={t('shop.my')}>
      <span className="shop-chip__icon"><Store size={18} /></span>
      <span className="min-w-0 flex-1 text-left">
        <b className="shop-chip__name">{shop.name}</b>
        <span className="shop-chip__sub">{shop.address || t('shop.noAddress')}</span>
      </span>
      <ChevronDown size={18} className="shrink-0" style={{ color: 'var(--faint)' }} />
    </button>
  )
}

type Props = {
  shops: Shop[]
  activeId: string | null
  onSwitch: (shopId: string) => void
  onAdd: () => void
  /** Xato bo'lsa — matn. */
  onLeave: (shopId: string) => Promise<string | null>
  onClose: () => void
  notify: (message: string) => void
}

/**
 * «Do'konlarim» — filiallar orasida almashish, yangi do'kon qo'shish
 * (kod bilan) va shu do'kondan chiqish.
 */
export function ShopSheet({ shops, activeId, onSwitch, onAdd, onLeave, onClose, notify }: Props) {
  const t = useT()
  const [leaving, setLeaving] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const close = (then?: () => void) => {
    if (leaving) return
    setLeaving(true)
    window.setTimeout(() => {
      onClose()
      then?.()
    }, EXIT_MS)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const active = shops.find((s) => s.id === activeId) ?? shops[0]
  const confirming = confirmId ? shops.find((s) => s.id === confirmId) : null

  return (
    <div className={'ta-sheet ' + (leaving ? 'leaving' : '')} onClick={() => close()} role="dialog" aria-modal="true" aria-label={t('shop.my')}>
      <div className="ta-sheet__card" onClick={(e) => e.stopPropagation()}>
        <div className="ta-sheet__grip" />
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-extrabold" style={{ color: 'var(--ink)' }}>{t('shop.my')}</h3>
          <button className="icon-button" onClick={() => close()} aria-label={t('common.close')}><X size={18} /></button>
        </div>

        {confirming ? (
          <div className="mt-4">
            <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              {t('shop.leaveConfirm', { name: confirming.name })}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button className="btn-ghost py-3" onClick={() => setConfirmId(null)} disabled={busy}>{t('common.cancel')}</button>
              <button
                className="btn-danger py-3"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  const error = await onLeave(confirming.id)
                  setBusy(false)
                  if (error) return notify(error)
                  notify(t('shop.left'))
                  close()
                }}
              >
                <LogOut size={17} /> {t('shop.leave')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <ul className="mt-3 space-y-2">
              {shops.map((shop) => {
                const on = shop.id === active?.id
                return (
                  <li key={shop.id}>
                    <button
                      className={'shop-row' + (on ? ' is-on' : '')}
                      onClick={() => {
                        if (!on) onSwitch(shop.id)
                        close()
                      }}
                      aria-pressed={on}
                    >
                      <span className="shop-row__icon"><Store size={18} /></span>
                      <span className="min-w-0 flex-1 text-left">
                        <b className="block truncate text-sm" style={{ color: 'var(--ink)' }}>{shop.name}</b>
                        <span className="mt-0.5 flex items-center gap-1 truncate text-xs" style={{ color: 'var(--muted)' }}>
                          <MapPin size={12} className="shrink-0" /> {shop.address || t('shop.noAddress')}
                        </span>
                        {shop.agentName && (
                          <span className="mt-0.5 flex items-center gap-1 truncate text-xs" style={{ color: 'var(--faint)' }}>
                            <UserRound size={12} className="shrink-0" /> {t('shop.agent', { name: shop.agentName })}
                          </span>
                        )}
                      </span>
                      {on && <span className="shop-row__check"><Check size={14} strokeWidth={3} /></span>}
                    </button>
                  </li>
                )
              })}
            </ul>

            <button
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed py-3 text-sm font-bold"
              style={{ borderColor: 'var(--line)', color: 'var(--brand)' }}
              onClick={() => {
                hapticFeedback('light')
                close(onAdd)
              }}
            >
              <Plus size={17} /> {t('shop.add')}
            </button>

            {active && (
              <button
                className="mt-2 flex w-full items-center justify-center gap-2 py-3 text-sm font-bold"
                style={{ color: 'var(--danger)' }}
                onClick={() => setConfirmId(active.id)}
              >
                <LogOut size={16} /> {t('shop.leave')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
