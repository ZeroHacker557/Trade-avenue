/**
 * «Savatga uchib borish» — mahsulot rasmi kartadan pastdagi savat
 * belgisiga egri yo'l bilan uchadi, belgi esa silkinadi.
 *
 * React holatiga tegmaydi: vaqtincha `document.body` ga rasm nusxasi
 * qo'shiladi va Web Animations API bilan harakatlantiriladi (faqat
 * transform/opacity — eski telefonda ham silliq). Belgi topilmasa
 * yoki «harakatni kamaytirish» yoqilgan bo'lsa — hech narsa qilmaydi.
 */

const TARGET = '[data-cart-target]'

/**
 * Ekranda ko'rinib turgan savat belgisi (pastki menyu yoki sahifa tepasidagi).
 * `data-cart-target="primary"` — asosiysi (mahsulot sahifasi pastidagi savat):
 * ko'rinib turgan bo'lsa, boshqalaridan oldin shu tanlanadi.
 */
function visibleTarget(): HTMLElement | null {
  const all = [...document.querySelectorAll<HTMLElement>(TARGET)]
  const ordered = [
    ...all.filter((el) => el.dataset.cartTarget === 'primary'),
    ...all.filter((el) => el.dataset.cartTarget !== 'primary'),
  ]
  for (const el of ordered) {
    const r = el.getBoundingClientRect()
    if (r.width && r.height && r.bottom > 0 && r.top < innerHeight) return el
  }
  return null
}

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Savat belgisini silkitadi (qayta bosilsa ham takrorlanadi). */
export function bumpCart() {
  const target = visibleTarget()
  if (!target || reducedMotion()) return
  target.animate(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(1.3) rotate(-8deg)' },
      { transform: 'scale(0.92) rotate(6deg)' },
      { transform: 'scale(1)' },
    ],
    { duration: 420, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
  )
}

/**
 * `from` — bosilgan tugma yoki karta ichidagi element. Rasm shu
 * elementning eng yaqin kartasidan (`[data-fly-source]`) olinadi.
 */
export function flyToCart(from: Element | null) {
  if (!from || reducedMotion()) return
  const target = visibleTarget()
  if (!target) return

  const card = from.closest('[data-fly-source]') ?? from
  const img = card.querySelector('img')
  const start = (img ?? card).getBoundingClientRect()
  const end = target.getBoundingClientRect()
  if (!start.width || !end.width) return

  const size = Math.min(84, Math.max(48, start.width * 0.5))
  const ghost = document.createElement('div')
  ghost.className = 'fly-ghost'
  ghost.style.width = `${size}px`
  ghost.style.height = `${size}px`
  ghost.style.left = `${start.left + start.width / 2 - size / 2}px`
  ghost.style.top = `${start.top + start.height / 2 - size / 2}px`
  if (img?.currentSrc || img?.src) ghost.style.backgroundImage = `url("${img.currentSrc || img.src}")`
  document.body.appendChild(ghost)

  const dx = end.left + end.width / 2 - (start.left + start.width / 2)
  const dy = end.top + end.height / 2 - (start.top + start.height / 2)
  // Egri yo'l: avval biroz tepaga ko'tariladi, keyin savatga tushadi
  const lift = Math.min(120, Math.abs(dy) * 0.35 + 40)

  const flight = ghost.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.25 - lift}px) scale(0.75)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.18)`, opacity: 0.6 },
    ],
    { duration: 650, easing: 'cubic-bezier(0.45, 0, 0.25, 1)' },
  )
  const done = () => {
    ghost.remove()
    bumpCart()
  }
  flight.onfinish = done
  flight.oncancel = () => ghost.remove()
  // Kafolat: sahifa fonga o'tib animatsiya to'xtasa ham nusxa qolib ketmasin
  setTimeout(() => ghost.remove(), 1500)
}
