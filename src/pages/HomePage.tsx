import { PromoBanner } from '../components/promo/PromoBanner'
import type { Promotion } from '../utils/promotions'
import { ArrowRight, Bell, CookingPot, Heart, Search } from 'lucide-react'
import heroProducts from '../images/hero-products.webp'
import { BrandLogo } from '../components/brand/BrandLogo'
import { ProductCard } from '../components/product/ProductCard'
import { ProductRowSkeleton } from '../components/ui/ProductCardSkeleton'
import { IconButton } from '../components/ui/IconButton'
import { categoryIcon } from '../utils/category-icons'
import { MAIN_LINES, categoryLabel, isMainLine } from '../config/categories'
import { useMemo, useRef } from 'react'
import { useAutoScroll } from '../hooks/use-auto-scroll'
import { useReveal } from '../hooks/use-reveal'
import { useI18n, useT } from '../i18n'
import { HeroCarousel } from '../components/home/HeroCarousel'
import { HeroSlide } from '../components/home/HeroSlide'
import type { HomeBanner } from '../config/banners'
import { openExternalLink } from '../utils/telegram'
import type { AppPage, Category, Product, ProductActions } from '../types/domain'
import { PromoBadge } from '../components/home/PromoBadge'

/** «Aksiyadagi set mahsulotlar» yorlig'i shu yo'nalish kartasida («Setlar» yozuvi o'rniga). */
const PROMO_LINE = 'Setlar'

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
  /** Admin qo'shgan bannerlar — asosiy bannerdan keyin karuselda. */
  banners: HomeBanner[]
  onOpenSection: (id: string) => void
  onOpenProduct: (id: string) => void
}

