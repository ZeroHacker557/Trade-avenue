import {
  Banknote, BellOff, CheckCircle2, ChevronRight, CreditCard, DoorOpen, LocateFixed, LocateOff, Loader2, MapPin,
  MessageSquareText, Navigation, PackageCheck, Phone, Radio, RotateCw, Route, Send, UserRound,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { datedNumber } from '../utils/order-label'
import { formatPrice } from '../data'
import { useI18n } from '../i18n'
import { PageTitle } from '../components/layout/PageTitle'
import type { CourierOrder, CourierOverview } from './api'
import { clock, openExternal, telHref, timeAgo } from './format'
import { BOT_URL } from '../config/brand'
import { getTelegram } from '../utils/telegram'
import { NavigateButton } from './NavigateButton'
import { SwipeActions } from './SwipeActions'
import {
  GOOGLE_MAX_STOPS, formatKm, googleMultiRoute, planRoute, yandexMultiRoute, yandexRouteTo,
  type Point, type RouteStop,
} from './route'
import type { LocationState } from './use-courier'
import { isCashPayment } from '../utils/payment'

export type CourierTab = 'new' | 'active' | 'done'

type Props = {
  data: CourierOverview | null
  error: string | null
  refreshing: boolean
  busyId: string | null
  location: LocationState
  tab: CourierTab
  focusId: string | null
  onTab: (tab: CourierTab) => void
  onRefresh: () => void
  onRetryLocation: () => void
  onTake: (order: CourierOrder) => void
  onDeliver: (order: CourierOrder) => void
  /** Tafsilotlar oynasi — mahsulotlar rasmi bilan. */
  onOpen: (order: CourierOrder) => void
  /** «Yetib keldim» — mijozga «Kuryer eshik oldida». */
  onArrive: (order: CourierOrder) => void
  /** Smena: yangi buyurtma xabarlari faqat ishdagilarga. */
  onShift: boolean
  shiftBusy: boolean
  onToggleShift: () => void
}

const pointOf = (order: CourierOrder): Point | null => order.customer.location

/** Eng eskisi birinchi — joylashuv noma'lum bo'lsa marshrut shundan boshlanadi. */
const byCreated = (a: CourierOrder, b: CourierOrder) =>
  String(a.createdAt).localeCompare(String(b.createdAt))

export function CourierOrdersPage({
  data, error, refreshing, busyId, location, tab, focusId,
  onTab, onRefresh, onRetryLocation, onTake, onDeliver, onOpen, onArrive,
  onShift, shiftBusy, onToggleShift,
}: Props) {
  const { t, lang } = useI18n()
  const start = location.status === 'ok' ? location.point : null

  /*
   * Ikkala ro'yxat ham YAQINLIK zanjiri bo'yicha: har keyingi manzil
   * oldingisiga eng yaqini. «Yangi» — kuryerning joyidan, «Yo'lda» —
   * ham shunday, lekin u haqiqiy marshrut sifatida raqamlanadi.
   */
  const newPlan = useMemo(
    () => planRoute([...(data?.available ?? [])].sort(byCreated), pointOf, start),
    [data?.available, start],
  )
  const activePlan = useMemo(
    () => planRoute([...(data?.active ?? [])].sort(byCreated), pointOf, start),
    [data?.active, start],
  )

  const counts = {
    new: data?.available.length ?? 0,
    active: data?.active.length ?? 0,
    done: data?.done.length ?? 0,
  }

  const firstName = (data?.profile.name || '').split(' ')[0]

  return (
    <>
      <header className="page-head flex items-center justify-between gap-3 px-5 pt-8 sm:px-10">
        <div className="min-w-0">
          {firstName && (
            <p className="truncate text-sm font-bold" style={{ color: 'var(--muted)' }}>
              {t('courier.hello', { name: firstName })}
            </p>
          )}
          <PageTitle className="text-3xl font-extrabold">{t('courier.navOrders')}</PageTitle>
        </div>
        <button
          className="crr-icon-btn ml-auto"
          onClick={onRefresh}
          aria-label={t('common.retry')}
          disabled={refreshing}
        >
          <RotateCw size={19} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </header>

      {/* Smena — yangi buyurtma xabarlari faqat ishdagilarga */}
      {data && (
        <button
          className={'crr-shiftbar mx-5 mt-4 sm:mx-10 ' + (onShift ? 'is-on' : '')}
          onClick={onToggleShift}
          disabled={shiftBusy}
          role="switch"
          aria-checked={onShift}
        >
          <span className="crr-shiftbar__dot" />
          <span className="min-w-0 flex-1 text-left">
            <b className="block text-sm">{onShift ? t('courier.shiftOn') : t('courier.shiftOff')}</b>
            <span className="block text-xs">{onShift ? t('courier.shiftOnSub') : t('courier.shiftOffSub')}</span>
          </span>
          <span className="crr-switch" aria-hidden="true"><span /></span>
        </button>
      )}

      {/* Bugungi xulosa */}
      <section className="crr-summary mx-5 mt-5 sm:mx-10">
        <SummaryTile icon={<PackageCheck size={18} />} label={t('courier.sumDelivered')} value={data ? String(data.stats.today.delivered) : null} />
        <SummaryTile icon={<Navigation size={18} />} label={t('courier.sumOnWay')} value={data ? String(counts.active) : null} />
        <SummaryTile
          icon={<Banknote size={18} />}
          label={t('courier.sumCash')}
          // Haqiqatan qo'ldagi — kassaga hali topshirilmagan naqd
          value={data ? formatPrice(data.cash.held.amount) : null}
          tone="gold"
        />
      </section>

      {/* Bo'limlar */}
      <div className="crr-segmented mx-5 mt-5 sm:mx-10" role="tablist">
        {(['new', 'active', 'done'] as const).map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={'crr-segmented__item ' + (tab === key ? 'active' : '')}
            onClick={() => onTab(key)}
          >
            {t(key === 'new' ? 'courier.tabNew' : key === 'active' ? 'courier.tabActive' : 'courier.tabDone')}
            {counts[key] > 0 && <span className={'crr-count ' + (key === 'new' ? 'crr-count--hot' : '')}>{counts[key]}</span>}
          </button>
        ))}
      </div>

      {tab !== 'done' && <LocationBar location={location} onRetry={onRetryLocation} />}

      {/* Smenada — Telegram jonli joylashuvi holati */}
      {data && onShift && <LiveShare location={data.location} />}

      {/* Dam olayotganda — yangi buyurtma xabarlari kelmaydi */}
      {data && !onShift && tab === 'new' && (
        <div className="crr-offshift mx-5 mt-3 sm:mx-10">
          <BellOff size={17} className="shrink-0" />
          <span className="min-w-0 flex-1">{t('courier.offShiftNote')}</span>
          <button className="crr-link" onClick={onToggleShift} disabled={shiftBusy}>{t('courier.shiftStart')}</button>
        </div>
      )}

      <section className="px-5 pb-8 pt-4 sm:px-10">
        {!data && !error && <ListSkeleton />}

        {error && !data && (
          <div className="crr-empty">
            <p className="font-extrabold" style={{ color: 'var(--ink)' }}>{t('courier.loadFailed')}</p>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>{error}</p>
            <button className="crr-btn crr-btn--primary mt-4" onClick={onRefresh}>{t('common.retry')}</button>
          </div>
        )}

        {data && tab === 'new' && (
          <StopList
            stops={newPlan.stops}
            empty={[t('courier.emptyNew'), t('courier.emptyNewText')]}
            render={(stop, index) => (
              <OrderCard
                key={stop.item.id}
                order={stop.item}
                stop={stop}
                index={index}
                numbered={false}
                focused={stop.item.id === focusId}
                busy={busyId === stop.item.id}
                lang={lang}
                onOpen={onOpen}
                action={
                  <button
                    className="crr-btn crr-btn--primary crr-btn--block"
                    disabled={busyId !== null}
                    onClick={() => onTake(stop.item)}
                  >
                    {busyId === stop.item.id ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                    {t('courier.take')}
                  </button>
                }
              />
            )}
          />
        )}

        {data && tab === 'active' && (
          <>
            {activePlan.stops.length > 0 && <RouteCard stops={activePlan.stops} totalKm={activePlan.totalKm} lang={lang} />}
            {activePlan.stops.length > 0 && <p className="crr-swipe-hint">{t('courier.swipeHint')}</p>}
            <StopList
              stops={activePlan.stops}
              empty={[t('courier.emptyActive'), t('courier.emptyActiveText')]}
              render={(stop, index) => (
                /* Surish: → navigatsiya (Yandex), ← «Yetib keldim» (20-band) */
                <SwipeActions
                  key={stop.item.id}
                  left={stop.item.customer.location ? {
                    label: t('courier.swipeNav'),
                    icon: Navigation,
                    color: 'var(--info, #2563eb)',
                    onTrigger: () => openExternal(yandexRouteTo(stop.item.customer.location!)),
                  } : undefined}
                  right={!stop.item.arrivedAt ? {
                    label: t('courier.swipeArrive'),
                    icon: MapPin,
                    color: 'var(--gold, #d99b0f)',
                    onTrigger: () => onArrive(stop.item),
                  } : undefined}
                >
                <OrderCard
                  key={stop.item.id}
                  order={stop.item}
                  stop={stop}
                  index={index}
                  numbered
                  focused={stop.item.id === focusId}
                  busy={busyId === stop.item.id}
                  lang={lang}
                  onOpen={onOpen}
                  action={
                    <div className="grid gap-2">
                      <div className="grid grid-cols-2 gap-2">
                        {stop.item.customer.location ? (
                          <NavigateButton point={stop.item.customer.location} block />
                        ) : (
                          <span />
                        )}
                        <ArriveButton order={stop.item} busy={busyId !== null} onArrive={onArrive} />
                      </div>
                      <button
                        className="crr-btn crr-btn--primary crr-btn--block"
                        disabled={busyId !== null}
                        onClick={() => onDeliver(stop.item)}
                      >
                        {busyId === stop.item.id ? <Loader2 size={18} className="animate-spin" /> : <PackageCheck size={18} />}
                        {t('courier.deliver')}
                      </button>
                    </div>
                  }
                />
                </SwipeActions>
              )}
            />
          </>
        )}

        {data && tab === 'done' && (
          data.done.length ? (
            <div className="grid gap-3">
              {data.done.map((order, index) => (
                <OrderCard key={order.id} order={order} index={index} numbered={false} focused={false} busy={false} lang={lang} onOpen={onOpen} />
              ))}
            </div>
          ) : (
            <Empty title={t('courier.emptyDone')} text={t('courier.emptyDoneText')} />
          )
        )}
      </section>
    </>
  )
}

