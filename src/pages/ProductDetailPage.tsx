import { useEffect, useState } from 'react'
import { flyToCart } from '../utils/fly-to-cart'
import { heartBurst } from '../utils/burst'
import { PromoTimer } from '../components/promo/PromoTimer'
import { productOriginal, productPhoto, productThumb } from '../utils/product-image'
import { createPortal } from 'react-dom'
import {
  ArrowLeft, Heart, Minus, Plus, ShoppingBag, ShoppingCart, Truck, ZoomIn,
} from 'lucide-react'
import { formatPrice } from '../data'
import { ProductImage } from '../components/product/ProductImage'
import { CartButton } from '../components/ui/CartButton'
import { ImageLightbox } from '../components/ui/ImageLightbox'
import { track } from '../lib/track'
import { useT } from '../i18n'
import type { Product } from '../types/domain'
import { PageTitle } from '../components/layout/PageTitle'

type Props = {
  product: Product
  onAddToCart: (product: Product, size?: string, color?: string) => void
  onBack: () => void
  likedIds: number[]
  onToggleLike: (id: number) => void
  onOpenCart: () => void
  cartCount: number
  /** Set tarkibidagi mahsulot bosilganda — o'sha mahsulot ochiladi. */
  onOpenProduct?: (product: Product) => void
  /** Savat yoki qidiruv ochiq bo'lsa pastki panel ularni to'sib qo'ymasligi kerak. */
  hideBottomBar?: boolean
}

