import type { PayTileId } from '../../utils/payment'

/**
 * To'lov usuli logotipi — brend ranglarida chizilgan (tashqi rasm yuklanmaydi,
 * internet sekin bo'lsa ham darhol ko'rinadi). Rasmiy logotip fayllari
 * kelsa — shu komponentda `<img>` ga almashtiriladi.
 */
export function PayLogo({ id }: { id: PayTileId }) {
  switch (id) {
    case 'payme':
      return (
        <span className="plogo plogo--payme" aria-hidden="true">
          <span>pay</span><span className="plogo__me">me</span>
        </span>
      )
    case 'click':
      return (
        <span className="plogo plogo--click" aria-hidden="true">
          <span className="plogo__ring" />click
        </span>
      )
    case 'uzcard':
      return (
        <span className="plogo plogo--uzcard" aria-hidden="true">
          <span>UZ</span><span className="plogo__card">CARD</span>
        </span>
      )
    case 'humo':
      return (
        <span className="plogo plogo--humo" aria-hidden="true">
          HUM<span className="plogo__o">O</span>
        </span>
      )
    case 'uzum':
      return <span className="plogo plogo--uzum" aria-hidden="true">uzum</span>
    default:
      return <span className="plogo plogo--paylov" aria-hidden="true">paylov</span>
  }
}
