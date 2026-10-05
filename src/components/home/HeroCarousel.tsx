import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Bosh sahifa bannerlari karuseli.
 *
 * Har `interval` ms da o'ngga suriladi. Oxirgisidan keyin ham O'NGGA
 * davom etadi: oxirida birinchi slaydning nusxasi turadi, unga yetgach
 * sezdirmasdan haqiqiy birinchisiga sakraladi — orqaga «yugurish» yo'q.
 * Barmoq bilan surilsa avtomatik aylanish biroz to'xtaydi.
 */
export function HeroCarousel({ slides, interval = 5000 }: { slides: ReactNode[]; interval?: number }) {
  const track = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const pausedUntil = useRef(0)
  const count = slides.length

  const indexNow = () => {
    // Kartalar orasida bo'shliq bor — eng yaqin karta
    const el = track.current
    if (!el) return 0
    let best = 0
    let dist = Infinity
    Array.from(el.children).forEach((c, i) => {
      const d = Math.abs((c as HTMLElement).offsetLeft - el.scrollLeft)
      if (d < dist) { dist = d; best = i }
    })
    return best
  }

  const goTo = (i: number, smooth = true) => {
    const el = track.current
    const cell = el?.children[i] as HTMLElement | undefined
    if (!el || !cell) return
    // .hero-track position: relative — offsetLeft lentaga nisbatan
    el.scrollTo({ left: cell.offsetLeft, behavior: smooth ? 'smooth' : 'auto' })
  }

  // Avtomatik aylanish
  useEffect(() => {
    if (count < 2) return
    const timer = window.setInterval(() => {
      if (Date.now() < pausedUntil.current || document.hidden) return
      goTo(indexNow() + 1)
    }, interval)
    return () => window.clearInterval(timer)
  }, [count, interval])

  // Surish tugagach: nusxada bo'lsak — haqiqiy birinchisiga sakraymiz
  useEffect(() => {
    const el = track.current
    if (!el || count < 2) return
    let settle = 0
    const onScroll = () => {
      const i = indexNow()
      setActive(i % count)
      window.clearTimeout(settle)
      settle = window.setTimeout(() => {
        if (indexNow() >= count) goTo(0, false)
      }, 140)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      window.clearTimeout(settle)
    }
  }, [count])

  if (count === 0) return null
  if (count === 1) return <>{slides[0]}</>

  const pause = () => { pausedUntil.current = Date.now() + 7000 }

  return (
    <div className="hero-carousel">
      <div ref={track} className="hero-track scrollbar-none" onPointerDown={pause} onTouchStart={pause}>
        {slides.map((slide, i) => <div key={i} className="hero-cell">{slide}</div>)}
        {/* Birinchi slayd nusxasi — o'ngga uzluksiz aylanish uchun */}
        <div className="hero-cell" aria-hidden="true" inert>{slides[0]}</div>
      </div>
      <div className="hero-dots" role="tablist">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={active === i}
            aria-label={`${i + 1}`}
            className={'hero-dot' + (active === i ? ' is-on' : '')}
            onClick={() => { pause(); goTo(i) }}
          />
        ))}
      </div>
    </div>
  )
}
