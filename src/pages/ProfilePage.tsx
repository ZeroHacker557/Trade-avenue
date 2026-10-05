import type { LucideIcon } from 'lucide-react'
import { datedNumber } from '../utils/order-label'
import { Bell, Bike, ChevronRight, CircleHelp, ClipboardList, Languages, MapPin, Moon, Sun, UserRound } from 'lucide-react'
import { formatPrice } from '../data'
import { formatOrderDate } from '../utils/date'
import { IconButton } from '../components/ui/IconButton'
import { OrderImages } from '../components/order/OrderImages'
import { OrderCardSkeleton, TextSkeleton } from '../components/ui/LoadingSkeletons'
import { getTelegramUser } from '../utils/telegram'
import { useI18n, type TranslationKey } from '../i18n'
import type { ThemeMode } from '../utils/theme'
import type { AppPage, Order, UserProfile } from '../types/domain'
import { PageTitle } from '../components/layout/PageTitle'

type Option = {
  icon: LucideIcon
  titleKey: TranslationKey
  subKey: TranslationKey
  page?: AppPage
  value?: string
}

type Props = {
  profile: UserProfile | null
  orders: Order[]
  /** Buyurtmalar kelmaguncha statistika «0» emas, skelet. */
  ordersReady: boolean
  theme: ThemeMode
  onToggleTheme: () => void
  onNavigate: (page: AppPage) => void
  onNotify: (msg: string) => void
  /** Faqat kuryerlarga — do'kondan kuryer sahifasiga qaytish. */
  onOpenCourier?: () => void
}