export function ProductDetailPage({
  product, onAddToCart, onBack, likedIds, onToggleLike, onOpenCart, cartCount, hideBottomBar = false, onOpenProduct,
}: Props) {
  const t = useT()
  const [activeImage, setActiveImage] = useState(0)
  const [zoomed, setZoomed] = useState(false)
  const [count, setCount] = useState(1)

  const colorsList = product.colors
    || (product.color ? product.color.split(',').map((c) => c.trim()).filter(Boolean) : [])
  const [selectedSize, setSelectedSize] = useState(product.sizes?.[0] || '')
  const [selectedColor, setSelectedColor] = useState(colorsList[0] || '')

  const favourite = likedIds.includes(product.id)
  const images = product.images || []
  const stock = product.stock
  const soldOut = stock === 0
  const lowStock = typeof stock === 'number' && stock > 0 && stock <= 5
  const maxCount = typeof stock === 'number' && stock > 0 ? Math.min(stock, 99) : 99

  // Analitika: mahsulot ko'rildi (12-band)
  useEffect(() => {
    track('view', product.id)
  }, [product.id])

  const handleAddToCart = () => {
    if (soldOut) return
    // Katta rasm tepadagi savat belgisiga uchadi
    flyToCart(document.querySelector('.pd-hero'))
    for (let i = 0; i < count; i++) onAddToCart(product, selectedSize, selectedColor)
    setCount(1)
  }

  return (
    <>
      <header className="page-head flex items-center justify-between px-5 pt-8 sm:px-10 page-animate">
        <button onClick={onBack} className="back-button" aria-label={t('common.back')}>
          <ArrowLeft size={20} />
        </button>
        <PageTitle as="h2" className="text-lg font-bold">{t('product.title')}</PageTitle>
        <div className="ml-auto flex gap-1">
          <button
            onClick={(e) => {
              if (!favourite) heartBurst(e.currentTarget)
              onToggleLike(product.id)
            }}
            className="icon-button"
            style={{ color: favourite ? 'var(--brand)' : 'var(--ink)' }}
            aria-label={t('favorites.title')}
            aria-pressed={favourite}
          >
            <Heart size={21} fill={favourite ? 'currentColor' : 'none'} />
          </button>
          <CartButton count={cartCount} onClick={onOpenCart} />
        </div>
      </header>

      {/* Rasm galereyasi */}
      <section className="relative mx-auto mt-3 max-w-3xl px-5" style={{ animation: 'fadeInUp 0.4s ease' }}>
        {product.discount && !soldOut && (
          <span
            className="absolute left-8 top-3 z-10 rounded-lg px-2.5 py-1 text-xs font-bold"
            style={{ background: 'var(--brand-strong)', color: 'var(--brand-ink)' }}
          >
            {product.discount}
          </span>
        )}
        {/*
          * Rasm ABSOLYUT joylashtirilgan, `place-items-center` grid ichida emas.
          * Grid markazlashtirilganda element cho'zilmaydi va bolaning
          * `height: 100%` foizi hal bo'lmay `auto` ga tushadi — bo'yi baland
          * rasm konteynerdan oshib ketib, `overflow-hidden` uni pastidan
          * kesib qo'yadi. `inset-0` esa aniq quti beradi, `object-contain`
          * shu qutiga to'liq sig'diradi.
          */}
        {/* pd-hero — kartadagi rasm shu yerga kattalashib o'tadi (view-transition.ts) */}
        <div
          data-fly-source
          className={
            'pd-hero relative mx-auto w-full overflow-hidden rounded-2xl border '
            // Set rasmi 16:9 — maydon ham shunday, tepa-pastda oq bo'shliq qolmasin
            + (product.bundle?.length ? 'aspect-video' : 'h-[280px] sm:h-[380px]')
          }
          style={{
            // Shaffof PNG'lar uchun fon yuzaning o'zi; ramka chegara bilan beriladi
            background: 'var(--surface)',
            borderColor: 'var(--line)',
            opacity: soldOut ? 0.55 : 1,
          }}
        >
          {images[activeImage] ? (
            <button
              className="absolute inset-0 size-full"
              style={{ cursor: 'zoom-in' }}
              onClick={() => setZoomed(true)}
              aria-label={t('product.zoom')}
            >
              {/* Kartadagidek: rasm to'liq ko'rinadi, quti xira fon bilan to'ladi.
                  Kattalashtirish uchun bosiladi. */}
              {/* O'rta nusxa (~1200px); kelguncha kartochkadagi kichik nusxa
                  ko'rinib turadi — u keshda, sahifa ochilishi bilan chiqadi. */}
              <ProductImage
                src={productPhoto(product, activeImage)}
                placeholder={productThumb(product, activeImage)}
                alt={product.name}
                loading="eager"
              />
              <span className="detail-zoom-hint">
                <ZoomIn size={18} />
              </span>
            </button>
          ) : (
            <span className="absolute inset-0 grid place-items-center">
              <ShoppingCart size={56} style={{ color: 'var(--faint)' }} />
            </span>
          )}
        </div>
        {images.length > 1 && (
          <div className="mt-3 flex justify-center gap-2">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveImage(i)}
                className={'dot ' + (activeImage === i ? 'active' : '')}
                aria-label={`${i + 1}`}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mx-5 mt-5 pb-40 sm:mx-10 page-animate">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold" style={{ color: 'var(--brand)' }}>{product.category}</span>
          <span
            className="flex items-center gap-2 rounded-2xl px-3.5 py-2 text-sm font-bold"
            style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}
          >
            <Truck size={17} /> {t('product.fastDelivery')}
          </span>
        </div>

        <h1 className="mt-4 text-2xl font-extrabold sm:text-3xl" style={{ color: 'var(--ink)', textWrap: 'balance' }}>
          {product.name}
        </h1>

        <div className="mt-5 flex items-baseline gap-3">
          <strong className="text-3xl" style={{ color: 'var(--ink)' }}>{formatPrice(product.price)}</strong>
          {product.oldPrice && <del style={{ color: 'var(--faint)' }}>{formatPrice(product.oldPrice)}</del>}
        </div>
        {product.pack && (
          <p className="mt-1 text-sm font-bold" style={{ color: 'var(--muted)' }}>
            {t('product.pack', { count: product.pack })} · {t('product.unitPrice', { price: formatPrice(Math.round(product.price / product.pack)) })}
          </p>
        )}
        {product.promotion && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <PromoTimer endsAt={product.promotion.endsAt} />
            <span className="text-xs font-bold" style={{ color: 'var(--muted)' }}>{product.promotion.title}</span>
          </div>
        )}

        {/* Set tarkibi — narx setning o'zi, tarkib nima kirishini ko'rsatadi */}
        {!!product.bundleItems?.length && (
          <section className="set-box">
            <div className="set-box__head">
              <b>{t('product.setContents')}</b>
              <span>{t('product.setItems', { n: product.bundleItems.reduce((s, l) => s + l.quantity, 0) })}</span>
            </div>
            <ul className="set-box__list">
              {product.bundleItems.map(({ product: item, quantity }, i) => (
                <li key={item.id} style={{ animationDelay: `${i * 50}ms` }}>
                  <button className="set-box__item" onClick={() => onOpenProduct?.(item)} disabled={!onOpenProduct}>
                    {productThumb(item) ? <img src={productThumb(item)} alt="" loading="lazy" /> : <span className="set-box__noimg" />}
                    <span className="min-w-0 flex-1 text-left">
                      <b className="block truncate">{item.name}</b>
                      <span>{formatPrice(item.price)}{item.sizes?.[0] ? ` · ${item.sizes[0]}` : ''}</span>
                    </span>
                    <span className="set-box__qty">×{quantity}</span>
                  </button>
                </li>
              ))}
            </ul>
            {!!product.bundleValue && product.bundleValue > product.price && (
              <div className="set-box__sum">
                <span>{t('product.setSeparately')}: <del>{formatPrice(product.bundleValue)}</del></span>
                <b>{t('product.setSave', { amount: formatPrice(product.bundleValue - product.price) })}</b>
              </div>
            )}
          </section>
        )}

        {soldOut && (
          <p
            className="mt-3 inline-block rounded-xl px-3 py-2 text-sm font-bold"
            style={{ background: 'var(--surface-3)', color: 'var(--muted)' }}
          >
            {t('product.soldOutLong')}
          </p>
        )}
        {lowStock && (
          <p
            className="mt-3 inline-block rounded-xl px-3 py-2 text-sm font-bold"
            style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}
          >
            {t(product.pack ? 'product.lowStockPack' : 'product.lowStock', { count: stock! })}
          </p>
        )}

        {colorsList.length > 0 && (
          <section className="detail-panel">
            <b style={{ color: 'var(--ink)' }}>{t('product.chooseColor')}</b>
            <div className="mt-4 flex flex-wrap gap-3">
              {colorsList.map((c) => (
                <button
                  onClick={() => setSelectedColor(c)}
                  className={'size-chip px-4 ' + (selectedColor === c ? 'active' : '')}
                  key={c}
                >
                  <b>{c}</b>
                </button>
              ))}
            </div>
          </section>
        )}

        {product.sizes && product.sizes.length > 0 && (
          <section className="detail-panel">
            <b style={{ color: 'var(--ink)' }}>{t('product.chooseSize')}</b>
            <div className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-7">
              {product.sizes.map((s) => (
                <button
                  onClick={() => setSelectedSize(s)}
                  className={'size-chip ' + (selectedSize === s ? 'active' : '')}
                  key={s}
                >
                  <b>{s}</b>
                </button>
              ))}
            </div>
          </section>
        )}

        {product.description && (
          <section className="detail-panel">
            <b style={{ color: 'var(--ink)' }}>{t('product.about')}</b>
            <p className="mt-4 text-sm leading-7" style={{ color: 'var(--muted)' }}>{product.description}</p>
          </section>
        )}

      </section>

      {/* Pastki panel — modal ochiq bo'lsa chizilmaydi */}
      {!hideBottomBar && createPortal(
        <div
          className="fixed bottom-0 left-0 right-0 z-[100] border-t p-4"
          style={{
            borderColor: 'var(--line)',
            background: 'color-mix(in srgb, var(--surface) 94%, transparent)',
            backdropFilter: 'blur(12px)',
            paddingBottom: 'calc(1rem + var(--safe-bottom))',
          }}
        >
          <div className="mx-auto flex max-w-[1120px] items-center gap-2 sm:gap-3">
            <div className="hidden sm:block">
              <b className="text-xl" style={{ color: 'var(--ink)' }}>{formatPrice(product.price)}</b>
            </div>
            <div className="flex items-center gap-2 rounded-2xl p-1.5" style={{ background: 'var(--surface-2)' }}>
              <button
                onClick={() => setCount(Math.max(1, count - 1))}
                className="grid size-8 place-items-center rounded-lg transition active:scale-90"
                style={{ color: 'var(--ink)' }}
                aria-label="-"
              >
                <Minus size={18} />
              </button>
              <b className="w-5 text-center" style={{ color: 'var(--ink)' }}>{count}</b>
              <button
                onClick={() => setCount(Math.min(maxCount, count + 1))}
                disabled={count >= maxCount}
                className="grid size-8 place-items-center rounded-lg transition active:scale-90 disabled:opacity-40"
                style={{ color: 'var(--ink)' }}
                aria-label="+"
              >
                <Plus size={18} />
              </button>
            </div>
            <button onClick={handleAddToCart} disabled={soldOut} className="btn-primary pd-add ml-auto flex-1 py-3.5">
              <ShoppingCart size={19} />
              <span className="truncate text-sm sm:text-base">
                {soldOut ? t('product.soldOut') : t('product.addToCart')}
              </span>
            </button>
            {/* Savat — soni ustida; qo'shilgan mahsulot rasmi aynan shu yerga uchadi */}
            <button
              type="button"
              onClick={onOpenCart}
              className={'pd-cart ' + (cartCount > 0 ? 'has-items' : '')}
              data-cart-target="primary"
              aria-label={`${t('cart.title')}${cartCount ? ` (${cartCount})` : ''}`}
            >
              <ShoppingBag size={22} strokeWidth={2.2} />
              {cartCount > 0 && (
                <span key={cartCount} className="pd-cart__badge">{cartCount > 99 ? '99+' : cartCount}</span>
              )}
            </button>
          </div>
        </div>,
        document.body,
      )}

      {zoomed && images.length > 0 && (
        <ImageLightbox
          images={images.map((_, i) => productOriginal(product, i))}
          index={activeImage}
          alt={product.name}
          onIndexChange={setActiveImage}
          onClose={() => setZoomed(false)}
        />
      )}
    </>
  )
}
