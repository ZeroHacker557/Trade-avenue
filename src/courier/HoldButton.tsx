import { Loader2, PackageCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { hapticFeedback, hapticSuccess } from '../utils/telegram'

type Props = {
  label: string
  /** Bosib turilganda: «Bosib turing… {n}». */
  holdingLabel: (secondsLeft: number) => string
  /** Tasdiq uchun necha ms bosib turish kerak. */
  duration?: number
  busy?: boolean
  disabled?: boolean
  onComplete: () => void
}

/**
 * Bosib turib tasdiqlanadigan tugma.
 *
 * «Yetkazdim» tasodifiy bosilib ketmasin: kuryer tugmani 3 soniya
 * ushlab turadi, shu vaqt ichida tugma chapdan o'ngga to'lib boradi
 * (to'lov ekranlaridagi kabi). Barmoq oldinroq olinsa — to'lish ortga
 * qaytadi va hech narsa bo'lmaydi.
 *
 * To'lish har qadamda React render qilmasdan, to'g'ridan-to'g'ri CSS
 * o'zgaruvchisi (`--p`) orqali chiziladi — sekin telefonda ham silliq.
 *
 * Hisob requestAnimationFrame bilan EMAS, taymer bilan: ba'zi WebView'lar
 * (quvvat tejash rejimi, fon) kadrlarni sekinlashtiradi yoki to'xtatadi,
 * shunda tugma hech qachon to'lmay qolardi. Vaqt esa baribir
 * `performance.now()` dan olinadi — taymer kechiksa ham 3 soniya 3 soniya.
 */

/** ~60 marta soniyada. */
const STEP_MS = 16

export function HoldButton({
  label, holdingLabel, duration = 3000, busy = false, disabled = false, onComplete,
}: Props) {
  const ref = useRef<HTMLButtonElement>(null)
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const startedAt = useRef(0)
  const done = useRef(false)
  const lastSecond = useRef(0)
  const [holding, setHolding] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(duration / 1000))

  const paint = (value: number) => ref.current?.style.setProperty('--p', String(value))

  const stop = () => clearInterval(timer.current)

  const tick = () => {
    const now = performance.now()
    const progress = Math.min(1, (now - startedAt.current) / duration)
    paint(progress)

    const left = Math.ceil((duration - (now - startedAt.current)) / 1000)
    if (left !== lastSecond.current && left > 0) {
      lastSecond.current = left
      setSecondsLeft(left)
      hapticFeedback('light')
    }

    if (progress >= 1) {
      stop()
      done.current = true
      setHolding(false)
      hapticSuccess()
      onComplete()
    }
  }

  const start = () => {
    if (disabled || busy || done.current) return
    stop()
    ref.current?.classList.remove('is-releasing')
    startedAt.current = performance.now()
    lastSecond.current = Math.ceil(duration / 1000)
    setSecondsLeft(lastSecond.current)
    setHolding(true)
    hapticFeedback('medium')
    timer.current = setInterval(tick, STEP_MS)
  }

  const release = () => {
    if (done.current || !holding) return
    stop()
    setHolding(false)
    // To'lish silliq ortga qaytadi (CSS transition)
    ref.current?.classList.add('is-releasing')
    paint(0)
  }

  // Tasdiqdan keyin xato qaytsa (busy tugadi) — qayta urinish mumkin bo'lsin
  useEffect(() => {
    if (!busy && done.current) {
      done.current = false
      paint(0)
    }
  }, [busy])

  useEffect(() => stop, [])

  const text = busy ? label : holding ? holdingLabel(secondsLeft) : label
  const content = (
    <>
      {busy ? <Loader2 size={19} className="animate-spin" /> : <PackageCheck size={19} />}
      <span>{text}</span>
    </>
  )

  return (
    <button
      ref={ref}
      type="button"
      className={'crr-hold ' + (holding ? 'is-holding ' : '') + (busy ? 'is-busy' : '')}
      disabled={disabled}
      aria-busy={busy}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId)
        start()
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault()
          start()
        }
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') release()
      }}
      // Uzoq bosish telefonda menyu yoki matn tanlashni ochmasin
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Ostki qatlam — to'lmagan qism */}
      <span className="crr-hold__base">{content}</span>
      {/* To'lgan qism — o'sha matn oq rangda, faqat to'lgan kenglikda ko'rinadi */}
      <span className="crr-hold__fill" aria-hidden="true">{content}</span>
    </button>
  )
}
