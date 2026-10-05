import { useEffect } from 'react'

/**
 * Scroll qilinganda bo'limlar pastdan suzib chiqadi.
 *
 * `data-reveal` belgili element ekranga kirishi bilan `is-in` sinfini
 * oladi (styles.css). Kechikish `--d` bilan beriladi — kartalar
 * ketma-ket chiqadi. Yashirish faqat `html.reveal-on` bo'lsa ishlaydi:
 * skript ishlamasa ham kontent ko'rinib turadi.
 *
 * `deps` o'zgarganda (masalan mahsulotlar yuklanganda) yangi elementlar
 * ham kuzatuvga olinadi.
 */
export function useReveal(deps: unknown[] = []) {
  useEffect(() => {
    const root = document.documentElement
    const items = [...document.querySelectorAll<HTMLElement>('[data-reveal]:not(.is-in)')]
    if (!items.length) return
    // Kuzatuvchi yo'q yoki sahifa yashirin ochilgan — animatsiyasiz ko'rsatiladi
    if (typeof IntersectionObserver === 'undefined' || document.visibilityState === 'hidden') {
      items.forEach((el) => el.classList.add('is-in'))
      return
    }
    root.classList.add('reveal-on')
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add('is-in')
          observer.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    )
    items.forEach((el) => observer.observe(el))
    // Kafolat: kuzatuvchi negadir javob bermasa, ekrandagisi baribir ko'rinsin
    const safety = setTimeout(() => {
      for (const el of items) {
        if (!el.classList.contains('is-in') && el.getBoundingClientRect().top < innerHeight) el.classList.add('is-in')
      }
    }, 1800)
    return () => {
      observer.disconnect()
      clearTimeout(safety)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
