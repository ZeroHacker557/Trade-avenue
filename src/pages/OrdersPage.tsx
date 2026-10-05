import { useMemo, useState } from 'react'
import { datedNumber } from '../utils/order-label'
import { ChevronRight, ExternalLink, RotateCcw, ShoppingBag } from 'lucide-react'
import { formatPrice } from '../data'
import { openBotDeepLink } from '../utils/telegram'
import { formatOrderDate } from '../utils/date'
import { BRAND } from '../config/brand'
import { PageHeader } from '../components/layout/PageHeader'
import { OrderListSkeleton } from '../components/ui/LoadingSkeletons'
import { useT, type TranslationKey } from '../i18n'
import type { Order, OrderStatus } from '../types/domain'


const TABS: { id: string; labelKey: TranslationKey }[] = [
  { id: 'all', labelKey: 'orders.tabAll' },
  { id: 'new', labelKey: 'orders.tabNew' },
  { id: 'accepted', labelKey: 'orders.tabAccepted' },
  { id: 'cancelled', labelKey: 'orders.tabCancelled' },
]

function statusColor(status: string): string {
  if (status === 'Bekor qilingan' || status === 'Rad etildi') return 'var(--danger)'
  if (status === 'Yetkazilmoqda') return 'var(--warning)'
  if (status === 'Yetkazildi') return 'var(--success)'
  if (status === 'Qabul qilindi') return 'var(--info)'
  return 'var(--brand)'
}

type Props = {
  orders: Order[]
  /** Buyurtmalarning birinchi javobi keldimi — kelguncha skelet. */
  ordersReady: boolean
  authReady: boolean
  isAuthenticated: boolean
  onSearch: () => void
  /** Tepadagi yurak — savat pastdagi menyuga ko'chgan. */
  onFavorites: () => void
  onGoToCatalog: () => void
  /** Kartochka bosilganda chek sahifasi ochiladi. */
  onOpenReceipt: (order: Order) => void
  /** «Qayta buyurtma» — mahsulotlar savatga solinadi. */
  onReorder: (order: Order) => void
  onBack: () => void
}

