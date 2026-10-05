import type { CSSProperties } from 'react'
import { usePublishTitle } from '../../hooks/use-top-title'

type Props = {
  children: string
  /** Tepa panel uchun qisqa nom — to'liq nom Telegram tugmalari orasiga sig'masa. */
  short?: string
  as?: 'h1' | 'h2'
  className?: string
  style?: CSSProperties
}

/**
 * Sahifa sarlavhasi.
 *
 * Oddiy oynada — sahifadagi odatiy sarlavha. Telegram to'liq ekranida
 * u sahifadan yashiriladi (styles.css `.tg-fullscreen .page-title`) va
 * Telegram tugmalari orasidagi tepa panelga ko'chadi — kontent tepaga
 * ko'tarilib, ekranga ko'proq narsa sig'adi.
 */
export function PageTitle({ children, short, as: Tag = 'h1', className = '', style }: Props) {
  usePublishTitle(short ?? children)
  return (
    <Tag className={'page-title ' + className} style={{ color: 'var(--ink)', ...style }}>
      {children}
    </Tag>
  )
}
