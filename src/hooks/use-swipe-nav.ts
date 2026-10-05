import { useEffect, useRef } from 'react'
import type { AppPage } from '../types/domain'

/** Barmoq bilan o'tish mumkin bo'lgan sahifalar — pastki menyu tartibida. */
/*
 * Surish tartibi pastdagi menyuga MOS bo'lishi kerak. Sevimlilar
 * menyudan chiqib tepaga ko'chgani uchun bu ro'yxatdan ham olindi:
 * aks holda surishda menyuda ko'rinmaydigan sahifa oralab qolardi.
 * Savat esa sahifa emas (chekka oyna), shuning uchun bu yerda yo'q.
 */
export const SWIPE_PAGES: AppPage[] = ['home', 'catalog', 'orders', 'profile']

/**
 * Sahifa o'zi surishni «ushlab qolishi» mumkin: katalog avval kategoriyalar
 * bo'ylab yuradi, oxirgisidan keyingina keyingi sahifaga o'tiladi.
 * `direction`: 1 — keyingi (chapga surildi), -1 — oldingi.
 * `true` qaytarsa — surish ishlatildi, sahifa almashmaydi.
 */
type SwipeInterceptor = (direction: 1 | -1) => boolean
let interceptor: SwipeInterceptor | null = null

/** Sahifa ochiq turganda o'rnatadi; qaytgan funksiya — olib tashlaydi. */
export function setSwipeInterceptor(fn: SwipeInterceptor): () => void {
  interceptor = fn
  return () => {
    if (interceptor === fn) interceptor = null
  }
}

/** Shu masofadan ko'p surilsa — sahifa almashadi. */
const MIN_DISTANCE = 70
/** Gorizontal harakat vertikaldan shuncha marta katta bo'lishi kerak. */
const DIRECTION_RATIO = 1.6

/**
 * Ichida gorizontal surish bor elementmi?
 *
 * Kategoriya lentasi va mahsulot karuseli o'z ichida suriladi. Agar
 * barmoq o'sha yerdan boshlangan bo'lsa, sahifani almashtirmaymiz —
 * aks holda lentani surmoqchi bo'lgan odam kutilmaganda boshqa
 * sahifaga tushib qolardi.
 */
function insideHorizontalScroller(target: EventTarget | null): boolean {
  let node = target as HTMLElement | null
  while (node && node !== document.body) {
    if (node.dataset?.noSwipe !== undefined) return true
    const style = getComputedStyle(node)
    const scrolls = style.overflowX === 'auto' || style.overflowX === 'scroll'
    if (scrolls && node.scrollWidth > node.clientWidth + 4) return true
    node = node.parentElement
  }
  return false
}

/**
 * Chap-o'ngga surish orqali asosiy sahifalar bo'ylab yurish.
 *
 * Faqat pastki menyudagi sahifalarda ishlaydi: mahsulot detali yoki
 * rasmiylashtirish kabi ichki sahifalarda surish tasodifan chiqib
 * ketishga olib kelardi.
 */
export function useSwipeNav(
  page: AppPage,
  navigate: (page: AppPage) => void,
  enabled = true,
) {
  const start = useRef<{ x: number; y: number; valid: boolean } | null>(null)

  useEffect(() => {
    const index = SWIPE_PAGES.indexOf(page)
    if (!enabled || index === -1) return

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        start.current = null
        return
      }
      const touch = e.touches[0]
      start.current = {
        x: touch.clientX,
        y: touch.clientY,
        valid: !insideHorizontalScroller(e.target),
      }
    }

    const onEnd = (e: TouchEvent) => {
      const from = start.current
      start.current = null
      if (!from?.valid) return

      const touch = e.changedTouches[0]
      if (!touch) return

      const dx = touch.clientX - from.x
      const dy = touch.clientY - from.y
      if (Math.abs(dx) < MIN_DISTANCE) return
      if (Math.abs(dx) < Math.abs(dy) * DIRECTION_RATIO) return

      // Chapga surish — keyingi (kontent chapga siljiydi)
      const direction = dx < 0 ? 1 : -1
      if (interceptor?.(direction)) return
      const next = index + direction
      if (next < 0 || next >= SWIPE_PAGES.length) return
      navigate(SWIPE_PAGES[next])
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchend', onEnd)
    }
  }, [page, navigate, enabled])
}
