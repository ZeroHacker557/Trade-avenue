import {
  Banknote, BadgeCheck, ChevronRight, Clock3, CreditCard, Headset, Languages, Loader2, PackageCheck, Store,
  UserRound, Wallet,
} from 'lucide-react'
import { useState } from 'react'
import { datedNumber } from '../utils/order-label'
import { formatPrice } from '../data'
import { useI18n, type TranslationKey } from '../i18n'
import { PageTitle } from '../components/layout/PageTitle'
import { formatOrderDate } from '../utils/date'
import { getTelegramUser, hapticSelection } from '../utils/telegram'
import { updateUserProfile } from '../lib/firebase'
import { auth } from '../lib/auth'
import type { CashHandover, CourierOrder, CourierOverview } from './api'
import { isCashPayment } from '../utils/payment'

type Period = 'today' | 'week' | 'month'

type Props = {
  data: CourierOverview | null
  photo?: string
  onOpenShop: () => void
  /** Tarixdagi buyurtma — chek va tafsilotlar. */
  onOpenOrder: (order: CourierOrder) => void
  /** Qo'llab-quvvatlash chati va unda o'qilmagan javoblar. */
  onOpenSupport: () => void
  supportUnread: number
  /** «Kassaga topshirish» — qo'ldagi hamma naqd. */
  onHandOverCash: () => void
  cashBusy: boolean
}

const HANDOVER_KEYS: Record<CashHandover['status'], TranslationKey> = {
  pending: 'courier.cashStatusPending',
  confirmed: 'courier.cashStatusConfirmed',
  rejected: 'courier.cashStatusRejected',
}

