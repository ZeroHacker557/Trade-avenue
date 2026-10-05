import { Heart } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { ProductCard } from '../components/product/ProductCard'
import { ProductGridSkeleton } from '../components/ui/ProductCardSkeleton'
import { TextSkeleton } from '../components/ui/LoadingSkeletons'
import { useT } from '../i18n'
import type { Product, ProductActions } from '../types/domain'

type Props = ProductActions & {
  products: Product[]
  /** Mahsulotlar hali kelmagan — sevimlilar bo'sh ko'rinmasin. */
  loading: boolean
  onGoToCatalog: () => void
  onBack: () => void
}

export function FavoritesPage({
  products, loading, likedIds, onGoToCatalog, onBack, ...actions
}: Props) {
  const t = useT()
  const favorites = products.filter((p) => likedIds.includes(p.id))

  return (
    <>
      <PageHeader
        title={t('favorites.title')}
        onBack={onBack}
      />
      <section className="px-5 pb-32 pt-6 sm:px-10">
        {loading ? (
          <TextSkeleton className="h-5 w-40" />
        ) : (
          <p style={{ color: 'var(--muted)' }}>{t('catalog.total', { count: favorites.length })}</p>
        )}

        {/* Mahsulotlar kelmaguncha «sevimlilar yo'q» deyilmaydi —
            aslida ular bor, faqat hali yuklanmagan bo'lishi mumkin. */}
        {loading ? (
          <ProductGridSkeleton count={Math.min(Math.max(likedIds.length, 2), 6)} />
        ) : favorites.length > 0 ? (
          <div className="mt-6 grid grid-flow-row-dense grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {favorites.map((product) => (
              <ProductCard key={product.id} product={product} likedIds={likedIds} {...actions} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center py-24 text-center" style={{ animation: 'fadeInUp 0.4s ease' }}>
            <span
              className="grid size-20 place-items-center rounded-full"
              style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}
            >
              <Heart size={40} />
            </span>
            <p className="mt-5 text-lg font-bold" style={{ color: 'var(--ink-2)' }}>{t('favorites.empty')}</p>
            <p className="mt-2 max-w-[260px] text-sm" style={{ color: 'var(--muted)' }}>
              {t('favorites.emptyText')}
            </p>
            <button onClick={onGoToCatalog} className="btn-ghost mt-6 px-6 py-3">
              {t('cart.goToCatalog')}
            </button>
          </div>
        )}
      </section>
    </>
  )
}
