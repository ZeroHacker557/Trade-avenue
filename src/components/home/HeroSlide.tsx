import { ArrowRight } from 'lucide-react'
import { BANNER_THEMES, pickLang, type HomeBanner } from '../../config/banners'

/**
 * Admin qo'shgan bosh sahifa banneri — bitta slayd.
 *
 * Stillar to'liq shu yerda (inline): admin panel oldindan ko'rishda aynan
 * shu komponentni chizadi, ilovada qanday ko'rinsa panelda ham shunday.
 * Balandlik `.hero-slide` sinfidan (ilova: 260 / 340 px), panelda 260 px.
 */
export function HeroSlide({ banner, lang, onOpen }: { banner: HomeBanner; lang: string; onOpen?: () => void }) {
  const theme = BANNER_THEMES[banner.theme]
  const badge = pickLang(banner.badge, banner.badgeRu, lang)
  const title = pickLang(banner.title, banner.titleRu, lang)
  const subtitle = pickLang(banner.subtitle, banner.subtitleRu, lang)
  const cta = pickLang(banner.cta, banner.ctaRu, lang)
  const full = banner.layout === 'full'
  const hasText = Boolean(badge || title || subtitle || cta)
  const clickable = banner.target !== 'none' && Boolean(onOpen)

  return (
    <div
      className="hero-slide"
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onOpen : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter') onOpen?.() } : undefined}
      style={{
        position: 'relative',
        overflow: 'hidden',
        minHeight: 260,
        height: '100%',
        borderRadius: 'var(--r-lg, 24px)',
        background: theme.bg,
        color: full && banner.image ? '#fff' : theme.ink,
        cursor: clickable ? 'pointer' : undefined,
      }}
    >
      {full && banner.image && (
        <>
          <img src={banner.image} alt="" decoding="async" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          {hasText && (
            <span
              aria-hidden="true"
              style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgb(0 0 0 / 0.62) 0%, rgb(0 0 0 / 0.25) 55%, transparent 80%)' }}
            />
          )}
        </>
      )}
      {!full && banner.image && (
        <img
          src={banner.image}
          alt=""
          decoding="async"
          style={{
            position: 'absolute', top: '50%', right: '-4%', height: '112%', width: '50%',
            transform: 'translateY(-50%)', objectFit: 'contain', pointerEvents: 'none',
            filter: 'drop-shadow(0 18px 24px rgb(0 0 0 / 0.25))',
          }}
        />
      )}

      {hasText && (
        <div style={{ position: 'relative', zIndex: 2, maxWidth: full ? '72%' : '56%', padding: 24 }}>
          {badge && (
            <span
              style={{
                display: 'inline-block', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 800,
                background: theme.badgeBg, color: theme.badgeInk,
              }}
            >
              {badge}
            </span>
          )}
          {title && (
            <h2
              style={{
                margin: badge ? '14px 0 0' : 0, fontFamily: '"Archivo Black", var(--font-display), sans-serif',
                fontSize: 24, lineHeight: 1.15, letterSpacing: '-0.02em', textWrap: 'balance',
              }}
            >
              {title}
            </h2>
          )}
          {subtitle && <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.4, opacity: 0.82 }}>{subtitle}</p>}
          {cta && (
            <span
              style={{
                marginTop: 18, display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
                borderRadius: 999, padding: '12px 20px', fontWeight: 800, fontSize: 15,
                background: theme.ctaBg, color: theme.ctaInk,
              }}
            >
              {cta} <ArrowRight size={18} />
            </span>
          )}
        </div>
      )}
    </div>
  )
}
