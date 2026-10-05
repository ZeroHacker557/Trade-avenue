import { PromoBanner } from '../components/promo/PromoBanner'
import type { Promotion } from '../utils/promotions'
import { ArrowRight, Bell, ClipboardList, LayoutGrid, ListChecks, PackageSearch, RotateCcw, Search } from 'lucide-react'
import { BrandLogo } from '../components/brand/BrandLogo'
import { ProductCard } from '../components/product/ProductCard'
import { ProductRowSkeleton } from '../components/ui/ProductCardSkeleton'
import { IconButton } from '../components/ui/IconButton'
import { categoryIcon } from '../utils/category-icons'
import { categoryLabel } from '../config/categories'
import { useMemo, useRef } from 'react'
import { useAutoScroll } from '../hooks/use-auto-scroll'
import { useReveal } from '../hooks/use-reveal'
import { useI18n, useT } from '../i18n'
import { HeroCarousel } from '../components/home/HeroCarousel'
import { HeroSlide } from '../components/home/HeroSlide'
import type { HomeBanner } from '../config/banners'
import { openExternalLink } from '../utils/telegram'
import { datedNumber } from '../utils/order-label'
import type { AppPage, Category, Order, Product, ProductActions } from '../types/domain'

type Props = ProductActions & {
  products: Product[]
  categories: Category[]
  loading: boolean
  onSearch: () => void
  onNavigate: (page: AppPage) => void
  /** Hozir ishlayotgan vaqtli aksiyalar (katta chegirmasi birinchi). */
  promotions: Promotion[]
  onOpenCategory: (category: string) => void
  unreadNotificationsCount: number
  /** Admin qo'shgan bannerlar — karuselda. */
  banners: HomeBanner[]
  onOpenSection: (id: string) => void
  onOpenProduct: (id: string) => void
  /** Eng oxirgi buyurtma — «Qayta buyurtma» tugmasi uchun. */
  lastOrder?: Order
  onReorder: (order: Order) => void
}

