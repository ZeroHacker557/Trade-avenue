import { createPortal } from 'react-dom'
import { datedNumber } from '../../utils/order-label'
import { formatPrice } from '../../data'
import { BRAND } from '../../config/brand'
import { useContact, type AdminOrder } from '../lib/live'
import { bundleText } from '../../utils/bundle'

/**
 * Chop etiladigan chek.
 *
 * Ekranda ko'rinmaydi (`.adm-receipt { display: none }`), chop etishda
 * esa faqat shu tugun qog'ozga tushadi — admin.css dagi `@media print`
 * boshqa hamma narsani yashiradi.
 *
 * Ranglar bu yerda ataylab qattiq yozilgan: printer qorong'i rejim
 * tokenlarini bilmaydi va oq qog'ozda oq matn chiqib qolardi.
 *
 * Mahsulotlar 5 ustunli jadval EMAS — chek uslubida: nom butun kenglikda,
 * ostida chapda «narx × soni», o'ngda summa. Telefondan chop etilganda (yoki PDF
 * saqlanganda) sahifa tor bo'ladi va jadval ustunlari siqilib, narx
 * «10 / 000 / so'm» bo'lib uch qatorga, nomlar esa so'zma-so'z bo'linib
 * ketardi. Bu ko'rinish A4 da ham, tor sahifada ham bir xil toza turadi.
 */