/**
 * Telegram «Jonli joylashuv»i yoqilganmi.
 *
 * Yoqilgan bo'lsa — bir qatorli yashil holat. Yo'q bo'lsa — qanday
 * yoqishni ko'rsatadigan karta: ilova yopiq bo'lsa ham admin va mijoz
 * kuryerni ko'rishi faqat shu orqali mumkin (mini app fonda ishlamaydi).
 */
function LiveShare({ location }: { location: CourierOverview['location'] }) {
  const { t } = useI18n()
  // «Hozir» holatda turadi — render toza bo'lsin, har 30 soniyada yangilanadi
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const at = Date.parse(location.at || '')
  const until = Date.parse(location.liveUntil || '')
  const live = location.source === 'live'
    && Number.isFinite(at) && now - at < 3 * 60_000
    && (!location.liveUntil || (Number.isFinite(until) && until > now))

  if (live) {
    return (
      <p className="crr-live crr-live--on mx-5 mt-3 sm:mx-10">
        <Radio size={15} /> {t('courier.liveOn', { ago: timeAgo(location.at, t) })}
      </p>
    )
  }

  const openBot = () => {
    const tg = getTelegram()
    if (tg?.openTelegramLink) tg.openTelegramLink(BOT_URL)
    else window.open(BOT_URL, '_blank', 'noopener')
  }

  return (
    <div className="crr-live mx-5 mt-3 sm:mx-10">
      <b className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink)' }}>
        <Radio size={16} style={{ color: 'var(--royal)' }} /> {t('courier.liveTitle')}
      </b>
      <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>{t('courier.liveText')}</p>
      <ol className="crr-live__steps">
        <li>{t('courier.liveStep1')}</li>
        <li>{t('courier.liveStep2')}</li>
        <li>{t('courier.liveStep3')}</li>
      </ol>
      <button className="crr-btn crr-btn--ghost crr-btn--block mt-2" onClick={openBot}>
        <Send size={16} /> {t('courier.liveOpenBot')}
      </button>
    </div>
  )
}