export function HomePage({
  products, categories, loading, promotions, onSearch, onNavigate,
  onOpenCategory, unreadNotificationsCount, banners, onOpenSection, onOpenProduct,
  lastOrder, onReorder, ...productActions
}: Props) {
  const t = useT()
  const { lang } = useI18n()

  const popularRef = useRef<HTMLDivElement>(null)
  /*
   * Faqat admin «Mashhur» deb belgilaganlar, admin tartibida.
   * Hech biri belgilanmagan bo'lsa bo'lim ko'rsatilmaydi — tasodifiy
   * mahsulotlarni «ko'p olinadi» deb ko'rsatish chalg'itadi.
   */
  const popular = useMemo(
    () => products
      .filter((p) => p.popular)
      .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)),
    [products],
  )
  useAutoScroll(popularRef, { speed: 11, enabled: popular.length > 2 })
  // Bo'limlar scroll qilinganda suzib chiqadi — mahsulotlar kelgach yangilari ham
  useReveal([loading, popular.length, categories.length])

  /** Banner bosilganda — admin tanlagan joy ochiladi. */
  const openBanner = (b: HomeBanner) => {
    if (b.target === 'catalog') onNavigate('catalog')
    else if (b.target === 'category') onOpenCategory(b.value)
    else if (b.target === 'section') onOpenSection(b.value)
    else if (b.target === 'product') onOpenProduct(b.value)
    else if (b.target === 'url' && /^https?:\/\//i.test(b.url)) openExternalLink(b.url)
  }

  /** Mahsulotlar soni — kategoriya plitasida ko'rinadi. */
  const countByCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of products) map.set(p.category, (map.get(p.category) ?? 0) + 1)
    return map
  }, [products])

  // Admin banneri bo'lmasa — ixcham kirish kartasi (rasmsiz, brend fonida)
  const intro = (
    <div className="ta-intro">
      <span className="ta-intro__road" aria-hidden="true" />
      <div className="relative z-10">
        <span className="ta-intro__badge">{t('home.heroBadge')}</span>
        <h2 className="ta-intro__title">{t('home.heroTitle')}</h2>
        <p className="ta-intro__text">{t('home.heroSubtitle')}</p>
        <button onClick={() => onNavigate('catalog')} className="ta-intro__cta">
          {t('home.heroCta')} <ArrowRight size={18} />
        </button>
      </div>
    </div>
  )

  const quick = [
    {
      key: 'catalog',
      icon: LayoutGrid,
      title: t('home.quickCatalog'),
      sub: t('home.quickCatalogSub', { count: products.length }),
      onClick: () => onNavigate('catalog'),
    },
    {
      key: 'reorder',
      icon: RotateCcw,
      title: t('orders.reorder'),
      sub: lastOrder
        ? datedNumber(lastOrder.orderNumber, lastOrder.orderDay, lastOrder.createdAt)
        : t('home.quickNoOrder'),
      onClick: () => (lastOrder ? onReorder(lastOrder) : onNavigate('catalog')),
      accent: true,
    },
    {
      key: 'list',
      icon: ListChecks,
      title: t('favorites.title'),
      sub: t('home.quickListSub', { count: productActions.likedIds.length }),
      onClick: () => onNavigate('favorites'),
    },
    {
      key: 'orders',
      icon: ClipboardList,
      title: t('nav.orders'),
      sub: t('home.quickOrdersSub'),
      onClick: () => onNavigate('orders'),
    },
  ]

  return (
    <>
      {/* To'liq ekranda brend tepa panelga chiqadi, qidiruv esa shu qatorga
          ko'tariladi — bosh sahifada bitta qator tejaladi */}
      <header className="page-head home-head flex items-center justify-between gap-2 px-5 pt-7 sm:px-10">
        <BrandLogo size={40} className="home-head__brand" />
        <button onClick={onSearch} className="search-trigger page-head__search" style={{ color: 'var(--faint)' }}>
          <Search className="shrink-0" size={19} />
          <span className="truncate text-sm">{t('home.searchPlaceholder')}</span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton label={t('notifications.title')} onClick={() => onNavigate('notifications')}>
            <span className="relative">
              <Bell />
              {unreadNotificationsCount > 0 && (
                <span
                  className="absolute right-0 top-0 size-2.5 rounded-full border-2"
                  style={{ background: 'var(--danger)', borderColor: 'var(--surface)' }}
                />
              )}
            </span>
          </IconButton>
        </div>
      </header>

      <section className="home-search px-5 pt-5 sm:px-10">
        <button onClick={onSearch} className="search-trigger" style={{ color: 'var(--faint)' }}>
          <Search className="shrink-0" size={20} />
          <span className="truncate text-sm">{t('home.searchPlaceholder')}</span>
        </button>
      </section>

      {/* Ishlayotgan aksiya — eng katta chegirmasi bilan */}
      {promotions[0] && (
        <section className="px-5 pt-4 sm:px-10" style={{ animation: 'fadeInUp 0.4s ease' }}>
          <PromoBanner
            promotion={promotions[0]}
            onOpen={() =>
              promotions[0].target === 'category' && promotions[0].targetIds[0]
                ? onOpenCategory(promotions[0].targetIds[0])
                : onNavigate('catalog')
            }
          />
        </section>
      )}

      {/* Admin bannerlari bo'lsa — karusel (har 5 soniyada suriladi), aks holda kirish kartasi */}
      <section className="mx-5 mt-4 sm:mx-10">
        {banners.length > 0
          ? (
            <HeroCarousel
              slides={banners.map((b) => <HeroSlide key={b.id} banner={b} lang={lang} onOpen={() => openBanner(b)} />)}
            />
          )
          : intro}
      </section>

      {/* Tezkor amallar — do'konchining eng ko'p qiladigan ishlari */}
      <section className="px-5 pt-5 sm:px-10">
        <div className="quick-grid">
          {quick.map(({ key, icon: Icon, title, sub, onClick, accent }) => (
            <button key={key} onClick={onClick} className={'quick-tile' + (accent ? ' quick-tile--accent' : '')}>
              <span className="quick-tile__icon"><Icon size={20} /></span>
              <span className="min-w-0">
                <b className="quick-tile__title">{title}</b>
                <span className="quick-tile__sub">{sub}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Kategoriyalar — bazadan, bosilganda katalog filtrlanadi */}
      {categories.length > 0 && (
        <section className="px-5 pt-7 sm:px-10">
          <h2 className="section-title mb-3" data-reveal>{t('home.lines')}</h2>
          <div className="cat-grid">
            {categories.map((category, index) => {
              const Icon = categoryIcon(category.icon, category.name)
              const count = countByCategory.get(category.name) ?? 0
              return (
                <button
                  key={category.id}
                  onClick={() => onOpenCategory(category.name)}
                  className="cat-tile"
                  data-reveal
                  style={{ ['--d' as string]: `${Math.min(index, 8) * 40}ms` }}
                >
                  <span className="cat-tile__icon"><Icon size={22} /></span>
                  <span className="cat-tile__name">{categoryLabel(category, lang)}</span>
                  {count > 0 && <span className="cat-tile__count">{count}</span>}
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* Ko'p olinadiganlar — faqat admin belgilaganlar */}
      {(loading || popular.length > 0 || products.length === 0) && (
        <section className="px-5 pb-32 pt-7 sm:px-10">
          <div className="flex items-center justify-between" data-reveal>
            <h2 className="section-title">{t('home.popular')}</h2>
            <button
              onClick={() => onNavigate('catalog')}
              className="text-sm font-bold transition hover:opacity-80"
              style={{ color: 'var(--brand)' }}
            >
              {t('home.seeAll')}
            </button>
          </div>

          {loading ? (
            <ProductRowSkeleton />
          ) : popular.length > 0 ? (
            <div ref={popularRef} className="mt-4 flex gap-3 overflow-x-auto pb-2 scrollbar-none">
              {popular.map((product, index) => (
                <div key={product.id} className="shrink-0" data-reveal style={{ ['--d' as string]: `${Math.min(index, 5) * 70}ms` }}>
                  <ProductCard product={product} compact {...productActions} />
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed p-10 text-center" style={{ borderColor: 'var(--line)' }}>
              <span
                className="mx-auto grid size-16 place-items-center rounded-full"
                style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}
              >
                <PackageSearch size={30} />
              </span>
              <p className="mt-4 font-bold" style={{ color: 'var(--ink-2)' }}>{t('home.emptyTitle')}</p>
              <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>{t('home.emptyText')}</p>
            </div>
          )}
        </section>
      )}
      {!loading && popular.length === 0 && products.length > 0 && <div className="pb-32" />}
    </>
  )
}
