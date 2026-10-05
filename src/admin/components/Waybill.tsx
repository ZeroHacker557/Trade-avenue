import { formatPrice } from '../../data'
import { datedNumber } from '../../utils/order-label'
import { BRAND } from '../../config/brand'
import { useContact, type AdminOrder, type CompanySettings } from '../lib/live'
import { bundleText } from '../../utils/bundle'
import { isCashPayment } from '../../utils/payment'
import { sumInWords } from '../lib/words'

/**
 * Chop etiladigan hujjatlar: nakladnoy (yuk xati) va kuryer marshrut varaqasi.
 *
 * Chekdan farqi — rasmiy hujjat: yetkazib beruvchi rekvizitlari (Sozlamalar →
 * Kompaniya rekvizitlari), o'lchov birligi bilan jadval, summa so'z bilan,
 * «Topshirdi / Qabul qildi» imzolari va muhr joyi. Bir nechta buyurtma
 * tanlansa — har biri alohida sahifada.
 *
 * Ranglar qattiq yozilgan: printer qorong'i rejim tokenlarini bilmaydi.
 */

const STYLE = `
  .wb { color: #111; font-size: 9.5pt; line-height: 1.35; }
  .wb-page { break-after: page; page-break-after: always; }
  .wb-page:last-child { break-after: auto; page-break-after: auto; }
  .wb h1 { margin: 0; font-size: 15pt; font-weight: 800; letter-spacing: 0.02em; }
  .wb__top { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px;
    border-bottom: 2px solid #111; padding-bottom: 8px; }
  .wb__top small { display: block; color: #555; font-size: 8.5pt; }
  .wb__no { text-align: right; white-space: nowrap; }
  .wb__no b { font-size: 13pt; }
  .wb__parties { display: flex; gap: 14px; margin-top: 12px; }
  .wb__parties section { flex: 1 1 0; min-width: 0; border: 1px solid #bbb; border-radius: 4px; padding: 7px 9px; }
  .wb__parties h3 { margin: 0 0 4px; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.1em; color: #666; }
  .wb__parties p { margin: 0 0 1px; overflow-wrap: anywhere; }
  .wb table { width: 100%; margin-top: 12px; border-collapse: collapse; font-size: 9pt; }
  .wb th, .wb td { border: 1px solid #999; padding: 4px 6px; vertical-align: top; }
  .wb th { background: #f0f0f0; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.05em; }
  .wb td.num, .wb th.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .wb td.c { text-align: center; }
  .wb tr { break-inside: avoid; page-break-inside: avoid; }
  .wb small.v { color: #555; }
  .wb__sum { margin-left: auto; margin-top: 8px; width: 78mm; max-width: 100%; }
  .wb__sum div { display: flex; justify-content: space-between; gap: 10px; padding: 2px 0; }
  .wb__sum .total { border-top: 1.5px solid #111; margin-top: 4px; padding-top: 5px; font-size: 11.5pt; font-weight: 800; }
  .wb__words { margin-top: 8px; padding: 6px 9px; background: #f5f5f5; border-left: 3px solid #111; }
  .wb__pay { margin-top: 6px; }
  .wb__signs { display: flex; gap: 22px; margin-top: 26px; }
  .wb__signs div { flex: 1 1 0; }
  .wb__signs span { display: block; margin-top: 22px; border-top: 1px solid #111; padding-top: 3px;
    font-size: 8pt; color: #555; }
  .wb__stamp { margin-top: 10px; font-size: 8pt; color: #777; }
  .wb__foot { margin-top: 14px; font-size: 8pt; color: #777; }
`

function Supplier({ company }: { company: CompanySettings }) {
  return (
    <section>
      <h3>Yetkazib beruvchi</h3>
      <p><b>{company.legalName || BRAND.legalName}</b></p>
      {company.inn && <p>STIR: {company.inn}</p>}
      <p>{company.address || BRAND.city}</p>
      <p>Tel: {company.phone || BRAND.phone}</p>
      {company.bank && <p>Bank: {company.bank}</p>}
      {company.account && <p>H/r: {company.account}{company.mfo ? ` · MFO ${company.mfo}` : ''}</p>}
    </section>
  )
}

