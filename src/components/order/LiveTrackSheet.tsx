import L from 'leaflet'
import { datedNumber } from '../../utils/order-label'
import { ChevronLeft, Crosshair, Info, MapPin, MapPinned, Phone, Radio, Receipt } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet'
import { useI18n, type TranslationKey } from '../../i18n'
import { TRACKING_FRESH_MS, TRACKING_HIDE_MS, liveMinutes, remainingKm, useOrderTracking } from '../../lib/tracking'
import { formatKm, type Point } from '../../courier/route'
import type { Order } from '../../types/domain'
import { formatPhone, telHref } from '../../utils/phone'

type Props = {
  order: Order
  onClose: () => void
  onReceipt: (order: Order) => void
}

const CAR_SVG =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>' +
  '<circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>'
const HOME_SVG =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-5h4v5"/></svg>'

// Mashina belgisi — silliq siljish uchun alohida sinf (styles.css → .lts-car-icon)
const carIcon = L.divIcon({
  className: 'lts-car-icon',
  html: `<div class="lts-car"><span class="lts-car__pulse"></span>${CAR_SVG}</div>`,
  iconSize: [46, 46],
  iconAnchor: [23, 23],
})
// Joylashuv biroz eski (3–15 daq) — xira, «jonli» to'lqinsiz
const carIconStale = L.divIcon({
  className: 'lts-car-icon',
  html: `<div class="lts-car is-stale">${CAR_SVG}</div>`,
  iconSize: [46, 46],
  iconAnchor: [23, 23],
})

/** «40 s», «12 daq», «3 soat» — joylashuv qancha oldin kelgani. */
function agoText(seconds: number, lang: 'uz' | 'ru'): string {
  if (seconds < 60) return `${seconds} ${lang === 'ru' ? 'с' : 's'}`
  const m = Math.round(seconds / 60)
  if (m < 60) return `${m} ${lang === 'ru' ? 'мин' : 'daq'}`
  const h = Math.round(m / 60)
  if (h < 48) return `${h} ${lang === 'ru' ? 'ч' : 'soat'}`
  return `${Math.round(h / 24)} ${lang === 'ru' ? 'дн' : 'kun'}`
}

const homeIcon = L.divIcon({
  className: '',
  html: `<div class="lts-home">${HOME_SVG}</div>`,
  iconSize: [42, 42],
  iconAnchor: [21, 42],
})

/** Birinchi joylashuvda ikkalasini sig'diradi; «kuzatish» yoqilsa — kuryer ortidan yuradi. */
function Camera({ courier, home, follow, fitKey }: {
  courier: Point | null
  home: Point | null
  follow: boolean
  fitKey: number
}) {
  const map = useMap()
  // Qaysi holat uchun sig'dirilgan: tugma bosilishi (fitKey) va kuryer
  // joylashuvi kelgan-kelmagani. Kuryer keyinroq paydo bo'lsa — qayta
  // sig'diriladi, aks holda mashina ekrandan chetda qolardi.
  const fitted = useRef('')
  const hasCourier = courier !== null

  useEffect(() => {
    const key = `${fitKey}:${hasCourier ? 1 : 0}`
    if (fitted.current === key) return
    const pts = [courier, home].filter((p): p is Point => p !== null)
    if (!pts.length) return
    fitted.current = key
    if (pts.length === 1) map.setView([pts[0].lat, pts[0].lng], 15)
    else map.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng])), { padding: [70, 70], maxZoom: 16 })
  }, [map, courier, home, fitKey, hasCourier])

  useEffect(() => {
    if (follow && courier) map.panTo([courier.lat, courier.lng], { animate: true, duration: 1 })
  }, [map, courier, follow])

  return null
}

/**
 * «Kuryer qayerda» — jonli xarita. «Buyurtmalarim» dan har qanday
 * buyurtma uchun ham ochiladi: yo'lda bo'lmasa — faqat manzil va holat
 * (kuryer joylashuvi faqat «Yetkazilmoqda» paytida ko'rinadi).
 *
 * Mashina belgisi har yangilanishda manzil tomon silliq siljiydi, qolgan
 * masofa va vaqt jonli hisoblanadi. Joylashuv kelmagan bo'lsa (kuryer
 * hali ulashmagan) — faqat manzil va tushuntirish.
 */
