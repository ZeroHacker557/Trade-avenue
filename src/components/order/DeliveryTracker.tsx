import { Car, ChevronDown, ChevronRight, MapPin, Phone } from 'lucide-react'
import { datedNumber } from '../../utils/order-label'
import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../../i18n'
import { TRACKING_FRESH_MS, liveMinutes, useOrderTracking } from '../../lib/tracking'
import type { Order } from '../../types/domain'

type Props = {
  orders: Order[]
  /** Bosilganda — «Kuryer qayerda» jonli xaritasi. */
  onOpen: (order: Order) => void
}

/** Yig'ilgan holat shu seans davomida eslab qolinadi (qaysi buyurtma, qaysi holat). */
const MINI_KEY = 'musa:tracker-mini'

function readMini(): string | null {
  try {
    return sessionStorage.getItem(MINI_KEY)
  } catch {
    return null
  }
}

/** Halqa: r=19 → aylana uzunligi. */
const RING_R = 19
const RING_C = 2 * Math.PI * RING_R

/** Mashina va progress halqasi — kartochkada ham, yig'ilgan doirada ham bir xil. */
function RingIcon({ progress, arrived }: { progress: number; arrived: boolean }) {
  return (
    <span className="dlv__ring" aria-hidden="true">
      <svg viewBox="0 0 44 44">
        <circle className="dlv__ring-bg" cx="22" cy="22" r={RING_R} />
        <circle
          className="dlv__ring-fg"
          cx="22"
          cy="22"
          r={RING_R}
          strokeDasharray={RING_C}
          strokeDashoffset={RING_C * (1 - progress)}
        />
      </svg>
      <span className="dlv__ring-icon">
        {arrived ? <MapPin size={18} strokeWidth={2.4} /> : <Car size={18} strokeWidth={2.4} />}
      </span>
    </span>
  )
}

/**
 * «Kuryer yo'lda» — menyu ustida turadigan ixcham kartochka.
 *
 * Buyurtma «Yetkazilmoqda» bo'lishi bilan chiqadi: halqa va ingichka
 * chiziq kuryer qancha yo'l bosganini ko'rsatadi (taxminiy vaqtdan yoki
 * jonli joylashuvdan), matnda — qolgan daqiqalar. Kuryer «Yetib keldim»
 * bossa kartochka tilla rangga o'tadi.
 *
 * Mijozga xalaqit bermasligi uchun «yig'ish» bor: kartochka ekran
 * burchagidagi kichik doiraga aylanadi, bosilsa yana ochiladi. Kuryer
 * yetib kelganda o'zi qayta ochiladi — bu muhim xabar.
 *
 * Bir nechta buyurtma yo'lda bo'lsa — raqam yonidagi «+N» almashtirgich.
 */
