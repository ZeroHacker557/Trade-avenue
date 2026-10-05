/**
 * Zarrachalar «portlashi» — element markazidan atrofga sochiladi.
 *
 *   yurakcha — sevimlilarga qo'shilganda (kichik, qizil yurakchalar)
 *   qor      — buyurtma berilganda (muz kristallari — brend: muzlatilgan)
 *
 * React'dan tashqarida: vaqtincha `body` ga qo'shiladi va Web Animations
 * bilan harakatlanadi (faqat transform/opacity). «Harakatni kamaytirish»
 * yoqilgan bo'lsa — hech narsa qilmaydi.
 */

type Options = {
  /** Zarracha belgisi (matn/emoji) yoki rangli nuqta. */
  glyphs?: string[]
  colors?: string[]
  count?: number
  /** Qanchalik uzoqqa uchadi, px. */
  distance?: number
  size?: number
  duration?: number
}

export function burst(el: Element | null, options: Options = {}) {
  if (!el) return
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const { glyphs, colors = ['#e11d48'], count = 10, distance = 34, size = 12, duration = 620 } = options

  const r = el.getBoundingClientRect()
  const cx = r.left + r.width / 2
  const cy = r.top + r.height / 2

  for (let i = 0; i < count; i++) {
    const p = document.createElement('span')
    p.className = 'burst-particle'
    p.style.left = `${cx}px`
    p.style.top = `${cy}px`
    p.style.fontSize = `${size}px`
    const color = colors[i % colors.length]
    if (glyphs?.length) {
      p.textContent = glyphs[i % glyphs.length]
      p.style.color = color
    } else {
      p.style.width = p.style.height = `${size * 0.55}px`
      p.style.background = color
      p.style.borderRadius = '50%'
    }
    document.body.appendChild(p)

    // Aylana bo'ylab teng, biroz tasodifiy
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5
    const d = distance * (0.7 + Math.random() * 0.6)
    const x = Math.cos(angle) * d
    const y = Math.sin(angle) * d
    const spin = (Math.random() - 0.5) * 240
    p.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.3) rotate(0deg)', opacity: 0 },
        { transform: `translate(calc(-50% + ${x * 0.6}px), calc(-50% + ${y * 0.6}px)) scale(1.1) rotate(${spin / 2}deg)`, opacity: 1, offset: 0.35 },
        { transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y + 10}px)) scale(0.6) rotate(${spin}deg)`, opacity: 0 },
      ],
      { duration: duration * (0.85 + Math.random() * 0.3), easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' },
    ).onfinish = () => p.remove()
    setTimeout(() => p.remove(), duration * 2)
  }
}

/** Sevimlilarga qo'shildi. */
export const heartBurst = (el: Element | null) =>
  burst(el, { glyphs: ['♥'], colors: ['#e11d48', '#f43f5e', '#fb7185'], count: 9, distance: 30, size: 11 })

/** Buyurtma qabul qilindi — muz kristallari. */
export const snowBurst = (el: Element | null) =>
  burst(el, {
    glyphs: ['❄', '✦', '❅', '•'],
    colors: ['#7dd3fc', '#38bdf8', '#bae6fd', '#0a7a3d', '#fde68a'],
    count: 26,
    distance: 150,
    size: 16,
    duration: 1300,
  })
