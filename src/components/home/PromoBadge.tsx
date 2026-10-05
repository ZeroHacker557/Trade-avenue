/**
 * «Aksiyadagi set mahsulotlar» — bosh sahifadagi «Setlar» kartasining chap
 * bo'shlig'ida qiya, tebranib turadigan narx yorlig'i («Setlar» yozuvi
 * o'rniga). Rasm o'ngga surilib joy ochiladi: `.line-card--promo`.
 */
export function PromoBadge({ top, bottom }: { top: string; bottom: string }) {
  return (
    <span className="promo-tag" aria-hidden="true">
      <span className="promo-tag__body">
        <span className="promo-tag__hole" />
        <span className="promo-tag__text">
          <small>{top}</small>
          <b>{bottom}</b>
        </span>
      </span>
    </span>
  )
}