export function DeliveryTracker({ orders, onOpen }: Props) {
  const { t } = useI18n()
  const onWay = useMemo(() => orders.filter((o) => o.status === 'Yetkazilmoqda'), [orders])
  const [pickedId, setPickedId] = useState<string | null>(null)
  const order = useMemo(() => onWay.find((o) => o.id === pickedId) ?? onWay[0] ?? null, [onWay, pickedId])

  // Daqiqalar sanog'i va progress vaqt o'tishi bilan yangilanadi
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!order) return
    const timer = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(timer)
  }, [order])

  // Kuryerning jonli joyi (bo'lsa) — daqiqalar vaqt emas, masofadan hisoblanadi
  const home = useMemo(() => {
    const loc = order?.customer?.location
    return loc && Number.isFinite(loc.lat) ? { lat: loc.lat, lng: loc.lng } : null
  }, [order?.customer?.location])
  const tracking = useOrderTracking(order?.id ?? null, home)

  // Yig'ish shu holat uchun; kuryer yetib kelsa kalit o'zgaradi va kartochka yana ochiladi
  const stateKey = order ? `${order.id}:${order.arrivedAt ? 'arrived' : 'way'}` : ''
  const [mini, setMini] = useState(readMini)
  if (!order) return null

  const setMiniFor = (value: string | null) => {
    setMini(value)
    try {
      if (value) sessionStorage.setItem(MINI_KEY, value)
      else sessionStorage.removeItem(MINI_KEY)
    } catch {
      // saqlanmasa ham shu ko'rinishda qoladi
    }
  }

  const arrived = Boolean(order.arrivedAt)
  const start = Date.parse(order.takenAt || '')
  const end = Date.parse(order.etaAt || '')
  const live = tracking !== null && home !== null && now - Date.parse(tracking.at) < TRACKING_FRESH_MS
  const minutesLeft = live
    ? liveMinutes(tracking, home)
    : Number.isFinite(end) ? Math.ceil((end - now) / 60_000) : null
  // Kuryer avval boshqa manzil(lar)ga boradi — mijoz nega kutayotganini bilsin
  const stopsBefore = live ? tracking.stopsBefore : Number(order.etaStops) || 0

  // Qancha yo'l bosildi: olingandan beri o'tgan vaqt / taxminiy vaqt
  let progress = 0.3
  if (arrived) progress = 1
  else if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
    // Yo'lda bo'lsa to'liq to'lmaydi — to'liq halqa «yetib keldi» uchun
    progress = Math.min(0.9, Math.max(0.06, (now - start) / (end - start)))
  }

  const title = arrived ? t('delivery.arrivedTitle') : t('delivery.onWayTitle')
  const eta = arrived
    ? t('delivery.arrivedText')
    : minutesLeft === null
      ? t('delivery.onWaySoon')
      : minutesLeft > 0
        ? t('delivery.minutesLeft', { n: minutesLeft })
        : t('delivery.almostThere')
  const detail = !arrived && stopsBefore > 0
    ? t('delivery.stopsBefore', { n: stopsBefore })
    : order.courierName || ''
  const phone = (order.courierPhone || tracking?.courierPhone)?.replace(/[^\d+]/g, '')
  const index = onWay.findIndex((o) => o.id === order.id)
  const nextOrder = () => setPickedId(onWay[(index + 1) % onWay.length].id)

  // ── Yig'ilgan: burchakdagi kichik doira ──
  if (mini === stateKey) {
    return (
      <button
        className={'dlv-bubble ' + (arrived ? 'is-arrived' : '')}
        onClick={() => setMiniFor(null)}
        aria-label={`${title} · ${eta}`}
      >
        <RingIcon progress={progress} arrived={arrived} />
        {!arrived && minutesLeft !== null && minutesLeft > 0 && (
          <span className="dlv-bubble__eta">{minutesLeft}′</span>
        )}
        {live && !arrived && <span className="dlv-bubble__live" />}
      </button>
    )
  }

  return (
    <div className={'dlv ' + (arrived ? 'is-arrived' : '')} role="status" aria-live="polite">
      <button className="dlv__main" onClick={() => onOpen(order)} aria-label={t('delivery.follow')}>
        <RingIcon progress={progress} arrived={arrived} />
        <span className="dlv__text">
          <span className="dlv__title">
            {live && !arrived && <span className="dlv__live-dot" title={t('delivery.live')} />}
            {title}
            <ChevronRight size={15} className="dlv__chev" />
          </span>
          <span className="dlv__sub">
            <b>{eta}</b>
            {detail && <> · {detail}</>}
          </span>
          <span className="dlv__bar" aria-hidden="true">
            <span style={{ width: `${progress * 100}%` }} />
          </span>
        </span>
      </button>

      <div className="dlv__side">
        {/* Buyurtma raqami; bir nechta bo'lsa bosib keyingisiga o'tiladi */}
        <button
          type="button"
          className="dlv__num"
          onClick={onWay.length > 1 ? nextOrder : () => onOpen(order)}
          aria-label={onWay.length > 1 ? t('delivery.pickOrder') : datedNumber(order.orderNumber, order.orderDay, order.createdAt)}
        >
          {datedNumber(order.orderNumber, order.orderDay, order.createdAt)}
          {onWay.length > 1 && <span className="dlv__more">+{onWay.length - 1}</span>}
        </button>
        <div className="flex items-center gap-1.5">
          {phone && (
            <a className="dlv__call" href={`tel:${phone}`} aria-label={t('delivery.call')}>
              <Phone size={16} />
            </a>
          )}
          <button className="dlv__min" onClick={() => setMiniFor(stateKey)} aria-label={t('delivery.minimize')}>
            <ChevronDown size={17} />
          </button>
        </div>
      </div>
    </div>
  )
}
