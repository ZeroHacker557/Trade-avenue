import { Clock, ExternalLink, LogIn, Phone, Search, ShoppingBag, ShoppingCart, Store, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatPrice } from '../../data'
import { useCustomers, useOrders, useProducts, useShops, type AdminOrder, type CustomerRow, type ProductRow } from '../lib/live'
import { Modal } from '../components/Modal'
import { StatusBadge } from '../components/StatusBadge'
import { ago, dateTime } from '../lib/dates'
import { datedNumber } from '../../utils/order-label'

/** Tushumga kirmaydigan holatlar chiqarib tashlanadi. */
const COUNTED = new Set(['Yangi', 'Qabul qilindi', 'Yetkazilmoqda', 'Yetkazildi'])

type Stats = { count: number; spent: number; last: string; first: string }
const EMPTY_STATS: Stats = { count: 0, spent: 0, last: '', first: '' }

const fullName = (c: CustomerRow) => [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Nomsiz'
/** @username — bo'lmasa Telegram ID. */
const handle = (c: CustomerRow) => (c.username ? `@${c.username}` : `ID ${c.id}`)
const cartCount = (c: CustomerRow) => (c.cart ?? []).reduce((s, r) => s + (Number(r.quantity) || 0), 0)

export function CustomersPage() {
  const { customers, loading } = useCustomers()
  // Mijozning umrboqiy xaridi — butun tarix kerak
  const { orders } = useOrders(undefined, 'all')
  const { products } = useProducts()
  const { shops } = useShops()
  const shopName = useMemo(() => new Map(shops.map((s) => [s.id, s.name])), [shops])
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [now] = useState(() => Date.now())

  // Har mijoz uchun buyurtmalar soni, sarflagan summasi, birinchi/oxirgi buyurtma
  const stats = useMemo(() => {
    const map = new Map<string, Stats>()
    for (const order of orders) {
      if (!order.userId) continue
      const key = String(order.userId)
      const entry = map.get(key) || { ...EMPTY_STATS }
      entry.count++
      if (COUNTED.has(order.status)) entry.spent += Number(order.total) || 0
      if (order.createdAt > entry.last) entry.last = order.createdAt
      if (!entry.first || order.createdAt < entry.first) entry.first = order.createdAt
      map.set(key, entry)
    }
    return map
  }, [orders])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase().replace(/^@/, '')
    const rows = customers.map((c) => ({ ...c, fullName: fullName(c), ...(stats.get(c.id) || EMPTY_STATS) }))
    if (!needle) return rows
    return rows.filter(
      (c) =>
        c.fullName.toLowerCase().includes(needle) ||
        (c.username || '').toLowerCase().includes(needle) ||
        (c.phone || '').includes(needle) ||
        c.id.includes(needle),
    )
  }, [customers, stats, query])

  const totals = useMemo(
    () => ({
      withShop: customers.filter((c) => (c.shopIds ?? []).length > 0).length,
      buyers: [...stats.values()].filter((s) => s.count > 0).length,
      withCart: customers.filter((c) => cartCount(c) > 0).length,
    }),
    [customers, stats],
  )

  const open = openId ? customers.find((c) => c.id === openId) ?? null : null

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card label="Jami foydalanuvchilar" value={String(customers.length)} />
        <Card label="Do‘konga ulanganlar" value={String(totals.withShop)} />
        <Card label="Buyurtma berganlar" value={String(totals.buyers)} />
        <Card label="Savatida mahsulot bor" value={String(totals.withCart)} />
      </div>

      <div className="relative mb-4">
        <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--faint)' }} />
        <input
          className="adm-input icon-left"
          placeholder="Ism, @username, telefon yoki ID bo‘yicha qidirish..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="adm-skeleton h-16" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="adm-card adm-empty">
          <Users size={30} />
          <p className="text-sm font-semibold">Foydalanuvchi topilmadi</p>
        </div>
      ) : (
        <>
          {/* Telefon */}
          <div className="flex flex-col gap-2.5 lg:hidden">
            {visible.map((customer) => (
              <button key={customer.id} type="button" className="adm-card p-3.5 text-left" onClick={() => setOpenId(customer.id)}>
                <div className="flex items-center gap-3">
                  <Avatar customer={customer} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-extrabold">{customer.fullName}</p>
                    <p className="truncate text-xs" style={{ color: 'var(--muted)' }}>{handle(customer)}</p>
                  </div>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-extrabold">{customer.count}</span>
                    <span className="block text-xs" style={{ color: 'var(--muted)' }}>buyurtma</span>
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs" style={{ color: 'var(--muted)' }}>
                  <span className="flex items-center gap-1"><Clock size={12} /> {dateTime(customer.lastActive)}</span>
                  {cartCount(customer) > 0 && (
                    <span className="flex items-center gap-1 font-bold" style={{ color: 'var(--brand)' }}>
                      <ShoppingCart size={12} /> savatda {cartCount(customer)} ta
                    </span>
                  )}
                  <span className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{formatPrice(customer.spent)}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Katta ekran */}
          <div className="adm-card hidden overflow-hidden lg:block">
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Foydalanuvchi</th>
                    <th>Username / ID</th>
                    <th>Do‘koni</th>
                    <th>Buyurtmalar</th>
                    <th>Sarflagan</th>
                    <th>Savat</th>
                    <th>Oxirgi kirish</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((customer) => (
                    <tr key={customer.id} onClick={() => setOpenId(customer.id)} style={{ cursor: 'pointer' }}>
                      <td>
                        <span className="flex items-center gap-2.5">
                          <Avatar customer={customer} small />
                          <span className="font-semibold">{customer.fullName}</span>
                        </span>
                      </td>
                      <td style={{ color: 'var(--muted)' }}>{handle(customer)}</td>
                      <td style={{ color: 'var(--muted)' }}>{(customer.shopIds ?? []).map((id) => shopName.get(id) || id).join(', ') || '—'}</td>
                      <td className="font-bold">{customer.count}</td>
                      <td className="font-bold">{formatPrice(customer.spent)}</td>
                      <td>
                        {cartCount(customer) > 0
                          ? <span className="font-bold" style={{ color: 'var(--brand)' }}>{cartCount(customer)} ta</span>
                          : <span style={{ color: 'var(--faint)' }}>—</span>}
                      </td>
                      <td style={{ color: 'var(--muted)' }}>
                        {dateTime(customer.lastActive)}
                        {customer.lastActive && <span className="block text-xs" style={{ color: 'var(--faint)' }}>{ago(customer.lastActive, now)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {open && (
        <CustomerDetail
          customer={open}
          stats={stats.get(open.id) || EMPTY_STATS}
          orders={orders.filter((o) => String(o.userId) === open.id)}
          products={products}
          shopNames={(open.shopIds ?? []).map((id) => shopName.get(id) || id)}
          now={now}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  )
}

// ─── Mijozning to'liq ma'lumoti ───────────────────────────────

function CustomerDetail({
  customer, stats, orders, products, shopNames, now, onClose,
}: {
  customer: CustomerRow
  stats: Stats
  orders: AdminOrder[]
  products: ProductRow[]
  shopNames: string[]
  now: number
  onClose: () => void
}) {
  const name = fullName(customer)
  const tgLink = customer.username ? `https://t.me/${customer.username}` : `tg://user?id=${customer.id}`
  // Birinchi kirish: yozuv bo'lmasa — birinchi buyurtmasi
  const firstSeen = customer.firstSeenAt || stats.first || ''
  const firstSeenNote = customer.firstSeenAt ? '' : stats.first ? ' (birinchi buyurtma)' : ''

  const byId = useMemo(() => new Map(products.map((p) => [String(p.id), p])), [products])
  const cart = (customer.cart ?? []).map((row) => {
    const product = byId.get(String(row.key).split('_')[0])
    // O'ramli mahsulot: savatda quti soni, narx bazada DONADA
    const pack = product?.pack && product.pack > 1 ? product.pack : 1
    return { row, product, pack, sum: (product?.price ?? 0) * pack * (Number(row.quantity) || 0) }
  })
  const cartTotal = cart.reduce((s, c) => s + c.sum, 0)
  const sortedOrders = [...orders].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))

  return (
    <Modal wide title={name} onClose={onClose}>
      {/* Profil */}
      <div className="flex flex-wrap items-center gap-4">
        <Avatar customer={customer} large />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-extrabold">{name}</p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {customer.username ? <>@{customer.username} · </> : null}ID {customer.id}
            {customer.language ? ` · ${customer.language === 'ru' ? 'Ruscha' : 'O‘zbekcha'}` : ''}
          </p>
          {customer.phone && (
            <a className="mt-1 inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--brand)' }} href={`tel:${customer.phone.replace(/\s/g, '')}`}>
              <Phone size={14} /> {customer.phone}
            </a>
          )}
        </div>
        <a className="adm-btn adm-btn--ghost" href={tgLink} target="_blank" rel="noreferrer">
          <ExternalLink size={15} /> Telegram’da yozish
        </a>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Info icon={<LogIn size={15} />} label="Birinchi kirgan" value={dateTime(firstSeen)} hint={firstSeen ? `${ago(firstSeen, now)}${firstSeenNote}` : 'ma’lumot yo‘q'} />
        <Info icon={<Clock size={15} />} label="Oxirgi kirgan" value={dateTime(customer.lastActive)} hint={ago(customer.lastActive, now)} />
        <Info icon={<ShoppingBag size={15} />} label="Buyurtmalar" value={`${stats.count} ta`} hint={formatPrice(stats.spent)} />
        <Info icon={<Store size={15} />} label="Do‘konlari" value={shopNames.length ? `${shopNames.length} ta` : 'ulanmagan'} hint={shopNames.join(', ')} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {/* Savat */}
        <section className="rounded-2xl p-4" style={{ background: 'var(--surface-2)' }}>
          <h3 className="flex items-center gap-2 text-sm font-extrabold">
            <ShoppingCart size={16} /> Savatida
            {cart.length > 0 && <span className="ml-auto text-sm font-extrabold" style={{ color: 'var(--brand)' }}>{formatPrice(cartTotal)}</span>}
          </h3>
          {cart.length === 0 ? (
            <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>Savat bo‘sh.</p>
          ) : (
            <>
              <ul className="mt-2 flex flex-col gap-2">
                {cart.map(({ row, product, pack, sum }) => (
                  <li key={row.key} className="flex items-center gap-3 rounded-xl p-2" style={{ background: 'var(--surface)' }}>
                    <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg" style={{ background: '#fff' }}>
                      {product?.images?.[0] ? <img src={product.thumbs?.[0] || product.images[0]} alt="" className="size-full object-contain" /> : <ShoppingBag size={18} style={{ color: 'var(--faint)' }} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{product?.name ?? 'O‘chirilgan mahsulot'}</span>
                      <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                        {row.quantity} × {product ? formatPrice(product.price * pack) : '—'}{pack > 1 ? ` (${pack} dona)` : ''}
                        {[row.size, row.color].filter(Boolean).length ? ` · ${[row.size, row.color].filter(Boolean).join(', ')}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-extrabold">{product ? formatPrice(sum) : ''}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs" style={{ color: 'var(--faint)' }}>Savat yangilangan: {dateTime(customer.cartUpdatedAt)} {customer.cartUpdatedAt ? `· ${ago(customer.cartUpdatedAt, now)}` : ''}</p>
            </>
          )}
        </section>

        {/* Kirishlar */}
        <section className="rounded-2xl p-4" style={{ background: 'var(--surface-2)' }}>
          <h3 className="flex items-center gap-2 text-sm font-extrabold">
            <LogIn size={16} /> Ilovaga kirishlar
            {customer.visitCount ? <span className="ml-auto text-xs font-bold" style={{ color: 'var(--muted)' }}>jami {customer.visitCount} marta</span> : null}
          </h3>
          {customer.visits?.length ? (
            <ul className="mt-2 grid max-h-64 grid-cols-1 gap-1 overflow-y-auto text-sm sm:grid-cols-2">
              {customer.visits.map((v, i) => (
                <li key={i} className="flex justify-between gap-2 rounded-lg px-2.5 py-1.5" style={{ background: 'var(--surface)' }}>
                  <span>{dateTime(v)}</span>
                  <span className="text-xs" style={{ color: 'var(--faint)' }}>{ago(v, now)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
              Kirishlar tarixi keyingi kirishdan boshlab yoziladi. Oxirgi kirish: {dateTime(customer.lastActive)}.
            </p>
          )}
        </section>
      </div>

      {/* Buyurtmalar */}
      <section className="mt-4">
        <h3 className="flex items-center gap-2 text-sm font-extrabold"><ShoppingBag size={16} /> Buyurtmalar tarixi</h3>
        {sortedOrders.length === 0 ? (
          <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>Hali buyurtma bermagan.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {sortedOrders.slice(0, 20).map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 rounded-xl px-3 py-2" style={{ background: 'var(--surface-2)' }}>
                <span className="font-extrabold">{datedNumber(o.orderNumber, o.orderDay)}</span>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>{dateTime(o.createdAt)}</span>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>{(o.products ?? []).length} xil</span>
                <span className="ml-auto"><StatusBadge status={o.status} /></span>
                <span className="w-28 text-right text-sm font-extrabold">{formatPrice(o.total)}</span>
              </li>
            ))}
            {sortedOrders.length > 20 && <li className="text-xs" style={{ color: 'var(--muted)' }}>… va yana {sortedOrders.length - 20} ta</li>}
          </ul>
        )}
      </section>
    </Modal>
  )
}

function Info({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl p-3" style={{ background: 'var(--surface-2)' }}>
      <p className="flex items-center gap-1.5 text-xs font-bold" style={{ color: 'var(--muted)' }}>{icon} {label}</p>
      <p className="mt-1 truncate text-sm font-extrabold">{value}</p>
      {hint && <p className="truncate text-xs" style={{ color: 'var(--faint)' }}>{hint}</p>}
    </div>
  )
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="adm-card adm-stat">
      <span className="adm-stat__icon" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>
        <ShoppingBag size={18} />
      </span>
      <p className="adm-stat__label">{label}</p>
      <p className="adm-stat__value">{value}</p>
    </div>
  )
}

function Avatar({ customer, small, large }: { customer: CustomerRow; small?: boolean; large?: boolean }) {
  const size = large ? 'size-16 text-xl' : small ? 'size-8 text-xs' : 'size-10 text-sm'
  if (customer.photo_url) {
    return <img src={customer.photo_url} alt="" className={'shrink-0 rounded-full object-cover ' + size} />
  }
  return (
    <span className={'grid shrink-0 place-items-center rounded-full font-extrabold ' + size} style={{ background: 'var(--brand-soft)', color: 'var(--brand-strong)' }}>
      {fullName(customer).charAt(0).toUpperCase()}
    </span>
  )
}