export function ProfilePage({ profile, orders, ordersReady, theme, onToggleTheme, onNavigate, onNotify, onOpenCourier }: Props) {
  const { t, lang } = useI18n()
  const tgUser = getTelegramUser()

  const userName = profile?.first_name
    ? `${profile.first_name}${profile.last_name ? ' ' + profile.last_name : ''}`
    : tgUser
      ? `${tgUser.first_name}${tgUser.last_name ? ' ' + tgUser.last_name : ''}`
      : t('nav.profile')

  const userPhone = profile?.phone
    || (tgUser?.username ? `@${tgUser.username}` : t('profile.connected'))

  const photo = profile?.photo_url || tgUser?.photo_url
  const lastOrder = orders[0]

  const options: Option[] = [
    { icon: UserRound, titleKey: 'profile.personal', subKey: 'profile.personalSub', page: 'profile_edit' },
    { icon: MapPin, titleKey: 'profile.addresses', subKey: 'profile.addressesSub', page: 'addresses' },
    { icon: ClipboardList, titleKey: 'profile.history', subKey: 'profile.historySub', page: 'orders' },
    {
      icon: Languages,
      titleKey: 'profile.language',
      subKey: 'profile.languageSub',
      page: 'language',
      value: lang === 'ru' ? 'Русский' : "O'zbekcha",
    },
    { icon: CircleHelp, titleKey: 'profile.help', subKey: 'profile.helpSub', page: 'support' as const },
  ]

  const isDark = theme === 'dark'

  const stats = [
    { label: t('profile.statOrders'), value: orders.length },
    {
      label: t('profile.statActive'),
      value: orders.filter((o) => o.status === 'Yangi' || o.status === 'Qabul qilindi' || o.status === 'Yetkazilmoqda').length,
    },
    { label: t('profile.statDone'), value: orders.filter((o) => o.status === 'Yetkazildi').length },
  ]

  return (
    <>
      <header className="page-head flex items-center justify-between px-5 pt-8 sm:px-10">
        <PageTitle className="text-3xl font-extrabold">{t('profile.title')}</PageTitle>
        {/* ml-auto: to'liq ekranda nom tepaga ketgach ham tugma o'ngda qolsin */}
        <IconButton label={t('notifications.title')} onClick={() => onNavigate('notifications')} className="ml-auto">
          <Bell />
        </IconButton>
      </header>

      {/* Profil kartochkasi */}
      <button
        className="mx-5 mt-6 flex w-[calc(100%-2.5rem)] items-center gap-4 rounded-2xl p-5 text-left transition active:scale-[0.99] sm:mx-10 sm:w-[calc(100%-5rem)]"
        style={{ background: 'var(--brand-soft)', animation: 'fadeInUp 0.4s ease' }}
        onClick={() => onNavigate('profile_edit')}
      >
        <div
          className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full"
          style={{ background: 'var(--surface)', color: 'var(--brand)' }}
        >
          {photo ? (
            <img src={photo} alt="" className="size-full object-cover" />
          ) : (
            <UserRound size={34} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-extrabold" style={{ color: 'var(--ink)' }}>{userName}</h2>
          <p className="mt-0.5 truncate text-sm" style={{ color: 'var(--muted)' }}>{userPhone}</p>
        </div>
        <ChevronRight style={{ color: 'var(--muted)' }} />
      </button>

      {onOpenCourier && (
        <button
          className="crr-option crr-option--brand mx-5 mt-3 w-[calc(100%-2.5rem)] sm:mx-10 sm:w-[calc(100%-5rem)]"
          onClick={onOpenCourier}
          style={{ animation: 'fadeInUp 0.4s ease 0.03s both' }}
        >
          <span className="crr-option__icon"><Bike size={19} /></span>
          <span className="min-w-0 flex-1 text-left">
            <b className="block text-sm" style={{ color: 'var(--ink)' }}>{t('courier.backToCourier')}</b>
            <span className="block text-xs" style={{ color: 'var(--muted)' }}>{t('courier.backToCourierSub')}</span>
          </span>
          <ChevronRight size={18} style={{ color: 'var(--muted)' }} />
        </button>
      )}

      {/* Statistika */}
      <section className="mx-5 mt-5 grid grid-cols-3 gap-3 sm:mx-10" style={{ animation: 'fadeInUp 0.4s ease 0.05s both' }}>
        {stats.map(({ label, value }) => (
          <div
            key={label}
            className="rounded-2xl border p-4 text-center"
            style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
          >
            {ordersReady ? (
              <p className="text-2xl font-extrabold" style={{ color: 'var(--brand)', animation: 'fadeIn 0.3s ease' }}>{value}</p>
            ) : (
              // Balandlik raqam bilan bir xil — kelganda karta sakramaydi
              <span className="flex h-8 items-center justify-center">
                <TextSkeleton className="h-6 w-8" />
              </span>
            )}
            <p className="mt-1 text-xs font-bold" style={{ color: 'var(--muted)' }}>{label}</p>
          </div>
        ))}
      </section>

      {/* Oxirgi buyurtma — kelguncha skelet */}
      {!ordersReady && (
        <section className="px-5 pt-7 sm:px-10">
          <TextSkeleton className="mb-4 h-6 w-40" />
          <OrderCardSkeleton />
        </section>
      )}
      {ordersReady && lastOrder && (
        <section className="px-5 pt-7 sm:px-10" style={{ animation: 'fadeInUp 0.4s ease 0.1s both' }}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="section-title">{t('profile.lastOrder')}</h2>
            <button
              onClick={() => onNavigate('orders')}
              className="text-sm font-bold transition hover:opacity-70"
              style={{ color: 'var(--brand)' }}
            >
              {t('home.seeAll')}
            </button>
          </div>
          <button onClick={() => onNavigate('orders')} className="order-card w-full text-left">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-extrabold" style={{ color: 'var(--ink)' }}>
                {lastOrder.products.map((p) => p.product.name).join(', ')}
              </h3>
              <p className="mt-1 text-xs font-bold" style={{ color: 'var(--muted)' }}>{datedNumber(lastOrder.orderNumber, lastOrder.orderDay, lastOrder.createdAt)}</p>
              <div className="mt-2">
                <OrderImages products={lastOrder.products} />
                <p className="mt-1 text-[11px]" style={{ color: 'var(--muted)' }}>
                  {t('orders.itemCount', { count: lastOrder.products.length })}
                </p>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <strong className="block text-lg" style={{ color: 'var(--ink)' }}>{formatPrice(lastOrder.total)}</strong>
              <p className="mt-1 text-xs" style={{ color: 'var(--faint)' }}>
                {formatOrderDate(lastOrder.createdAt) || lastOrder.date}
              </p>
            </div>
          </button>
        </section>
      )}

      {/* Hisob */}
      <section className="px-5 pb-32 pt-7 sm:px-10" style={{ animation: 'fadeInUp 0.4s ease 0.15s both' }}>
        <h2 className="section-title mb-4">{t('profile.account')}</h2>
        <div className="rounded-2xl border px-5" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
          {/* Ko'rinish — bir bosishda almashadi */}
          <button onClick={onToggleTheme} className="profile-option">
            <span
              className="grid size-10 shrink-0 place-items-center rounded-xl"
              style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}
            >
              {isDark ? <Moon size={19} /> : <Sun size={19} />}
            </span>
            <div className="min-w-0 flex-1 text-left">
              <span className="block" style={{ color: 'var(--ink)' }}>{t('profile.theme')}</span>
              <span className="block text-xs font-normal" style={{ color: 'var(--muted)' }}>
                {t('profile.themeSub')}
              </span>
            </div>

            {/* Switch */}
            <span
              className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
              style={{ background: isDark ? 'var(--brand)' : 'var(--line)' }}
              role="switch"
              aria-checked={isDark}
            >
              <span
                className="absolute top-0.5 size-5 rounded-full transition-all"
                style={{
                  background: 'var(--surface)',
                  left: isDark ? '1.375rem' : '0.125rem',
                  boxShadow: 'var(--shadow-sm)',
                }}
              />
            </span>
          </button>

          {options.map(({ icon: Icon, titleKey, subKey, page, value }, index) => (
            <button
              key={titleKey}
              onClick={() => (page ? onNavigate(page) : onNotify(`${t(titleKey)} — ${t('common.soon')}`))}
              className={'profile-option ' + (index === options.length - 1 ? 'border-0' : '')}
            >
              <span
                className="grid size-10 shrink-0 place-items-center rounded-xl"
                style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}
              >
                <Icon size={19} />
              </span>
              <div className="min-w-0 flex-1 text-left">
                <span className="block" style={{ color: 'var(--ink)' }}>{t(titleKey)}</span>
                <span className="block text-xs font-normal" style={{ color: 'var(--muted)' }}>{t(subKey)}</span>
              </div>
              {value && (
                <span className="shrink-0 text-xs font-bold" style={{ color: 'var(--brand)' }}>{value}</span>
              )}
              <ChevronRight className="shrink-0" size={18} style={{ color: 'var(--muted)' }} />
            </button>
          ))}
        </div>
      </section>
    </>
  )
}