export default function LiveTrackSheet({ order, onClose, onReceipt }: Props) {
  const { t, lang } = useI18n()
  const home = useMemo<Point | null>(() => {
    const loc = order.customer?.location
    return loc && Number.isFinite(loc.lat) ? { lat: loc.lat, lng: loc.lng } : null
  }, [order.customer?.location])
  const onWay = order.status === 'Yetkazilmoqda'
  // Kuzatuv faqat yo'ldagi buyurtmada bor (server boshqa paytda yozmaydi)
  const tracking = useOrderTracking(onWay ? order.id : null, home)
  const [follow, setFollow] = useState(false)
  const [fitKey, setFitKey] = useState(0)

  // «Yangilandi 15 s oldin» — vaqt holatda, render toza qoladi
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000)
    return () => clearInterval(timer)
  }, [])

  const age = tracking ? now - Date.parse(tracking.at) : Infinity
  const fresh = age < TRACKING_FRESH_MS
  // Juda eski nuqta — kuryer bu yerda EMAS; xaritada ko'rsatilmaydi
  const lost = tracking !== null && !(age < TRACKING_HIDE_MS)
  // Yangi joylashuv kelgandagina yangi obyekt — xarita har renderda siljimasin
  const courier = useMemo<Point | null>(
    () => (tracking && !lost ? { lat: tracking.lat, lng: tracking.lng } : null),
    [tracking, lost],
  )
  const arrived = onWay && Boolean(order.arrivedAt)
  // Kuryer avval boshqa manzillarga borsa — masofa ular orqali (boshqa
  // mijozlarning joyi ko'rsatilmaydi, faqat soni)
  const km = tracking && home && !lost ? remainingKm(tracking, home) : null
  const minutes = tracking && home && fresh ? liveMinutes(tracking, home) : null
  const stopsBefore = tracking && !lost ? tracking.stopsBefore : 0
  // Buyurtmadagi raqam, bo'lmasa kuzatuvdagisi (oldin olingan buyurtmalar uchun)
  const phone = onWay ? order.courierPhone || tracking?.courierPhone || null : null
  const seconds = Math.max(0, Math.round(age / 1000))

  const closed = order.status === 'Bekor qilingan' || order.status === 'Rad etildi'
  const title = arrived
    ? t('delivery.arrivedTitle')
    : onWay
      ? minutes !== null ? t('delivery.minutesLeft', { n: minutes }) : t('delivery.onWayTitle')
      : t(`status.${order.status}` as TranslationKey)
  // Yo'lda bo'lmagan buyurtma — nima kutish kerakligi
  const note: TranslationKey = order.status === 'Yetkazildi'
    ? 'map.noteDelivered'
    : closed ? 'map.noteClosed' : 'map.notePreparing'

  return (
    <div className="lts" role="dialog" aria-modal="true">
      <div className="lts__map">
        <MapContainer
          center={home ? [home.lat, home.lng] : [41.3111, 69.2797]}
          zoom={14}
          zoomControl={false}
          attributionControl={false}
          className="h-full w-full"
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Camera courier={courier} home={home} follow={follow} fitKey={fitKey} />
          {courier && home && (
            <Polyline
              positions={[[courier.lat, courier.lng], [home.lat, home.lng]]}
              pathOptions={{ color: '#0a7a3d', weight: 4, dashArray: '2 10', lineCap: 'round', opacity: 0.8 }}
            />
          )}
          {home && <Marker position={[home.lat, home.lng]} icon={homeIcon} />}
          {courier && <Marker position={[courier.lat, courier.lng]} icon={fresh ? carIcon : carIconStale} zIndexOffset={1000} />}
        </MapContainer>

        <button className="lts__back" onClick={onClose} aria-label={t('common.back')}>
          <ChevronLeft size={22} />
        </button>
        {courier && (
          <button
            className={'lts__follow ' + (follow ? 'is-on' : '')}
            onClick={() => {
              setFollow((v) => !v)
              if (follow) setFitKey((k) => k + 1)
            }}
            aria-pressed={follow}
            aria-label={t('delivery.follow')}
          >
            <Crosshair size={20} />
          </button>
        )}
      </div>

      <div className={'lts__card ' + (arrived ? 'is-arrived' : '') + (closed ? ' is-closed' : '')}>
        <span className="lts__grip" />
        <div className="flex items-center gap-3">
          <span className="lts__avatar">
            {onWay ? (order.courierName || 'K').charAt(0).toUpperCase() : <MapPin size={22} />}
          </span>
          <div className="min-w-0 flex-1">
            <b className="block text-lg font-extrabold" style={{ color: 'var(--ink)' }}>{title}</b>
            {onWay ? (
              <>
                {/* Kuryer: ismi va raqami — raqam bosilsa ham qo'ng'iroq */}
                <span className="lts__who">
                  <span className="truncate">{order.courierName || t('rating.courier')}</span>
                  {phone && (
                    <a className="lts__phone" href={telHref(phone)}>{formatPhone(phone)}</a>
                  )}
                </span>
                <span className="block truncate text-xs" style={{ color: 'var(--faint)' }}>
                  {datedNumber(order.orderNumber, order.orderDay, order.createdAt)}{km !== null && !arrived ? ` · ${fresh ? '' : '~'}${formatKm(km, lang)}` : ''}
                </span>
              </>
            ) : (
              <span className="block truncate text-sm" style={{ color: 'var(--muted)' }}>
                {datedNumber(order.orderNumber, order.orderDay, order.createdAt)} · {order.customer?.address || '—'}
              </span>
            )}
          </div>
          {phone && (
            <a className="lts__call" href={telHref(phone)} aria-label={t('delivery.call')}>
              <Phone size={19} />
            </a>
          )}
        </div>

        {onWay && !arrived && stopsBefore > 0 && (
          <p className="lts__stops">
            <MapPinned size={15} /> {t('delivery.stopsBeforeLong', { n: stopsBefore })}
          </p>
        )}

        {!onWay ? (
          <p className="lts__status">
            <Info size={14} className="shrink-0" /> {t(note)}
          </p>
        ) : (
        <p className={'lts__status ' + (fresh ? 'is-live' : lost ? 'is-lost' : '')}>
          {tracking ? (
            <>
              <Radio size={14} className="shrink-0" />
              {fresh
                ? t('delivery.updated', { s: agoText(seconds, lang) })
                : lost
                  ? t('delivery.lost', { ago: agoText(seconds, lang) })
                  : t('delivery.staleAgo', { ago: agoText(seconds, lang) })}
            </>
          ) : (
            t('delivery.noLocation')
          )}
        </p>
        )}

        <button className="lts__receipt" onClick={() => onReceipt(order)}>
          <Receipt size={16} /> {t('delivery.receipt')}
        </button>
      </div>
    </div>
  )
}
