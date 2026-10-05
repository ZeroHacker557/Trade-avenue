import { useEffect, type RefObject } from 'react'

type Options = {
  /** Sekundiga necha piksel suriladi. */
  speed?: number
  /** Foydalanuvchi tegingandan keyin shuncha ms kutib turadi. */
  resumeAfter?: number
  /** Yoqilganmi — masalan ro'yxat bo'sh bo'lsa o'chiriladi. */
  enabled?: boolean
}

/**
 * Gorizontal ro'yxatni sekin o'ziga surib turadi (karusel).
 *
 * Kutubxona ishlatilmadi: kerak bo'lgan narsa — `scrollLeft` ni har
 * kadrda biroz oshirish. Oxiriga yetganda boshiga qaytadi.
 *
 * Foydalanuvchi qo'l bilan surganda to'xtaydi va `resumeAfter` dan keyin
 * davom etadi — aks holda avtomatik harakat odamning surishiga qarshi
 * ishlab, ro'yxatni boshqarib bo'lmay qolardi.
 *
 * `prefers-reduced-motion` yoqilgan bo'lsa umuman ishlamaydi.
 */
export function useAutoScroll(
  ref: RefObject<HTMLElement | null>,
  { speed = 18, resumeAfter = 2500, enabled = true }: Options = {},
) {
  useEffect(() => {
    const node = ref.current
    if (!node || !enabled) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let frame = 0
    let last = 0
    let pausedUntil = 0
    // Piksel qoldig'i: scrollLeft butun songa yaxlitlanadi, shuning uchun
    // kasr qismini alohida yig'ib boramiz — aks holda sekin tezlikda
    // harakat umuman ko'rinmaydi.
    let carry = 0

    const pause = () => {
      pausedUntil = performance.now() + resumeAfter
    }

    const step = (now: number) => {
      frame = requestAnimationFrame(step)
      if (!last) last = now
      /*
       * Kadrlar orasidagi vaqt cheklanadi.
       *
       * Brauzer ko'rinmayotgan varaqda rAF ni to'xtatadi. Odam qaytib
       * kelganda `now` bir necha soniyaga sakraydi va cheklanmasa lenta
       * bir zumda oxirigacha uchib ketardi.
       */
      const delta = Math.min(now - last, 50)
      last = now

      if (now < pausedUntil) return
      // Surish uchun joy bo'lmasa (hamma element sig'ib turibdi) — tinch
      const max = node.scrollWidth - node.clientWidth
      if (max <= 4) return

      carry += (speed * delta) / 1000
      const whole = Math.floor(carry)
      if (whole < 1) return
      carry -= whole

      if (node.scrollLeft >= max - 1) {
        node.scrollTo({ left: 0, behavior: 'smooth' })
        pause()
      } else {
        node.scrollLeft += whole
      }
    }

    frame = requestAnimationFrame(step)

    node.addEventListener('pointerdown', pause)
    node.addEventListener('wheel', pause, { passive: true })
    node.addEventListener('touchstart', pause, { passive: true })

    return () => {
      cancelAnimationFrame(frame)
      node.removeEventListener('pointerdown', pause)
      node.removeEventListener('wheel', pause)
      node.removeEventListener('touchstart', pause)
    }
  }, [ref, speed, resumeAfter, enabled])
}
