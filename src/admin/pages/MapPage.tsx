import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { Bike, ChevronRight, Clock, Layers, LocateFixed, MapPinned, Phone, Radio, Smartphone, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import { useCourierLocations, useOrders, useStaff, type AdminOrder, type CourierLocationRow } from '../lib/live'
import type { Staff } from '../lib/auth'
import { planRoute, type Point } from '../../courier/route'
import { datedNumber } from '../../utils/order-label'
import { formatPhone, telHref } from '../../utils/phone'

/** Toshkent markazi — ma'lumot kelguncha. */
const CENTER: [number, number] = [41.3111, 69.2797]

/**
 * Kuryer ranglari — bir-biridan yaqqol farq qiladigan tuslar. Yashil
 * ataylab yo'q: xaritada yashil «jonli» degani (joylashuv yangiligi).
 */
const PALETTE = ['#2563eb', '#e11d48', '#f59e0b', '#7c3aed', '#0891b2', '#ea580c', '#db2777', '#4f46e5', '#0d9488', '#a16207']
/** Hali hech kim olmagan buyurtma. */
const WAITING = '#64748b'

type Freshness = 'fresh' | 'recent' | 'lost'

/** Joylashuv qanchalik yangi: 2 daq — jonli, 10 daq — eskiroq, undan keyin — aloqa uzilgan. */
function freshness(at: string, now: number): Freshness {
  const age = now - Date.parse(at)
  if (!Number.isFinite(age) || age > 10 * 60_000) return 'lost'
  return age > 2 * 60_000 ? 'recent' : 'fresh'
}

const FRESH_TEXT: Record<Freshness, string> = { fresh: 'jonli', recent: 'biroz eski', lost: 'aloqa uzilgan' }

function ago(at: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(at)) / 1000))
  if (!Number.isFinite(s)) return '—'
  if (s < 60) return `${s} s oldin`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} daq oldin`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h} soat oldin` : `${Math.floor(h / 24)} kun oldin`
}

const pointOf = (o: AdminOrder): Point | null => {
  const loc = o.customer?.location
  return loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng) ? { lat: loc.lat, lng: loc.lng } : null
}

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)

/** Buyurtma holati — popup va ro'yxatda. */
function stopState(o: AdminOrder, now: number): string {
  if (o.arrivedAt) return '📍 Kuryer eshik oldida'
  if (o.etaAt) {
    const left = Math.ceil((Date.parse(o.etaAt) - now) / 60_000)
    if (Number.isFinite(left)) return left > 0 ? `🕒 ~${left} daq` : '⏰ vaqti o‘tdi'
  }
  return '🚚 yo‘lda'
}

/** Kuryer belgisi: rangli doira, bosh harf, ostida ism; yangiligi — kichik nuqta. */
function courierIcon(name: string, color: string, state: Freshness, heading: number | null, dim: boolean, selected: boolean) {
  const arrow = heading !== null && state === 'fresh'
    ? `<i class="amap-courier__arrow" style="transform: rotate(${heading}deg)"></i>`
    : ''
  const cls = ['amap-courier', `is-${state}`, dim ? 'is-dim' : '', selected ? 'is-selected' : ''].join(' ')
  return L.divIcon({
    className: '',
    html:
      `<div class="${cls}" style="--c:${color}">` +
      `<div class="amap-courier__dot">${arrow}<span>${escape(name.charAt(0).toUpperCase())}</span><em></em></div>` +
      `<b class="amap-courier__name">${escape(name)}</b></div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -24],
  })
}

/** Buyurtma pini — raqami yozilgan yorliq; marshrutda tartib raqami bilan. */
function orderIcon(label: string, color: string, step: number | null, dim: boolean) {
  const cls = ['amap-pin', dim ? 'is-dim' : '', step === null ? '' : 'has-step'].join(' ')
  return L.divIcon({
    className: '',
    html:
      `<div class="${cls}" style="--c:${color}">` +
      (step === null ? '' : `<i>${step}</i>`) +
      `<span>${escape(label)}</span></div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -30],
  })
}