/** «Yetib keldim» — bir marta; keyin «mijozga xabar berildi» belgisi. */
export function ArriveButton({
  order, busy, onArrive,
}: {
  order: CourierOrder
  busy: boolean
  onArrive: (order: CourierOrder) => void
}) {
  const { t } = useI18n()
  if (order.arrivedAt) {
    return (
      <span className="crr-arrived">
        <CheckCircle2 size={16} /> {t('courier.arrivedDone')}
      </span>
    )
  }
  return (
    <button className="crr-btn crr-btn--ghost crr-btn--block crr-btn--arrive" disabled={busy} onClick={() => onArrive(order)}>
      <DoorOpen size={17} /> {t('courier.arrived')}
    </button>
  )
}

function SummaryTile({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string | null; tone?: 'gold' }) {
  return (
    <div className={'crr-tile ' + (tone === 'gold' ? 'crr-tile--gold' : '')}>
      <span className="crr-tile__icon">{icon}</span>
      {value === null ? <span className="crr-skel h-5 w-10" /> : <b className="crr-tile__value">{value}</b>}
      <span className="crr-tile__label">{label}</span>
    </div>
  )
}

function LocationBar({ location, onRetry }: { location: LocationState; onRetry: () => void }) {
  const { t } = useI18n()
  if (location.status === 'loading') {
    return (
      <p className="crr-locbar mx-5 mt-3 sm:mx-10">
        <Loader2 size={15} className="animate-spin" /> {t('courier.locating')}
      </p>
    )
  }
  if (location.status === 'ok') {
    return (
      <p className="crr-locbar crr-locbar--ok mx-5 mt-3 sm:mx-10">
        <LocateFixed size={15} /> {t('courier.locationOn')}
      </p>
    )
  }
  return (
    <div className="crr-locbar crr-locbar--off mx-5 mt-3 sm:mx-10">
      <LocateOff size={15} className="shrink-0" />
      <span className="min-w-0 flex-1">{t('courier.locationOff')}</span>
      <button className="crr-link" onClick={onRetry}>{t('courier.locationEnable')}</button>
    </div>
  )
}

