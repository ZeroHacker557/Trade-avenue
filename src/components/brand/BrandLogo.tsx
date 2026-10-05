import mark from '../../images/ta-mark.svg'
import { BRAND } from '../../config/brand'

type Props = {
  /** Belgi o'lchami (px). Yozuv shunga nisbatan masshtablanadi. */
  size?: number
  /** Yozuvsiz — faqat belgi (kichik joylar uchun). */
  markOnly?: boolean
  className?: string
}

/**
 * Trade Avenue logotipi.
 *
 * Belgi — ko'k plita ustida «T» va yo'lga o'xshash «A» (avenue), o'rtasida
 * amber yo'l chizig'i. Plitaning o'z foni bor, shuning uchun yorug' va
 * qorong'i temada bir xil ko'rinadi va favicon bilan aynan mos tushadi.
 */
export function BrandLogo({ size = 44, markOnly = false, className = '' }: Props) {
  return (
    <span className={'flex items-center gap-2.5 ' + className}>
      <img
        src={mark}
        alt={BRAND.name}
        width={size}
        height={size}
        className="shrink-0"
        style={{ width: size, height: size, borderRadius: size * 0.25, boxShadow: 'var(--shadow-brand)' }}
        decoding="async"
      />

      {!markOnly && (
        <span className="min-w-0 leading-none">
          <b
            className="wordmark block whitespace-nowrap"
            style={{ fontSize: size * 0.46, color: 'var(--ink)' }}
          >
            {BRAND.name}
          </b>
          <small
            className="mt-1 block truncate font-bold uppercase"
            style={{
              fontSize: Math.max(7, size * 0.17),
              letterSpacing: '0.1em',
              color: 'var(--brand)',
            }}
          >
            {BRAND.tagline}
          </small>
        </span>
      )}
    </span>
  )
}