export function Receipt({ order }: { order: AdminOrder }) {
  const contact = useContact()
  const created = order.createdAt ? new Date(order.createdAt) : null
  const lines = order.products || []
  const subtotal = order.subtotal ?? order.total

  return createPortal(
    <div className="adm-receipt">
      <style>{`
        .rcp { max-width: 180mm; margin: 0 auto; color: #111; }
        .rcp__top { display: flex; flex-wrap: wrap; justify-content: space-between;
          align-items: flex-start; gap: 8px 16px;
          border-bottom: 2px solid #0a7a3d; padding-bottom: 12px; }
        .rcp__brand { font-size: 26pt; font-weight: 800; letter-spacing: -0.02em;
          color: #0a7a3d; line-height: 1; }
        .rcp__tag { font-size: 8pt; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.14em; color: #555; margin-top: 4px; }
        .rcp__no { text-align: right; margin-left: auto; }
        .rcp__no b { font-size: 17pt; display: block; white-space: nowrap; }
        .rcp__nowrap { white-space: nowrap; }
        .rcp__no span { font-size: 9pt; color: #555; }
        .rcp__grid { display: flex; flex-wrap: wrap; gap: 12px 28px; margin-top: 16px; font-size: 9.5pt; }
        .rcp__grid section { flex: 1 1 200px; min-width: 0; }
        .rcp__grid h3 { font-size: 8pt; text-transform: uppercase;
          letter-spacing: 0.1em; color: #777; margin: 0 0 4px; }
        .rcp__grid p { margin: 0 0 2px; }
        .rcp__items { margin-top: 18px; font-size: 9.5pt; }
        .rcp__head, .rcp__item { display: grid; grid-template-columns: 2em minmax(0, 1fr) auto;
          column-gap: 10px; align-items: baseline; }
        .rcp__head { padding: 0 0 6px; border-bottom: 1.5px solid #0a7a3d; font-size: 8pt;
          font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #555; }
        .rcp__item { padding: 8px 0; border-bottom: 1px solid #e4e4e4;
          break-inside: avoid; page-break-inside: avoid; }
        .rcp__idx { color: #888; font-variant-numeric: tabular-nums; }
        .rcp__name { grid-column: 2 / 4; font-weight: 600; line-height: 1.3; overflow-wrap: anywhere; }
        .rcp__meta { grid-column: 2; margin-top: 3px; color: #666; font-size: 8.5pt;
          white-space: nowrap; font-variant-numeric: tabular-nums; }
        .rcp__amount { grid-column: 3; font-weight: 800; text-align: right; white-space: nowrap;
          font-variant-numeric: tabular-nums; }
        .rcp__meta b { color: #111; font-weight: 700; }
        .rcp__variant { white-space: normal; }
        .rcp__sum { margin-left: auto; margin-top: 14px; width: 68mm; max-width: 100%;
          font-size: 10pt; }
        .rcp__sum div { display: flex; justify-content: space-between; gap: 12px;
          padding: 3px 0; }
        .rcp__sum div span:last-child { white-space: nowrap; font-variant-numeric: tabular-nums; }
        .rcp__sum .total { border-top: 1.5px solid #111; margin-top: 6px;
          padding-top: 7px; font-size: 13pt; font-weight: 800; }
        .rcp__pay { margin-top: 16px; padding: 9px 12px; background: #f1f7f3;
          border-left: 3px solid #0a7a3d; font-size: 9.5pt; }
        .rcp__foot { margin-top: 26px; padding-top: 10px;
          border-top: 1px solid #ddd; font-size: 8.5pt; color: #666;
          display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 16px; }
      `}</style>

      <div className="rcp">
        <header className="rcp__top">
          <div>
            <div className="rcp__brand">{BRAND.name}</div>
            <div className="rcp__tag">{BRAND.tagline}</div>
          </div>
          <div className="rcp__no">
            <b>{datedNumber(order.orderNumber, order.orderDay, order.createdAt)}</b>
            <span>
              {created
                ? created.toLocaleString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '—'}
            </span>
          </div>
        </header>

        <div className="rcp__grid">
          <section>
            <h3>Mijoz</h3>
            <p>
              <b>{order.customer?.name || '—'}</b>
            </p>
            {order.customer?.phone && <p className="rcp__nowrap">{order.customer.phone}</p>}
            {order.customer?.address && <p>{order.customer.address}</p>}
          </section>

          <section>
            <h3>Yetkazib beruvchi</h3>
            <p>
              <b>{BRAND.legalName}</b>
            </p>
            <p className="rcp__nowrap">{contact.phone}</p>
            <p>{contact.address}</p>
            {order.courierName && <p>Kuryer: {order.courierName}</p>}
          </section>
        </div>

        <div className="rcp__items">
          <div className="rcp__head">
            <span>№</span>
            <span>Mahsulot</span>
            <span style={{ textAlign: 'right' }}>Summa</span>
          </div>
          {lines.map((line, i) => {
            const price = line.product?.price || 0
            const qty = line.quantity || 0
            const variant = [line.size, line.color].filter(Boolean).join(' • ')
            return (
              <div key={line.cartKey || i} className="rcp__item">
                <span className="rcp__idx">{i + 1}</span>
                <span className="rcp__name">
                  {line.product?.name || '—'}
                  {!!line.product?.bundle?.length && <small className="rcp__variant"> ({bundleText(line.product.bundle)})</small>}
                </span>
                <span className="rcp__meta">
                  {formatPrice(price)} × <b>{qty}</b>
                  {variant && <span className="rcp__variant"> · {variant}</span>}
                </span>
                <span className="rcp__amount">{formatPrice(price * qty)}</span>
              </div>
            )
          })}
        </div>

        <div className="rcp__sum">
          <div>
            <span>Mahsulotlar</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          {!!order.discount && (
            <div style={{ color: '#0a7a3d' }}>
              <span>Chegirma{order.promoCode ? ` (${order.promoCode})` : ''}</span>
              <span>− {formatPrice(order.discount)}</span>
            </div>
          )}
          {!!order.deliveryFee && (
            <div>
              <span>Yetkazib berish</span>
              <span>{formatPrice(order.deliveryFee)}</span>
            </div>
          )}
          <div className="total">
            <span>JAMI</span>
            <span>{formatPrice(order.total)}</span>
          </div>
        </div>

        <div className="rcp__pay">
          To‘lov usuli: <b>{order.paymentMethod || 'Naqd'}</b>
          {order.paymentStatus ? ` — ${order.paymentStatus}` : ''}
          <br />
          Holati: <b>{order.status}</b>
        </div>

        {order.customer?.comment && (
          <p style={{ marginTop: '12px', fontSize: '9.5pt' }}>
            <b>Izoh:</b> {order.customer.comment}
          </p>
        )}

        <footer className="rcp__foot">
          <span>
            @{contact.telegram} · {contact.phone}
          </span>
          <span>Xaridingiz uchun rahmat!</span>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