export function HomePage({
  products, categories, loading, promotions, onSearch, onNavigate,
  onOpenCategory, unreadNotificationsCount, banners, onOpenSection, onOpenProduct, ...productActions
}: Props) {
  const t = useT()
  const { lang } = useI18n()

  // Ikkala lenta ham sekin o'ziga surilib turadi (karusel)
  const stripRef = useRef<HTMLDivElement>(null)
  const popularRef = useRef<HTMLDivElement>(null)
  useAutoScroll(stripRef, { speed: 16, enabled: categories.length > 3 })
  /*
   * Faqat admin «Mashhur» deb belgilaganlar, admin tartibida.
   * Hech biri belgilanmagan bo'lsa bo'lim ko'rsatilmaydi — tasodifiy
   * mahsulotlarni «mashhur» deb ko'rsatish mijozni chalg'itadi.
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

  // Asosiy banner — MUSA yashil sahnasi, o'ngda mahsulot fotosi
  const defaultHero = (
    <div className="hero-banner">
      <div className="relative min-h-[260px] p-6 sm:min-h-[340px] sm:p-9">
        <span className="hero-glow" aria-hidden="true" />

        <div className="relative z-10 max-w-[58%] sm:max-w-[380px]">
          <span
            className="inline-block rounded-full px-3 py-1 text-xs font-bold"
            style={{ background: '#ffffff', color: 'var(--brand-strong)' }}
          >
            {t('home.heroBadge')}
          </span>
          <h2
            className="wordmark mt-4 text-[1.5rem] leading-[1.15] sm:text-[2.4rem]"
            style={{ color: '#ffffff', textWrap: 'balance' }}
          >
            {t('home.heroTitle')}
          </h2>
          <p className="mt-3 text-sm sm:text-base" style={{ color: 'rgb(255 255 255 / 0.78)' }}>
            {t('home.heroSubtitle')}
          </p>
          <button
            onClick={() => onNavigate('catalog')}
            className="mt-5 flex w-fit items-center gap-2 whitespace-nowrap rounded-full px-5 py-3 font-bold transition active:scale-[0.98]"
            style={{ background: '#ffffff', color: 'var(--brand-strong)' }}
          >
            {t('home.heroCta')} <ArrowRight size={18} />
          </button>
        </div>

        <img
          className="pointer-events-none absolute top-1/2 right-[-6%] h-[118%] w-[52%] -translate-y-1/2 object-contain object-center sm:right-2 sm:h-[124%] sm:w-[46%]"
          src={heroProducts}
          alt=""
          aria-hidden="true"
          decoding="async"
          fetchPriority="high"
        />
      </div>
    </div>
  )

  return (
    <>
      {/* Header */}
      {/* To'liq ekranda brend tepa panelga chiqadi, qidiruv esa shu qatorga
          ko'tariladi — bosh sahifada bitta qator tejaladi */}
      <header className="page-head home-head flex items-center justify-between gap-2 px-5 pt-7 sm:px-10">
        <BrandLogo size={44} className="home-head__brand" />
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
          {/* Savat pastdagi menyuga ko'chdi — tepada yurak qoldi.
              Ilgari savat faqat shu kichik ikonka edi va foydalanuvchilar
              uni topolmasdi. */}
          <IconButton label={t('favorites.title')} onClick={() => onNavigate('favorites')}>
            <Heart />
          </IconButton>
        </div>
      </header>

      {/* Search */}
      <section className="home-search px-5 pt-6 sm:px-10">
        <button
          onClick={onSearch}
          className="search-trigger"
          style={{ color: 'var(--faint)' }}
        >
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

      {/* Hero: asosiy banner doim birinchi; admin qo'shgan bannerlar bo'lsa —
          karusel, har 5 soniyada o'ngga suriladi */}
      <section className="mx-5 mt-6 sm:mx-10">
        {banners.length > 0
          ? (
            <HeroCarousel
              slides={[
                defaultHero,
                ...banners.map((b) => <HeroSlide key={b.id} banner={b} lang={lang} onOpen={() => openBanner(b)} />),
              ]}
            />
          )
          : defaultHero}
      </section>

      {/* Asosiy yo'nalishlar — yirik kartalar (birinchisi va Setlar keng).
          Foto qo'yish uchun: MAIN_LINES dagi `image` maydonini to'ldiring
          (src/config/categories.ts) — gradient o'rniga rasm ko'rinadi. */}
      <section className="px-5 pt-8 sm:px-10">
        <h2 className="section-title mb-4" data-reveal>{t('home.lines')}</h2>
        <div className="line-grid">
          {MAIN_LINES.map((line, index) => {
            const Icon = categoryIcon(line.icon, line.name)
            return (
              <button
                key={line.name}
                onClick={() => onOpenCategory(line.name)}
                className={'line-card' + (index === 0 || line.wide ? ' line-card--wide' : '') + (line.name === PROMO_LINE ? ' line-card--promo' : '')}
                data-reveal
                style={{
                  ...(line.image ? { backgroundImage: `url(${line.image})` } : { backgroundImage: line.gradient }),
                  ['--d' as string]: `${index * 90}ms`,
                }}
              >
                {!line.image && (
                  <Icon className="line-card__icon" size={index === 0 || line.wide ? 128 : 104} aria-hidden="true" />
                )}
                {line.name === PROMO_LINE ? (
                  <>
                    {/* «Setlar» yozuvi o'rniga — o'quvchi dasturlar uchun nomi qoladi */}
                    <span className="sr-only">{categoryLabel(line, lang)}</span>
                    <PromoBadge
                      top={lang === 'ru' ? 'Наборы' : 'Aksiyadagi set'}
                      bottom={lang === 'ru' ? 'по акции' : 'mahsulotlar'}
                    />
                  </>
                ) : (
                  <span className="line-card__title">{categoryLabel(line, lang)}</span>
                )}
              </button>
            )
          })}
        </div>
      </section>

      {/* Kategoriyalar — bazadan, bosilganda katalog filtrlanadi.
          Yo'nalishlar yuqorida kartada turibdi, bu yerda takrorlanmaydi. */}
      {categories.some((c) => !isMainLine(c.name)) && (
        <section className="mt-5" data-reveal>
          <div ref={stripRef} className="category-strip category-strip--compact scrollbar-none">
            {categories.filter((c) => !isMainLine(c.name)).map((category) => {
              const Icon = categoryIcon(category.icon, category.name)
              return (
                <button
                  onClick={() => onOpenCategory(category.name)}
                  key={category.id}
                  className="category-card"
                >
                  <span className="category-icon-wrap">
                    <Icon size={22} />
                  </span>
                  <span className="category-label">{categoryLabel(category, lang)}</span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* Mashhur mahsulotlar — faqat admin belgilaganlar */}
      {(loading || popular.length > 0 || products.length === 0) && (
      <section className="px-5 pb-32 pt-8 sm:px-10">
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
          <div ref={popularRef} className="mt-5 flex gap-4 overflow-x-auto pb-2 scrollbar-none">
            {popular.map((product, index) => (
              <div key={product.id} className="shrink-0" data-reveal style={{ ['--d' as string]: `${Math.min(index, 5) * 70}ms` }}>
                <ProductCard product={product} compact {...productActions} />
              </div>
            ))}
          </div>
        ) : (
          <div
            className="mt-8 rounded-2xl border border-dashed p-10 text-center"
            style={{ borderColor: 'var(--line)' }}
          >
            <span
              className="mx-auto grid size-16 place-items-center rounded-full"
              style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}
            >
              <CookingPot size={30} />
            </span>
            <p className="mt-4 font-bold" style={{ color: 'var(--ink-2)' }}>{t('home.emptyTitle')}</p>
            <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>{t('home.emptyText')}</p>
          </div>
        )}
      </section>
      )}
    </>
  )
}