export function CourierProfilePage({
  data, photo, onOpenShop, onOpenOrder, onOpenSupport, supportUnread, onHandOverCash, cashBusy,
}: Props) {
  const { t, lang, setLang } = useI18n()
  const [period, setPeriod] = useState<Period>('today')
  const tgUser = getTelegramUser()

  const name = data?.profile.name || tgUser?.first_name || t('courier.profile')
  const phone = data?.profile.phone || (tgUser?.username ? `@${tgUser.username}` : '')
  const avatar = photo || tgUser?.photo_url
  const stats = data?.stats[period]

  // Til do'kondagi kabi profilga ham yoziladi — qurilmalar orasida saqlanadi
  const toggleLang = () => {
    const next = lang === 'ru' ? 'uz' : 'ru'
    setLang(next)
    hapticSelection()
    const uid = auth.currentUser?.uid
    if (uid) updateUserProfile(Number(uid), { language: next }).catch(() => {})
  }

  const periods: { key: Period; label: string }[] = [
    { key: 'today', label: t('courier.periodToday') },
    { key: 'week', label: t('courier.periodWeek') },
    { key: 'month', label: t('courier.periodMonth') },
  ]

  return (
    <>
      <header className="page-head flex items-center px-5 pt-8 sm:px-10">
        <PageTitle className="text-3xl font-extrabold">{t('courier.profile')}</PageTitle>
      </header>

      {/* Kuryer kartochkasi */}
      <section className="crr-hero mx-5 mt-6 sm:mx-10">
        <span className="crr-hero__avatar">
          {avatar ? <img src={avatar} alt="" className="size-full object-cover" /> : <UserRound size={32} />}
        </span>
        <span className="min-w-0 flex-1">
          <b className="block truncate text-xl font-extrabold" style={{ color: 'var(--ink)' }}>{name}</b>
          {phone && <span className="block truncate text-sm" style={{ color: 'var(--muted)' }}>{phone}</span>}
          <span className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="crr-badge crr-badge--solid">
              <BadgeCheck size={13} /> {t('courier.badge')}
            </span>
          </span>
        </span>
      </section>

      {/* Qo'ldagi naqd — kassaga topshirish */}
      {data && (
        <section className="crr-cash mx-5 mt-4 sm:mx-10">
          <div className="flex items-center gap-3">
            <span className="crr-cash__icon"><Wallet size={22} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold" style={{ color: 'var(--gold-strong)' }}>{t('courier.cashHeld')}</span>
              <b className="block text-2xl font-extrabold" style={{ color: 'var(--ink)' }}>{formatPrice(data.cash.held.amount)}</b>
              <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                {t('courier.cashOrders', { count: data.cash.held.count })}
              </span>
            </span>
          </div>
          {data.cash.pending.count > 0 && (
            <p className="crr-cash__pending">
              <Clock3 size={14} /> {t('courier.cashPending', { amount: formatPrice(data.cash.pending.amount) })}
            </p>
          )}
          <button
            className="crr-btn crr-btn--primary crr-btn--block mt-3"
            disabled={cashBusy || data.cash.held.count === 0}
            onClick={onHandOverCash}
          >
            {cashBusy ? <Loader2 size={18} className="animate-spin" /> : <Banknote size={18} />}
            {data.cash.held.count ? t('courier.cashHandOver') : t('courier.cashNothing')}
          </button>
          {data.cash.handovers.length > 0 && (
            <ul className="crr-cash__history">
              {data.cash.handovers.slice(0, 4).map((h) => (
                <li key={h.id}>
                  <span className="min-w-0 flex-1">
                    <b className="block text-sm" style={{ color: 'var(--ink)' }}>{formatPrice(h.amount)}</b>
                    <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                      {formatOrderDate(h.createdAt)} · {t('courier.cashOrders', { count: h.count })}
                      {h.note ? ` · ${h.note}` : ''}
                    </span>
                  </span>
                  <span className={'crr-cash__status is-' + h.status}>{t(HANDOVER_KEYS[h.status])}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Statistika */}
      <section className="mx-5 mt-6 sm:mx-10">
        <div className="crr-segmented" role="tablist">
          {periods.map(({ key, label }) => (
            <button
              key={key}
              role="tab"
              aria-selected={period === key}
              className={'crr-segmented__item ' + (period === key ? 'active' : '')}
              onClick={() => setPeriod(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="crr-stats mt-3">
          <StatCard icon={<PackageCheck size={18} />} label={t('courier.statDelivered')} value={stats ? String(stats.delivered) : null} big />
          <StatCard icon={<Banknote size={18} />} label={t('courier.statCash')} value={stats ? formatPrice(stats.cash) : null} tone="gold" />
          <StatCard icon={<CreditCard size={18} />} label={t('courier.statCard')} value={stats ? formatPrice(stats.card) : null} tone="info" />
        </div>
        {data && (
          <p className="mt-2 text-xs font-bold" style={{ color: 'var(--faint)' }}>
            {t('courier.statTotal', { count: data.stats.total })}
          </p>
        )}
      </section>

      {/* Sozlamalar */}
      <section className="mx-5 mt-6 grid gap-2 sm:mx-10">
        <button className="crr-option crr-option--support" onClick={onOpenSupport}>
          <span className="crr-option__icon"><Headset size={19} /></span>
          <span className="min-w-0 flex-1 text-left">
            <b className="block text-sm" style={{ color: 'var(--ink)' }}>{t('support.title')}</b>
            <span className="block text-xs" style={{ color: 'var(--muted)' }}>{t('support.optionSub')}</span>
          </span>
          {supportUnread > 0 ? (
            <span className="crr-count crr-count--hot">{supportUnread}</span>
          ) : (
            <ChevronRight size={18} style={{ color: 'var(--muted)' }} />
          )}
        </button>
        <button className="crr-option" onClick={toggleLang}>
          <span className="crr-option__icon"><Languages size={19} /></span>
          <span className="min-w-0 flex-1 text-left">
            <b className="block text-sm" style={{ color: 'var(--ink)' }}>{t('profile.language')}</b>
            <span className="block text-xs" style={{ color: 'var(--muted)' }}>{lang === 'ru' ? 'Русский' : "O'zbekcha"}</span>
          </span>
          <span className="crr-chip">{lang === 'ru' ? "O'zbekcha" : 'Русский'}</span>
        </button>
        <button className="crr-option crr-option--brand" onClick={onOpenShop}>
          <span className="crr-option__icon"><Store size={19} /></span>
          <span className="min-w-0 flex-1 text-left">
            <b className="block text-sm" style={{ color: 'var(--ink)' }}>{t('courier.openShop')}</b>
            <span className="block text-xs" style={{ color: 'var(--muted)' }}>{t('courier.openShopSub')}</span>
          </span>
          <ChevronRight size={18} style={{ color: 'var(--muted)' }} />
        </button>
      </section>

      {/* Tarix */}
      <section className="mx-5 mt-7 pb-8 sm:mx-10">
        <h2 className="section-title mb-3">{t('courier.history')}</h2>
        {!data ? (
          <div className="grid gap-2">
            {[0, 1, 2].map((i) => <span key={i} className="crr-skel h-14 w-full" />)}
          </div>
        ) : data.recent.length === 0 ? (
          <p className="crr-empty text-sm" style={{ color: 'var(--muted)' }}>{t('courier.historyEmpty')}</p>
        ) : (
          <ul className="crr-history">
            {data.recent.map((order) => {
              const cash = isCashPayment(order.paymentMethod)
              return (
                <li key={order.id}>
                  <button className="crr-history__row" onClick={() => onOpenOrder(order)}>
                  <span className={'crr-history__icon ' + (cash ? 'is-cash' : 'is-card')}>
                    {cash ? <Banknote size={16} /> : <CreditCard size={16} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-sm" style={{ color: 'var(--ink)' }}>
                      {datedNumber(order.number, order.orderDay)} · {order.customer.address || '—'}
                    </b>
                    <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                      {formatOrderDate(order.deliveredAt || undefined)}
                    </span>
                  </span>
                  <b className="shrink-0 text-sm" style={{ color: 'var(--ink)' }}>{formatPrice(order.total)}</b>
                  <ChevronRight size={16} className="shrink-0" style={{ color: 'var(--faint)' }} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}

function StatCard({
  icon, label, value, tone, big,
}: {
  icon: React.ReactNode
  label: string
  value: string | null
  tone?: 'gold' | 'info'
  big?: boolean
}) {
  return (
    <div className={'crr-stat ' + (tone ? `crr-stat--${tone} ` : '') + (big ? 'crr-stat--big' : '')}>
      <span className="crr-stat__icon">{icon}</span>
      {value === null ? <span className="crr-skel h-6 w-16" /> : <b className="crr-stat__value">{value}</b>}
      <span className="crr-stat__label">{label}</span>
    </div>
  )
}