/** Berilgan nuqtalarga sig'diradi — `trigger` o'zgarganda (tanlov, tugma). */
function FitTo({ points, trigger }: { points: [number, number][]; trigger: number }) {
  const map = useMap()
  const fitted = useRef(-1)
  useEffect(() => {
    if (fitted.current === trigger || points.length === 0) return
    // O'lchami hali yo'q xaritada (yashirin, yuklanmoqda) hisob NaN beradi
    const size = map.getSize()
    if (!size.x || !size.y) return
    fitted.current = trigger
    if (points.length === 1) map.setView(points[0], 15, { animate: true })
    else map.fitBounds(L.latLngBounds(points), { padding: [56, 56], maxZoom: 15, animate: true })
  }, [map, points, trigger])
  return null
}

/** Ro'yxatdan tanlangan buyurtmaga uchib boradi. */
function FlyTo({ target }: { target: { lat: number; lng: number; key: number } | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], 16, { duration: 0.7 })
  }, [map, target])
  return null
}

type CourierView = {
  uid: string
  name: string
  color: string
  loc: CourierLocationRow | null
  state: Freshness
  stops: AdminOrder[]
  onShift: boolean | undefined
  phone: string | null
}

/**
 * Kuryerlar xaritasi — kim qayerda va nimani olib ketyapti.
 *
 * Ikki rejim:
 *   Umumiy     — hamma kuryer va buyurtmalar; har kuryer o'z rangida,
 *                pinlarda buyurtma raqami. Yo'nalish chiziqlari YO'Q —
 *                bir-biriga aralashib, hech narsa tushunarsiz bo'lardi.
 *   Tanlangan  — bitta kuryer: uning yo'nalishi (yaqinlik tartibida,
 *                raqamlangan), qolgan kuryerlar xiralashadi. Ro'yxatda
 *                to'xtash joylari tartib bilan.
 *
 * Joylashuv: Telegram «Jonli joylashuv»i yoki ochiq mini app. Kuryer
 * belgisidagi kichik nuqta: yashil — jonli, sariq — biroz eski, kulrang
 * — aloqa uzilgan (10 daqiqadan ortiq).
 */
