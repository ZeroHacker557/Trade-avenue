import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BRAND } from '../../config/brand'
import { useTopTitle } from '../../hooks/use-top-title'
import { BrandLogo } from '../brand/BrandLogo'

/** Nom sig'masa shrift shu o'lchamgacha kichrayadi (px), undan keyin — «…». */
const MIN_FONT = 16

/**
 * To'liq ekrandagi tepa panel: Telegram'ning «Orqaga» va «⋯» tugmalari
 * orasidagi bo'sh joyda sahifa nomi (bosh sahifada — brend).
 *
 * Faqat `html.tg-fullscreen` da ko'rinadi (styles.css), oddiy oynada
 * bu joyni Telegram'ning o'z sarlavhasi egallaydi.
 *
 * Sahifa tepasida panel shaffof — ostidagi yashil tus ko'rinib turadi.
 * Pastga surilganda xiralashgan fon oladi: kontent Telegram tugmalari
 * va nom ostidan o'tganda matn bir-biriga qo'shilib ketmaydi.
 */
export function TopBar() {
  const title = useTopTitle()
  const [scrolled, setScrolled] = useState(false)
  const titleRef = useRef<HTMLSpanElement>(null)

  // Uzun nom («Shaxsiy ma'lumotlar», «Оформление заказа») tor telefonda
  // Telegram tugmalari orasiga sig'maydi. Kesib qo'yish o'rniga shriftni
  // kerakli darajada kichraytiramiz — o'qiladigan nom chiroyliroq.
  useLayoutEffect(() => {
    const el = titleRef.current
    if (!el) return
    const fit = () => {
      el.style.fontSize = ''
      const base = parseFloat(getComputedStyle(el).fontSize)
      if (el.scrollWidth > el.clientWidth) {
        el.style.fontSize = `${Math.max(MIN_FONT, Math.floor(base * (el.clientWidth / el.scrollWidth) * 10) / 10)}px`
      }
    }
    fit()
    // Montserrat hali yuklanmagan bo'lsa o'lcham zaxira shriftda chiqadi — yuklangach qayta
    void document.fonts?.ready.then(fit)
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [title])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className={'tg-topbar' + (scrolled ? ' is-scrolled' : '')} aria-hidden="true">
      <div className="tg-topbar__row">
        {title ? (
          <span key={title} ref={titleRef} className="tg-topbar__title">{title}</span>
        ) : (
          <span key="brand" className="tg-topbar__brand" aria-label={BRAND.name}>
            <BrandLogo size={26} markOnly />
            <b className="wordmark">{BRAND.name}</b>
          </span>
        )}
      </div>
    </div>
  )
}