const dateText = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

function WaybillPage({ order, company }: { order: AdminOrder; company: CompanySettings }) {
  const contact = useContact()
  const lines = order.products || []
  const subtotal = order.subtotal ?? lines.reduce((s, l) => s + (l.product?.price || 0) * (l.quantity || 0), 0)
  const recipient = order.customer?.recipientName
  const paid = order.paymentStatus === 'Tolangan'
  return (
    <div className="wb-page">
      <header className="wb__top">
        <div>
          <h1>NAKLADNOY (YUK XATI)</h1>
          <small>{company.legalName || BRAND.legalName} · {BRAND.tagline}</small>
        </div>
        <div className="wb__no">
          <b>№ {datedNumber(order.orderNumber, order.orderDay, order.createdAt)}</b>
          <small>{dateText(order.createdAt)}</small>
        </div>
      </header>

      <div className="wb__parties">
        <Supplier company={company} />
        <section>
          <h3>Qabul qiluvchi</h3>
          <p><b>{recipient || order.customer?.name || '—'}</b></p>
          <p>Tel: {order.customer?.recipientPhone || order.customer?.phone || '—'}</p>
          <p>{order.customer?.address || '—'}</p>
          {recipient && <p>Buyurtmachi: {order.customer?.name} · {order.customer?.phone}</p>}
        </section>
      </div>

      <table>
        <thead>
          <tr>
            <th className="c" style={{ width: '7mm' }}>№</th>
            <th>Mahsulot nomi</th>
            <th className="c" style={{ width: '14mm' }}>O‘lchov</th>
            <th className="num" style={{ width: '13mm' }}>Soni</th>
            <th className="num" style={{ width: '26mm' }}>Narxi</th>
            <th className="num" style={{ width: '28mm' }}>Summasi</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => {
            const price = line.product?.price || 0
            const qty = line.quantity || 0
            const variant = [line.size, line.color].filter(Boolean).join(', ')
            return (
              <tr key={line.cartKey || i}>
                <td className="c">{i + 1}</td>
                <td>
                  {line.product?.name || '—'}
                  {variant && <small className="v"> ({variant})</small>}
                  {!!line.product?.bundle?.length && <small className="v"><br />{bundleText(line.product.bundle)}</small>}
                </td>
                <td className="c">dona</td>
                <td className="num">{qty}</td>
                <td className="num">{formatPrice(price)}</td>
                <td className="num">{formatPrice(price * qty)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="wb__sum">
        <div><span>Mahsulotlar</span><span>{formatPrice(subtotal)}</span></div>
        {!!order.discount && <div><span>Chegirma{order.promoCode ? ` (${order.promoCode})` : ''}</span><span>− {formatPrice(order.discount)}</span></div>}
        {!!order.deliveryFee && <div><span>Yetkazib berish</span><span>{formatPrice(order.deliveryFee)}</span></div>}
        <div className="total"><span>JAMI</span><span>{formatPrice(order.total)}</span></div>
      </div>

      <p className="wb__words"><b>Summa so‘z bilan:</b> {sumInWords(order.total)}</p>
      <p className="wb__pay">
        To‘lov: <b>{isCashPayment(order.paymentMethod) ? 'Naqd pul' : order.paymentMethod}</b>
        {paid ? ' — to‘langan' : isCashPayment(order.paymentMethod) ? ' — yetkazilganda olinadi' : order.paymentStatus ? ` — ${order.paymentStatus}` : ''}
      </p>
      {order.customer?.comment && <p className="wb__pay"><b>Izoh:</b> {order.customer.comment}</p>}

      <div className="wb__signs">
        <div>Topshirdi{order.courierName ? ` (kuryer: ${order.courierName})` : ''}<span>imzo / F.I.Sh.</span></div>
        <div>Qabul qildi<span>imzo / F.I.Sh.</span></div>
        <div>Rahbar{company.director ? `: ${company.director}` : ''}<span>imzo</span></div>
      </div>
      <p className="wb__stamp">M.O‘.</p>
      <p className="wb__foot">Mahsulot soni va sifatiga e’tirozim yo‘q. · @{contact.telegram} · {contact.phone}</p>
    </div>
  )
}

export function WaybillDoc({ orders, company }: { orders: AdminOrder[]; company: CompanySettings }) {
  return (
    <div className="wb">
      <style>{STYLE}</style>
      {orders.map((order) => <WaybillPage key={order.id} order={order} company={company} />)}
    </div>
  )
}

/**
 * Kuryer marshrut varaqasi — tanlangan buyurtmalar bitta jadvalda:
 * manzil, telefon, to'lov va olinadigan naqd pul, imzo ustuni.
 */
export function RouteSheetDoc({ orders, company }: { orders: AdminOrder[]; company: CompanySettings }) {
  const couriers = [...new Set(orders.map((o) => o.courierName).filter(Boolean))]
  const total = orders.reduce((s, o) => s + (o.total || 0), 0)
  const cash = orders
    .filter((o) => isCashPayment(o.paymentMethod) && o.paymentStatus !== 'Tolangan')
    .reduce((s, o) => s + (o.total || 0), 0)
  const days = [...new Set(orders.map((o) => dateText(o.createdAt)))]
  return (
    <div className="wb">
      <style>{STYLE}</style>
      <div className="wb-page">
        <header className="wb__top">
          <div>
            <h1>MARSHRUT VARAQASI</h1>
            <small>{company.legalName || BRAND.legalName} · {days.join(', ')}</small>
          </div>
          <div className="wb__no">
            <b>{orders.length} ta buyurtma</b>
            <small>Kuryer: {couriers.length ? couriers.join(', ') : '________________'}</small>
          </div>
        </header>
        <table>
          <thead>
            <tr>
              <th className="c" style={{ width: '7mm' }}>№</th>
              <th style={{ width: '17mm' }}>Buyurtma</th>
              <th>Mijoz / telefon</th>
              <th>Manzil</th>
              <th style={{ width: '22mm' }}>To‘lov</th>
              <th className="num" style={{ width: '24mm' }}>Summa</th>
              <th style={{ width: '20mm' }}>Imzo</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o, i) => (
              <tr key={o.id}>
                <td className="c">{i + 1}</td>
                <td>{datedNumber(o.orderNumber, o.orderDay, o.createdAt)}</td>
                <td>
                  <b>{o.customer?.recipientName || o.customer?.name || '—'}</b><br />
                  {o.customer?.recipientPhone || o.customer?.phone || ''}
                </td>
                <td>
                  {o.customer?.address || '—'}
                  {o.customer?.comment && <small className="v"><br />{o.customer.comment}</small>}
                </td>
                <td>{o.paymentStatus === 'Tolangan' ? 'To‘langan' : isCashPayment(o.paymentMethod) ? 'Naqd — olinadi' : o.paymentMethod}</td>
                <td className="num">{formatPrice(o.total)}</td>
                <td />
              </tr>
            ))}
          </tbody>
        </table>
        <div className="wb__sum">
          <div><span>Buyurtmalar</span><span>{orders.length} ta</span></div>
          <div><span>Jami summa</span><span>{formatPrice(total)}</span></div>
          <div className="total"><span>Olinadigan naqd</span><span>{formatPrice(cash)}</span></div>
        </div>
        <p className="wb__words"><b>Naqd so‘z bilan:</b> {sumInWords(cash)}</p>
        <div className="wb__signs">
          <div>Berdi (omborchi)<span>imzo / F.I.Sh.</span></div>
          <div>Oldi (kuryer)<span>imzo / F.I.Sh.</span></div>
          <div>Kassaga topshirdi<span>imzo / summa</span></div>
        </div>
      </div>
    </div>
  )
}
