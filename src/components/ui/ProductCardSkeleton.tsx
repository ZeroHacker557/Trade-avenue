/**
 * Yuklanish paytida mahsulot kartochkasi shaklidagi skelet.
 * Aylanuvchi spinner o'rniga — sahifa "sakramaydi" va tezroq tuyuladi.
 */
export function ProductCardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className={'product-card ' + (compact ? 'compact' : '')} aria-hidden="true">
      <div className="product-card-image">
        <div className="skeleton size-full" style={{ borderRadius: 0 }} />
      </div>
      <div className="product-card-info">
        <div className="skeleton h-3.5 w-full" />
        <div className="skeleton mt-2 h-3.5 w-3/5" />
      </div>
      <div className="product-card-footer">
        <div className="skeleton h-4 w-20" />
        <div className="skeleton size-9.5" style={{ borderRadius: 'var(--r-sm)' }} />
      </div>
    </div>
  )
}

export function ProductGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  )
}

export function ProductRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="mt-5 flex gap-4 overflow-hidden pb-2">
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} compact />
      ))}
    </div>
  )
}