/** Mijoz faqat shu statuslardagi buyurtmani bekor qila oladi. */
export function OrdersPage({
  orders, ordersReady, authReady, isAuthenticated, onSearch, onFavorites,
  onGoToCatalog, onOpenReceipt, onReorder, onBack,
}: Props) {
  const t = useT()
  const [active, setActive] = useState('all')

  const filtered = useMemo(() => {
    if (active === 'all') return orders
    if (active === 'cancelled') {
      return orders.filter((o) => o.status === 'Bekor qilingan' || o.status === 'Rad etildi')
    }
    if (active === 'new') return orders.filter((o) => o.status === 'Yangi')
    return orders.filter(
      (o) => o.status === 'Qabul qilindi' || o.status === 'Yetkazilmoqda' || o.status === 'Yetkazildi',
    )
  }, [active, orders])

  // Doim eng yangisi tepada — tartiblash tugmasi olib tashlangan
  const shown = filtered
  /*
   * Kirish tugagan-u buyurtmalar hali kelmagan bo'lsa ham yuklanish.
   * Aks holda shu oraliqda «buyurtma yo'q» ko'rinib qolardi.
   */
  const loadingOrders = !authReady || (isAuthenticated && !ordersReady)

  const getPayInfo = (order: Order) => {
    if (order.paymentMethod !== 'Karta') return null
    const s = order.paymentStatus
    if (s === 'Tolangan') return { color: 'var(--success)', bg: 'var(--success-soft)', needsAction: false }
    if (s === 'Rad etildi') return { color: 'var(--danger)', bg: 'var(--danger-soft)', needsAction: true, rejected: true }
    // Chek buyurtma bilan birga yuklangan — admin tekshiryapti, mijozdan hech narsa kerak emas
    return { color: 'var(--warning)', bg: 'var(--warning-soft)', needsAction: !order.receipt?.url, rejected: false }
  }

  const translateStatus = (status: OrderStatus) => t(`status.${status}` as TranslationKey)

  return (
    <>
      <PageHeader
        title={t('orders.title')}
        onBack={onBack}
        onSearch={onSearch}
        onFavorites={onFavorites}
      />

      {/* Tablar */}
      <div
        className="mt-6 flex gap-6 overflow-x-auto border-b px-5 sm:px-10 scrollbar-none"
        style={{ borderColor: 'var(--line)' }}
      >
        {TABS.map(({ id, labelKey }) => (
          <button
            onClick={() => setActive(id)}
            key={id}
            className={'tab whitespace-nowrap ' + (active === id ? 'active' : '')}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      <section className="space-y-4 px-5 pb-32 pt-5 sm:px-10">
        {shown.map((order, i) => {
          const payInfo = getPayInfo(order)

          return (
            <div key={order.id} className="order-card flex-col gap-3" style={{ animationDelay: `${Math.min(i, 6) * 0.06}s` }}>
              <div className="flex cursor-pointer flex-col gap-3" onClick={() => onOpenReceipt(order)}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>
                    {formatOrderDate(order.createdAt) || order.date}
                  </p>
                  <div className="flex items-center gap-1.5">
                    {payInfo && !payInfo.needsAction && (
                      <span
                        className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
                        style={{ background: payInfo.bg, color: payInfo.color }}
                      >
                        {t('orders.paid')}
                      </span>
                    )}
                    <span
                      className="text-[11px] font-bold uppercase tracking-wider"
                      style={{ color: statusColor(order.status) }}
                    >
                      {translateStatus(order.status)}
                    </span>
                  </div>
                </div>

                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[15px] font-extrabold leading-tight" style={{ color: 'var(--ink)' }}>
                      {order.products.map((p) => p.product.name).join(', ')}
                    </h3>
                    <p className="mt-0.5 text-[11px] font-semibold" style={{ color: 'var(--muted)' }}>
                      {t('orders.itemCount', { count: order.products.length })}
                    </p>
                  </div>
                  <p className="shrink-0 text-[15px] font-extrabold" style={{ color: 'var(--ink)' }}>
                    {formatPrice(order.total)}
                  </p>
                </div>

                <div
                  className="flex items-center justify-between border-t pt-2.5"
                  style={{ borderColor: 'var(--line-soft)' }}
                >
                  <p className="text-[11px] font-bold" style={{ color: 'var(--faint)' }}>{datedNumber(order.orderNumber, order.orderDay, order.createdAt)}</p>
                  {/* Yopilgan buyurtma — bir bosishda yana savatga */}
                  {(order.status === 'Yetkazildi' || order.status === 'Bekor qilingan' || order.status === 'Rad etildi') && (
                    <button
                      className="reorder-chip"
                      onClick={(e) => {
                        e.stopPropagation()
                        onReorder(order)
                      }}
                    >
                      <RotateCcw size={12} /> {t('orders.reorder')}
                    </button>
                  )}
                  <div className="flex items-center text-xs font-bold" style={{ color: 'var(--brand)' }}>
                    {t('orders.details')}
                    <ChevronRight size={14} className="ml-1" />
                  </div>
                </div>
              </div>

              {payInfo?.needsAction && (
                <button
                  onClick={() => openBotDeepLink(BRAND.botUsername, `receipt_${order.id}`)}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold transition active:scale-95"
                  style={{
                    background: payInfo.bg,
                    color: payInfo.color,
                    border: `1px solid ${payInfo.color}`,
                  }}
                >
                  <ExternalLink size={15} />
                  {payInfo.rejected ? t('orders.resendReceipt') : t('orders.sendReceipt')}
                </button>
              )}
            </div>
          )
        })}

        {loadingOrders && <OrderListSkeleton />}

        {authReady && !isAuthenticated && (
          <div className="flex flex-col items-center py-20 text-center" style={{ animation: 'fadeInUp 0.4s ease' }}>
            <span
              className="grid size-20 place-items-center rounded-full"
              style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}
            >
              <ShoppingBag size={34} />
            </span>
            <p className="mt-5 text-lg font-bold" style={{ color: 'var(--ink-2)' }}>{t('orders.authFailed')}</p>
            <p className="mt-2 max-w-[280px] text-sm" style={{ color: 'var(--muted)' }}>
              {t('orders.authFailedText')}
            </p>
          </div>
        )}

        {!loadingOrders && isAuthenticated && !shown.length && (
          <div className="flex flex-col items-center py-20 text-center" style={{ animation: 'fadeInUp 0.4s ease' }}>
            <span
              className="grid size-20 place-items-center rounded-full"
              style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}
            >
              <ShoppingBag size={34} />
            </span>
            <p className="mt-5 text-lg font-bold" style={{ color: 'var(--ink-2)' }}>
              {orders.length === 0 ? t('orders.empty') : t('orders.emptyFilter')}
            </p>
            <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
              {orders.length === 0 ? t('orders.emptyText') : t('orders.emptyFilterText')}
            </p>
            {orders.length === 0 && (
              <button onClick={onGoToCatalog} className="btn-ghost mt-6 px-6 py-3">
                {t('cart.goToCatalog')}
              </button>
            )}
          </div>
        )}
      </section>
    </>
  )
}
