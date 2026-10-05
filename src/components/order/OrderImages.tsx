import { productThumb } from '../../utils/product-image'
import { ShoppingBag } from 'lucide-react'
import type { Product } from '../../types/domain'

type Item = { product: Product; quantity: number; cartKey?: string }

export function OrderImages({ products }: { products: Item[] }) {
  return (
    <div className="flex gap-2">
      {products.slice(0, 3).map((item, i) => (
        <div
          key={item.cartKey ?? `${item.product.id}-${i}`}
          className="relative size-14 shrink-0 overflow-hidden rounded-xl border sm:size-16"
          style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
        >
          {productThumb(item.product) ? (
            <img
              className="absolute inset-0 size-full object-contain p-1"
              src={productThumb(item.product)}
              alt={item.product.name}
              loading="lazy"
            />
          ) : (
            <span className="absolute inset-0 grid place-items-center">
              <ShoppingBag size={18} style={{ color: 'var(--faint)' }} />
            </span>
          )}
        </div>
      ))}
      {products.length > 3 && (
        <div
          className="grid size-14 place-items-center rounded-xl border text-xs font-bold sm:size-16"
          style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
        >
          +{products.length - 3}
        </div>
      )}
    </div>
  )
}
