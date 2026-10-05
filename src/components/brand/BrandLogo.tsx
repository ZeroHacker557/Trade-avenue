import mark from '../../images/musa-mark.webp'
import { BRAND } from '../../config/brand'

type Props = {
  /** Belgi o'lchami (px). Yozuv shunga nisbatan masshtablanadi. */
  size?: number
  /** Yozuvsiz — faqat belgi (kichik joylar uchun). */
  markOnly?: boolean
  className?: string
}

/**
 * MUSA logotipi.
 *
 * Belgi — logotipning o'zi: yashil fon ustidagi sariq plita. Rasm allaqachon
 * yashil bo'lgani uchun ostiga qo'shimcha fon qo'yilmaydi, faqat burchaklari
 * yumaloqlanadi — shu tariqa yorug' va qorong'i temada bir xil ko'rinadi va
 * favicon bilan aynan mos tushadi.
 */
export function BrandLogo({ size = 44, markOnly = false, className = '' }: Props) {
  return (
    <span className={'flex items-center gap-2.5 ' + className}>
      <img
        src={mark}
        alt={BRAND.name}
        width={size}
        height={size}
        className="shrink-0 object-cover"
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.28,
          boxShadow: 'var(--shadow-brand)',
        }}
        decoding="async"
      />

      {!markOnly && (
        <span className="min-w-0 leading-none">
          <b
            className="wordmark block"
            style={{ fontSize: size * 0.6, color: 'var(--ink)' }}
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
