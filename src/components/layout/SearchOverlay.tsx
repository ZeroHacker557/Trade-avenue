import { ArrowLeft, Search, ShoppingBag } from 'lucide-react'
import { formatPrice } from '../../data'
import { productThumb } from '../../utils/product-image'
import { useT } from '../../i18n'
import type { Product } from '../../types/domain'

type Props = {
  query: string
  results: Product[]
  onQueryChange: (value: string) => void
  onClose: () => void
  onOpenProduct: (product: Product) => void
}

export function SearchOverlay({ query, results, onQueryChange, onClose, onOpenProduct }: Props) {
  const t = useT()

  return (
    <div className="search-overlay p-5 sm:p-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex gap-3">
          <button onClick={onClose} className="icon-button shrink-0" aria-label={t('common.back')}>
            <ArrowLeft />
          </button>
          <div className="search-field">
            <Search style={{ color: 'var(--faint)' }} />
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={t('search.placeholder')}
              className="h-12 w-full bg-transparent outline-none"
              style={{ color: 'var(--ink)' }}
            />
          </div>
        </div>

        <h2 className="mt-8 text-xl font-extrabold" style={{ color: 'var(--ink)' }}>
          {query ? t('search.results', { query }) : t('search.title')}
        </h2>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {results.map((product, i) => (
            <button
              key={product.id}
              onClick={() => { onOpenProduct(product); onClose() }}
              className="flex items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.98]"
              style={{
                borderColor: 'var(--line)',
                background: 'var(--surface)',
                animation: `fadeInUp 0.25s ease ${Math.min(i, 8) * 0.04}s both`,
              }}
            >
              {productThumb(product) ? (
                <img
                  className="size-16 shrink-0 rounded-xl object-contain"
                  style={{ background: 'var(--surface-2)' }}
                  src={productThumb(product)}
                  alt={product.name}
                  loading="lazy"
                />
              ) : (
                <div
                  className="grid size-16 shrink-0 place-items-center rounded-xl"
                  style={{ background: 'var(--surface-2)', color: 'var(--faint)' }}
                >
                  <ShoppingBag size={20} />
                </div>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold" style={{ color: 'var(--ink)' }}>
                  {product.name}
                </span>
                <small className="mt-1 block font-bold" style={{ color: 'var(--brand)' }}>
                  {formatPrice(product.price)}
                </small>
              </span>
            </button>
          ))}
        </div>

        {query && !results.length && (
          <div className="py-16 text-center" style={{ color: 'var(--muted)', animation: 'fadeInUp 0.3s ease' }}>
            <Search className="mx-auto mb-3" size={42} />
            <p className="font-bold" style={{ color: 'var(--ink-2)' }}>{t('search.notFound')}</p>
            <p className="mt-1 text-sm">{t('search.notFoundText')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