export default function MapPage({ me }: { me: Staff }) {
  const { rows: locations, loading } = useCourierLocations()
  const { orders } = useOrders()
  // Smena holati — xodimlar ro'yxati faqat egaga ochiq (Rules)
  const { staff } = useStaff(me.role === 'owner')
  const [now, setNow] = useState(() => Date.now())
  const [selected, setSelected] = useState<string | null>(null)
  const [fly, setFly] = useState<{ lat: number; lng: number; key: number } | null>(null)
  const [fitTrigger, setFitTrigger] = useState(0)
  const orderMarkers = useRef(new Map<string, L.Marker>())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(timer)
  }, [])

  const active = useMemo(() => orders.filter((o) => o.status === 'Yetkazilmoqda' && o.courierId), [orders])
  const waiting = useMemo(() => orders.filter((o) => o.status === 'Qabul qilindi' && !o.courierId && pointOf(o)), [orders])

  // Har kuryer: joylashuv, rang va yo'ldagi buyurtmalar (yaqinlik tartibida)
  const couriers = useMemo<CourierView[]>(() => {
    const byId = new Map<string, { loc: CourierLocationRow | null; name: string; orders: AdminOrder[] }>()
    for (const l of locations) byId.set(l.uid, { loc: l, name: l.name, orders: [] })
    for (const o of active) {
      const row = byId.get(o.courierId!) ?? { loc: null, name: o.courierName || 'Kuryer', orders: [] }
      row.orders.push(o)
      byId.set(o.courierId!, row)
    }
    // Rang ism bo'yicha tartibda — kuryer har ochilganda o'z rangida qoladi
    const order = [...byId.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name))
    return order.map(([uid, row], i) => {
      const plan = planRoute(row.orders, pointOf, row.loc ? { lat: row.loc.lat, lng: row.loc.lng } : null)
      const person = staff.find((s) => s.uid === uid)
      return {
        uid,
        name: row.name,
        color: PALETTE[i % PALETTE.length],
        loc: row.loc,
        state: row.loc ? freshness(row.loc.at, now) : ('lost' as Freshness),
        stops: plan.stops.map((s) => s.item),
        onShift: person?.onShift,
        // Joylashuv hujjatida (server/bot yozadi), xodimlar ro'yxatida yoki buyurtmada
        phone: row.loc?.phone || person?.phone || row.orders.find((o) => o.courierPhone)?.courierPhone || null,
      }
    }).sort((a, b) => {
      const rank = { fresh: 0, recent: 1, lost: 2 }
      return b.stops.length - a.stops.length || rank[a.state] - rank[b.state]
    })
  }, [locations, active, staff, now])

  const chosen = couriers.find((c) => c.uid === selected) ?? null
  const colorOf = useMemo(() => new Map(couriers.map((c) => [c.uid, c.color])), [couriers])

  // Qaysi nuqtalarga sig'dirish: tanlangan kuryer va uning manzillari, yoki hammasi
  const fitPoints = useMemo(() => {
    const pts: [number, number][] = []
    const add = (p: Point | null) => p && pts.push([p.lat, p.lng])
    if (chosen) {
      if (chosen.loc) add(chosen.loc)
      chosen.stops.forEach((o) => add(pointOf(o)))
      return pts
    }
    couriers.forEach((c) => c.loc && add(c.loc))
    ;[...active, ...waiting].forEach((o) => add(pointOf(o)))
    return pts
  }, [chosen, couriers, active, waiting])

  const choose = (uid: string | null) => {
    setSelected((prev) => (prev === uid ? null : uid))
    setFitTrigger((n) => n + 1)
  }

  const focusOrder = (o: AdminOrder) => {
    const p = pointOf(o)
    if (!p) return
    setFly((prev) => ({ ...p, key: (prev?.key ?? 0) + 1 }))
    setTimeout(() => orderMarkers.current.get(o.id)?.openPopup(), 750)
  }

  const liveCount = couriers.filter((c) => c.state === 'fresh').length
  const stepOf = new Map(chosen?.stops.map((o, i) => [o.id, i + 1]) ?? [])

  // Tanlangan kuryer yo'nalishi: kuryer → 1 → 2 → …
  const route: [number, number][] = []
  if (chosen?.loc && chosen.stops.length) {
    route.push([chosen.loc.lat, chosen.loc.lng])
    for (const o of chosen.stops) {
      const p = pointOf(o)
      if (p) route.push([p.lat, p.lng])
    }
  }

  return (
    <div className="amap">
      {/* Kuryerlar ro'yxati */}
      <aside className="adm-card amap__side">
        <div className="amap__summary">
          <span><b>{liveCount}</b> jonli</span>
          <span><b>{active.length}</b> yo‘lda</span>
          <span><b>{waiting.length}</b> kutmoqda</span>
        </div>

        <div className="amap__list">
          <button className={'amap__all ' + (chosen ? '' : 'is-on')} onClick={() => choose(null)}>
            <Layers size={16} />
            <span className="flex-1 text-left">Hammasi</span>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>yo‘nalishsiz umumiy ko‘rinish</span>
          </button>

          {loading ? (
            <p className="p-3 text-sm" style={{ color: 'var(--muted)' }}>Yuklanmoqda…</p>
          ) : couriers.length === 0 ? (
            <div className="p-3 text-sm" style={{ color: 'var(--muted)' }}>
              <MapPinned size={26} style={{ color: 'var(--faint)' }} />
              <p className="mt-2 font-bold" style={{ color: 'var(--ink)' }}>Hali joylashuv yo‘q</p>
              <p className="mt-1">Kuryer smenani boshlab, botga «Jonli joylashuv» yuborsa — shu yerda ko‘rinadi.</p>
            </div>
          ) : (
            <ul className="amap__couriers">
              {couriers.map((c) => {
                const on = c.uid === selected
                return (
                  <li key={c.uid} className={'amap__courier ' + (on ? 'is-on' : '')} style={{ ['--c' as string]: c.color }}>
                    <div className="amap__row">
                    <button className="amap__item" onClick={() => choose(c.uid)} aria-expanded={on}>
                      <span className={'amap__dot is-' + c.state}>{c.name.charAt(0).toUpperCase()}</span>
                      <span className="min-w-0 flex-1 text-left">
                        <b className="block truncate text-sm">{c.name}</b>
                        {c.phone && <span className="amap__phone">{formatPhone(c.phone)}</span>}
                        <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--muted)' }}>
                          {c.loc ? (
                            <>
                              {c.loc.source === 'live' ? <Radio size={12} /> : <Smartphone size={12} />}
                              {c.state === 'lost' ? 'aloqa uzilgan · ' : ''}{ago(c.loc.at, now)}
                            </>
                          ) : 'joylashuv yo‘q'}
                          {c.onShift === false && ' · dam olmoqda'}
                        </span>
                      </span>
                      <span className="amap__count" title="Yo‘ldagi buyurtmalar">
                        <Bike size={12} /> {c.stops.length}
                      </span>
                      <ChevronRight size={16} className="amap__chev" />
                    </button>
                    {c.phone && (
                      <a className="amap__call" href={telHref(c.phone)} title={`Qo‘ng‘iroq: ${formatPhone(c.phone)}`} aria-label={`${c.name}ga qo‘ng‘iroq`}>
                        <Phone size={16} />
                      </a>
                    )}
                    </div>

                    {on && (
                      <ol className="amap__stops">
                        {c.stops.length === 0 && (
                          <li className="amap__stop-empty">Yo‘lda buyurtma yo‘q</li>
                        )}
                        {c.stops.map((o, i) => (
                          <li key={o.id}>
                            <button className="amap__stop" onClick={() => focusOrder(o)}>
                              <i>{i + 1}</i>
                              <span className="min-w-0 flex-1 text-left">
                                <b className="block text-sm">
                                  {datedNumber(o.orderNumber, o.orderDay)}
                                  <span className="amap__stop-state">{stopState(o, now)}</span>
                                </b>
                                <span className="block truncate text-xs" style={{ color: 'var(--muted)' }}>
                                  {o.customer?.name ? `${o.customer.name} · ` : ''}{o.customer?.address || '—'}
                                </span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ol>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {waiting.length > 0 && (
            <div className="amap__waiting">
              <p className="amap__section"><Clock size={13} /> Hech kim olmagan</p>
              {waiting.map((o) => (
                <button key={o.id} className="amap__stop" onClick={() => focusOrder(o)}>
                  <i className="is-waiting">•</i>
                  <span className="min-w-0 flex-1 text-left">
                    <b className="block text-sm">{datedNumber(o.orderNumber, o.orderDay)}</b>
                    <span className="block truncate text-xs" style={{ color: 'var(--muted)' }}>{o.customer?.address || '—'}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="amap__legend">
          <span><i className="is-fresh" /> jonli</span>
          <span><i className="is-recent" /> 10 daqiqagacha</span>
          <span><i className="is-lost" /> aloqa uzilgan</span>
          <span><i style={{ background: WAITING }} /> hech kim olmagan</span>
        </div>
      </aside>

      {/* Xarita */}
      <section className="adm-card amap__map">
        <MapContainer center={CENTER} zoom={12} scrollWheelZoom className="h-full w-full">
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
          <FitTo points={fitPoints} trigger={fitTrigger} />
          <FlyTo target={fly} />

          {/* Faqat tanlangan kuryerning yo'nalishi */}
          {route.length > 1 && (
            <>
              <Polyline positions={route} pathOptions={{ color: '#fff', weight: 8, opacity: 0.9 }} />
              <Polyline
                positions={route}
                pathOptions={{ color: chosen!.color, weight: 4, opacity: chosen!.state === 'lost' ? 0.5 : 0.95, dashArray: '1 9', lineCap: 'round' }}
              />
            </>
          )}

          {/* Yo'ldagi buyurtmalar — kuryer rangida, raqami bilan. Tanlovda faqat
              shu kuryerniki, tartib raqami bilan */}
          {couriers.flatMap((c) => {
            if (chosen && c.uid !== chosen.uid) return []
            return c.stops.map((o) => {
              const p = pointOf(o)
              if (!p) return null
              const step = chosen ? stepOf.get(o.id) ?? null : null
              return (
                <Marker
                  key={`o-${o.id}`}
                  position={[p.lat, p.lng]}
                  icon={orderIcon(datedNumber(o.orderNumber, o.orderDay), colorOf.get(c.uid) ?? WAITING, step, false)}
                  zIndexOffset={step ? 500 - step : 0}
                  ref={(m) => {
                    if (m) orderMarkers.current.set(o.id, m)
                    else orderMarkers.current.delete(o.id)
                  }}
                >
                  <Popup>
                    <b>{datedNumber(o.orderNumber, o.orderDay)}</b> · {c.name}{step ? ` · ${step}-manzil` : ''}<br />
                    {o.customer?.name}{o.customer?.phone ? ` · ${o.customer.phone}` : ''}<br />
                    {o.customer?.address}<br />
                    {stopState(o, now)}
                  </Popup>
                </Marker>
              )
            })
          })}

          {/* Hali hech kim olmagan buyurtmalar — kulrang */}
          {waiting.map((o) => {
            const p = pointOf(o)!
            return (
              <Marker
                key={`w-${o.id}`}
                position={[p.lat, p.lng]}
                icon={orderIcon(datedNumber(o.orderNumber, o.orderDay), WAITING, null, chosen !== null)}
                ref={(m) => {
                  if (m) orderMarkers.current.set(o.id, m)
                  else orderMarkers.current.delete(o.id)
                }}
              >
                <Popup>
                  <b>{datedNumber(o.orderNumber, o.orderDay)}</b> — hali hech kim olmagan<br />
                  {o.customer?.address}
                </Popup>
              </Marker>
            )
          })}

          {/* Kuryerlar — tanlanmaganlari xira */}
          {couriers.map((c) => c.loc && (
            <Marker
              key={`c-${c.uid}`}
              position={[c.loc.lat, c.loc.lng]}
              icon={courierIcon(c.name, c.color, c.state, c.loc.heading, chosen !== null && chosen.uid !== c.uid, chosen?.uid === c.uid)}
              zIndexOffset={chosen?.uid === c.uid ? 2000 : 1000}
              eventHandlers={{ click: () => chosen?.uid !== c.uid && choose(c.uid) }}
            >
              <Popup>
                <b>{c.name}</b> · {FRESH_TEXT[c.state]}<br />
                {c.phone && <><a href={telHref(c.phone)}>📞 {formatPhone(c.phone)}</a><br /></>}
                {c.loc.source === 'live' ? '📡 Telegram jonli joylashuvi' : '📱 Ilova'} · {ago(c.loc.at, now)}<br />
                {c.stops.length
                  ? `🛵 Yo‘lda: ${c.stops.map((o) => datedNumber(o.orderNumber, o.orderDay)).join(', ')}`
                  : 'Yo‘lda buyurtma yo‘q'}
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {chosen && (
          <div className="amap__banner" style={{ ['--c' as string]: chosen.color }}>
            <span className="amap__banner-dot">{chosen.name.charAt(0).toUpperCase()}</span>
            <span className="min-w-0 flex-1">
              <b className="block truncate text-sm">{chosen.name}</b>
              <span className="amap__banner-sub">
                {chosen.phone
                  ? formatPhone(chosen.phone)
                  : chosen.stops.length ? `${chosen.stops.length} ta manzil` : 'yo‘lda buyurtma yo‘q'}
              </span>
            </span>
            {chosen.phone && (
              <a className="amap__call" href={telHref(chosen.phone)} aria-label={`${chosen.name}ga qo‘ng‘iroq`}>
                <Phone size={16} />
              </a>
            )}
            <button
              className="amap__banner-close"
              onClick={() => choose(null)}
              title="Hammasini ko‘rsatish"
              aria-label="Hammasini ko‘rsatish"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {fitPoints.length > 0 && (
          <button
            className="amap__fit"
            onClick={() => setFitTrigger((n) => n + 1)}
            title="Sig‘dirib ko‘rsatish"
            aria-label="Sig‘dirib ko‘rsatish"
          >
            <LocateFixed size={18} />
          </button>
        )}
      </section>
    </div>
  )
}
