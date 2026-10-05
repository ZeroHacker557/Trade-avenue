import { useState } from 'react'

type Props = {
  src: string
  alt: string
  loading?: 'lazy' | 'eager'
  /**
   * Kichik nusxa — katta rasm kelguncha shu ko'rinib turadi.
   * Mahsulot sahifasida kartochkadagi thumb allaqachon keshda bo'ladi,
   * shuning uchun sahifa ochilishi bilan rasm darhol ko'rinadi.
   */
  placeholder?: string
  onError?: () => void
}

/**
 * Mahsulot rasmi — HAR QANDAY nisbatda to'liq ko'rinadi.
 *
 * `contain`: rasm hech qayeridan qirqilmaydi. Bo'sh joy oq — mahsulot
 * fotolari odatda oq fonda bo'ladi, shuning uchun chok ko'rinmaydi.
 *
 * Rasm yuklangach yumshoq paydo bo'ladi: sekin tarmoqda yuqoridan pastga
 * «chizilib» chiqish o'rniga birdan to'liq ko'rinadi.
 */
export function ProductImage({ src, alt, loading = 'lazy', placeholder, onError }: Props) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
  const loaded = loadedSrc === src

  return (
    <span className="product-image">
      {placeholder && placeholder !== src && !loaded && (
        <img className="product-image__main" src={placeholder} alt="" aria-hidden="true" decoding="async" />
      )}
      <img
        // Keshdan kelgan rasm `onLoad` dan oldin tayyor bo'lishi mumkin
        ref={(img) => {
          if (img?.complete && img.naturalWidth > 0 && loadedSrc !== src) setLoadedSrc(src)
        }}
        className={'product-image__main ' + (loaded ? 'is-loaded' : 'is-loading')}
        src={src}
        alt={alt}
        loading={loading}
        decoding="async"
        onLoad={() => setLoadedSrc(src)}
        onError={onError}
      />
    </span>
  )
}
