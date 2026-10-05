import { flushSync } from 'react-dom'

/**
 * Kartadan mahsulot sahifasiga «rasm kattalashib o'tadi» — brauzerning
 * View Transitions API si bilan, qo'shimcha kutubxonasiz.
 *
 * Kartadagi rasm konteyneri va mahsulot sahifasidagi katta rasm bir xil
 * `view-transition-name` oladi; brauzer ikkalasini o'zi bog'lab, biridan
 * ikkinchisiga silliq o'tkazadi. API bo'lmagan telefonda (eski iOS) yoki
 * «harakatni kamaytirish» yoqilgan bo'lsa — oddiy almashinuv.
 */

const HERO = 'product-hero'

let pendingHero: HTMLElement | null = null

type ViewTransitionDoc = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> }
}

function supported(): boolean {
  if (typeof document === 'undefined') return false
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  return typeof (document as ViewTransitionDoc).startViewTransition === 'function'
}

/** Bosilgan kartaning rasm konteyneri — keyingi o'tish shu yerdan boshlanadi. */
export function markHero(el: Element | null) {
  pendingHero = el instanceof HTMLElement ? el : null
}

/** Ekranda ko'rinib turgan (bir xil mahsulot ikki joyda bo'lsa) karta rasmi. */
function visibleCardImage(productId: number): HTMLElement | null {
  const list = document.querySelectorAll<HTMLElement>(`[data-product-id="${productId}"] .product-card-image`)
  for (const el of list) {
    const r = el.getBoundingClientRect()
    if (r.width && r.bottom > 0 && r.top < innerHeight) return el
  }
  return null
}

/**
 * Holatni o'zgartiradi — imkon bo'lsa o'tish animatsiyasi bilan.
 *
 * `update` — React holatini o'zgartiruvchi funksiya (flushSync ichida,
 * brauzer yangi ko'rinishni darhol oladi). `scrollTop` — yangi sahifa
 * qayerdan ko'rinishi (o'tish shu holatdan suratga olinadi).
 * `backTo` — orqaga qaytishda rasm qaysi mahsulot kartasiga qaytadi.
 */
export function heroTransition(update: () => void, options: { scrollTop?: number; backTo?: number } = {}) {
  const from = pendingHero
  pendingHero = null
  const doc = document as ViewTransitionDoc
  if (!supported() || (!from && options.backTo === undefined)) {
    update()
    return
  }

  if (from) from.style.viewTransitionName = HERO
  let target: HTMLElement | null = null

  const transition = doc.startViewTransition!(() => {
    // Eski ko'rinish allaqachon suratga olingan — nom endi yangi elementga o'tadi
    if (from) from.style.viewTransitionName = ''
    flushSync(update)
    if (options.scrollTop !== undefined) window.scrollTo({ top: options.scrollTop, behavior: 'instant' as ScrollBehavior })
    if (options.backTo !== undefined) {
      target = visibleCardImage(options.backTo)
      if (target) target.style.viewTransitionName = HERO
    }
  })
  transition.finished.finally(() => {
    if (from) from.style.viewTransitionName = ''
    if (target) target.style.viewTransitionName = ''
  })
}
