import { ShoppingCart } from 'lucide-react'
import { useT } from '../../i18n'

export function CartButton({ count, onClick }: { count: number; onClick?: () => void }) {
  const t = useT()

  return (
    <button onClick={onClick} aria-label={t('cart.title')} className="icon-button relative" data-cart-target>
      <ShoppingCart strokeWidth={2.25} />
      {/* Bo'sh savatda "0" ko'rsatilmaydi (D-05) */}
      {count > 0 && (
        <span
          key={count}
          className="absolute right-0 top-0 grid min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold"
          style={{
            background: 'var(--brand)',
            color: 'var(--brand-ink)',
            animation: 'badgePop 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  )
}