function StopList({
  stops, empty, render,
}: {
  stops: RouteStop<CourierOrder>[]
  empty: [string, string]
  render: (stop: RouteStop<CourierOrder>, index: number) => React.ReactNode
}) {
  if (!stops.length) return <Empty title={empty[0]} text={empty[1]} />
  return <div className="grid gap-3">{stops.map((stop, index) => render(stop, index))}</div>
}

/** Butun marshrut — umumiy yo'l va xaritada ochish. */
function RouteCard({ stops, totalKm, lang }: { stops: RouteStop<CourierOrder>[]; totalKm: number; lang: 'uz' | 'ru' }) {
  const { t } = useI18n()
  const points = stops.map((s) => s.item.customer.location).filter((p): p is Point => p !== null)
  const yandex = yandexMultiRoute(points)
  const google = googleMultiRoute(points)

  return (
    <div className="crr-route mb-3">
      <span className="crr-route__icon"><Route size={20} /></span>
      <div className="min-w-0 flex-1">
        <b className="block text-sm" style={{ color: 'var(--ink)' }}>{t('courier.routeTitle')}</b>
        <span className="block text-xs" style={{ color: 'var(--muted)' }}>
          {t('courier.routeStops', { count: stops.length, km: formatKm(totalKm, lang) })}
        </span>
      </div>
      {(yandex || google) && (
        <div className="crr-route__actions">
          {yandex && (
            <button className="crr-chip" onClick={() => openExternal(yandex)}>
              <Navigation size={14} /> {t('courier.routeYandex')}
            </button>
          )}
          {google && (
            <button className="crr-chip" onClick={() => openExternal(google)}>
              <Navigation size={14} /> {t('courier.routeGoogle', { count: Math.min(points.length, GOOGLE_MAX_STOPS) })}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function OrderCard({
  order, stop, index, numbered, focused, busy, lang, action, onOpen,
}: {
  order: CourierOrder
  stop?: RouteStop<CourierOrder>
  index: number
  numbered: boolean
  focused: boolean
  busy: boolean
  lang: 'uz' | 'ru'
  action?: React.ReactNode
  onOpen: (order: CourierOrder) => void
}) {
  const { t } = useI18n()
  const ref = useRef<HTMLElement>(null)

  // Bot xabaridagi «Ilovada ochish» — aynan shu buyurtmaga olib keladi
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [focused])

  const c = order.customer
  const cash = isCashPayment(order.paymentMethod)
  const delivered = order.status === 'Yetkazildi'
  const phone = c.recipientPhone || c.phone
  const who = c.recipientName || c.name
  const count = order.items.reduce((sum, item) => sum + item.quantity, 0)

  let distance: string | null = null
  if (stop?.legKm != null) {
    distance = index === 0 ? t('courier.fromYou', { km: formatKm(stop.legKm, lang) }) : t('courier.fromPrev', { km: formatKm(stop.legKm, lang) })
  } else if (stop && !c.location) {
    distance = t('courier.noPoint')
  }

  return (
    <article
      ref={ref}
      className={'crr-card ' + (focused ? 'crr-card--focus ' : '') + (busy ? 'crr-card--busy' : '')}
      style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
    >
      <div className="flex items-start gap-3">
        {numbered && <span className="crr-stop">{index + 1}</span>}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <b className="text-base" style={{ color: 'var(--ink)' }}>{datedNumber(order.number, order.orderDay)}</b>
            <span className="text-xs" style={{ color: 'var(--faint)' }}>
              {delivered ? t('courier.deliveredAt', { time: clock(order.deliveredAt) }) : timeAgo(order.createdAt, t)}
            </span>
            {order.assignedToMe && !delivered && order.status === 'Qabul qilindi' && (
              <span className="crr-badge">{t('courier.assigned')}</span>
            )}
          </div>
          {distance && (
            <span className={'crr-distance ' + (stop?.legKm != null && stop.legKm > 10 ? 'crr-distance--far' : '')}>
              <Navigation size={12} /> {distance}
            </span>
          )}
        </div>
      </div>

      <p className="crr-line mt-3">
        <MapPin size={16} className="crr-line__icon" />
        <span style={{ color: 'var(--ink)' }}>{c.address || '—'}</span>
      </p>

      {c.comment && (
        <p className="crr-line crr-line--note mt-2">
          <MessageSquareText size={16} className="crr-line__icon" />
          <span>{c.comment}</span>
        </p>
      )}

      <div className="crr-person mt-3">
        <span className="crr-person__avatar"><UserRound size={16} /></span>
        <span className="min-w-0 flex-1">
          <b className="block truncate text-sm" style={{ color: 'var(--ink)' }}>{who || '—'}</b>
          <span className="block truncate text-xs" style={{ color: 'var(--muted)' }}>
            {c.recipientName ? `${t('courier.recipient')} · ` : ''}{phone}
          </span>
        </span>
        {phone && !delivered && (
          <a className="crr-call" href={telHref(phone)} aria-label={t('courier.call')}>
            <Phone size={17} />
          </a>
        )}
      </div>

      {/* Mahsulotlar va rasmlar — faqat tafsilotlar oynasida */}
      <button className="crr-details-btn mt-3" onClick={() => onOpen(order)}>
        <span className="min-w-0 flex-1 text-left">{t('courier.items', { count })}</span>
        <span className="crr-details-btn__cta">
          {t('courier.details')} <ChevronRight size={16} />
        </span>
      </button>

      <div className={'crr-pay mt-3 ' + (cash ? 'crr-pay--cash' : 'crr-pay--card')}>
        {cash ? <Banknote size={18} /> : <CreditCard size={18} />}
        <span className="min-w-0 flex-1 text-xs font-bold">{cash ? t('courier.cashCollect') : t('courier.paidCard')}</span>
        <b className="text-base">{formatPrice(order.total)}</b>
      </div>

      {action && <div className="mt-3">{action}</div>}
    </article>
  )
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="crr-empty">
      <span className="crr-empty__icon"><PackageCheck size={30} /></span>
      <p className="mt-3 font-extrabold" style={{ color: 'var(--ink)' }}>{title}</p>
      <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>{text}</p>
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="grid gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="crr-card">
          <span className="crr-skel h-5 w-24" />
          <span className="crr-skel mt-3 h-4 w-full" />
          <span className="crr-skel mt-2 h-4 w-2/3" />
          <span className="crr-skel mt-4 h-10 w-full" />
        </div>
      ))}
    </div>
  )
}
