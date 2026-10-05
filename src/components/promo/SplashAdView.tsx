import { ArrowRight, Loader2, Volume2, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { AD_LIMITS, type AdLink, type SplashAd } from '../../utils/splash-ad'

export type SplashAdLabels = {
  skip: string
  close: string
  mute: string
  unmute: string
  /** Mijozning tili — tugma matnining ruscha varianti shu bo'yicha tanlanadi. */
  lang?: string
}

type Props = {
  ad: SplashAd
  labels: SplashAdLabels
  /** Admin paneldagi telefon ko'rinishi: `fixed` emas, ota blok ichida. */
  preview?: boolean
  /**
   * Qaysi slayddan boshlansin — faqat birinchi chizishda o'qiladi.
   * Admin boshqa slaydni tanlasa, ko'rinish `key` bilan qayta yaratiladi.
   */
  startIndex?: number
  onClose: () => void
  /** Yopila boshlaganda (animatsiyadan oldin) — bosish hodisasi ichida chaqiriladi. */
  onLeave?: () => void
  onAction: (link: AdLink) => void
  onTap?: () => void
}

/** Bosib turish shu vaqtdan oshsa — pauza, aks holda oddiy bosish. */
const HOLD_MS = 200
/** Shundan ko'p siljisa — bosish emas, surish. */
const MOVE_PX = 12
/** Shundan ko'p gorizontal surilsa — slayd almashadi. */
const SWIPE_PX = 45
/** Slayd shu vaqtda yuklanmasa, o'tkazib yuboriladi. */
const STALL_MS = 8000
const EXIT_MS = 220
/**
 * Media ekranni to'ldirganda (cover) ko'pi bilan shuncha qismi kesilishi
 * mumkin. Undan ko'p kesilsa — media to'liq ko'rsatiladi (contain).
 */
const MAX_CROP = 0.08

/**
 * Butun ekranli reklama slayderi — «stories» uslubida.
 *
 *   • tepada har slayd uchun chiziq, to'lib boradi;
 *   • ekranning o'ng yarmini bosish yoki chapga surish — keyingi slayd,
 *     chap yarmini bosish yoki o'ngga surish — oldingisi (alohida strelka
 *     tugmalari ATAYLAB yo'q — ekranni bosishning o'zi yetarli);
 *   • bosib turish — pauza (qo'yib yuborilsa davom etadi);
 *   • pastda havola tugmasi (slaydda bo'lsa) va «O'tkazib yuborish».
 *
 * Rasm belgilangan soniya turadi, video o'z uzunligicha (eng ko'pi
 * 30 soniya) va OVOZ BILAN boshlanadi. Telegram/brauzer mijoz ekranga
 * tegmaguncha ovozli avto-ijroga ruxsat bermasa — video ovozsiz o'ynaydi
 * va «Ovozni yoqish» tugmasi ko'zga tashlanadigan ko'rinishda chiqadi.
 * Yuklanmagan slayd jim o'tkazib yuboriladi: reklama hech qachon mijozni
 * do'kondan to'sib qolmasligi kerak.
 */
export function SplashAdView({ ad, labels, preview = false, startIndex = 0, onClose, onLeave, onAction, onTap }: Props) {
  const slides = ad.slides
  const [index, setIndex] = useState(() => Math.min(startIndex, Math.max(0, slides.length - 1)))
  const [ready, setReady] = useState(false)
  const [paused, setPaused] = useState(false)
  // Mijozga — ovoz bilan. Admin paneldagi ko'rinishda ovozsiz: tahrirlash
  // paytida video qayta-qayta baqirib turmasin (tugma bilan yoqsa bo'ladi).
  const [muted, setMuted] = useState(preview)
  /** Ovozni brauzer o'chirdi (mijoz emas) — tugma matn bilan ko'rsatiladi. */
  const [autoMuted, setAutoMuted] = useState(false)
  /** Mijoz o'zi ovozni o'chirgan — keyingi videolar ham ovozsiz boshlansin. */
  const userMuted = useRef(false)
  const [progress, setProgress] = useState(0)
  const [fit, setFit] = useState<'cover' | 'contain'>('cover')
  const [leaving, setLeaving] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  /** Joriy slayd mediasining asl o'lchami — ekran burilsa qayta hisoblash uchun. */
  const mediaSize = useRef<{ width: number; height: number } | null>(null)
  const videoBackdropRef = useRef<HTMLCanvasElement>(null)
  const elapsed = useRef(0)
  const holdTimer = useRef<number | null>(null)
  const held = useRef(false)
  /** Barmoq qayerdan bosildi — surish va bosishni ajratish uchun. */
  const pointerStart = useRef<{ x: number; y: number } | null>(null)

  const slide = slides[index]
  const isLast = index >= slides.length - 1

  const close = useCallback(() => {
    if (leaving) return
    setLeaving(true)
    // Avval yopilish — keyin nima bo'lsa ham reklama ekranda qotib qolmasin
    window.setTimeout(onClose, preview ? 0 : EXIT_MS)
    // Darhol — bosish hodisasi ichida (kirish ovozi shunda bloklanmaydi)
    try {
      onLeave?.()
    } catch {
      // ovoz — bezak; xatosi reklamani to'xtatmaydi
    }
  }, [leaving, onClose, onLeave, preview])

  const goTo = useCallback((target: number) => {
    let next = target
    if (next >= slides.length) {
      if (!preview) return close()
      next = 0
    }
    next = Math.max(0, next)
    elapsed.current = 0
    setProgress(0)
    if (next === index) {
      // O'sha slayd (birinchisida chapga bosish yoki bitta slaydli ko'rinish):
      // media qayta yuklanmaydi — faqat vaqt boshidan boshlanadi
      if (videoRef.current) videoRef.current.currentTime = 0
      return
    }
    setReady(false)
    // Har yangi videoda ovoz bilan qayta urinamiz: mijoz ekranga bir marta
    // tekkan bo'lsa, brauzer endi ovozli ijroga ruxsat beradi
    setMuted(preview || userMuted.current)
    setAutoMuted(false)
    setIndex(next)
  }, [slides.length, preview, close, index])

  /* ── Vaqt: rasm soniyalar bo'yicha, video o'z vaqti bo'yicha ── */
  useEffect(() => {
    if (!slide || !ready || paused || leaving) return
    let frame = 0
    let last = performance.now()

    const tick = (now: number) => {
      const delta = now - last
      last = now
      let value: number
      if (slide.type === 'video') {
        const video = videoRef.current
        const length = Math.min(video?.duration || AD_LIMITS.maxVideoSeconds, AD_LIMITS.maxVideoSeconds)
        value = video && length > 0 ? video.currentTime / length : 0
      } else {
        elapsed.current += delta
        value = elapsed.current / (slide.seconds * 1000)
      }
      if (value >= 1) {
        setProgress(1)
        goTo(index + 1)
        return
      }
      setProgress(value)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [slide, ready, paused, leaving, index, goTo])

  /* ── Video: ijro va pauza ──
     play() `ready` ni KUTMAY chaqiriladi: iOS ijro so'ralmaguncha videoni
     yuklamaydi, ovozli videoda esa `autoPlay` atributi ishlamaydi.
     Video tayyor bo'lganda (`ready`) yana bir marta chaqiriladi: yuklanish
     paytida uzilib qolgan so'rov (AbortError) shu bilan tiklanadi, allaqachon
     o'ynayotgan videoga esa hech narsa qilmaydi. */
  useEffect(() => {
    const video = videoRef.current
    if (!video || slide?.type !== 'video') return
    if (paused || leaving) {
      video.pause()
      return
    }
    const notAllowed = (error: unknown) => (error as { name?: string } | null)?.name === 'NotAllowedError'
    void video.play().catch((error: unknown) => {
      // AbortError — shunchaki pauza play() ni to'xtatgani (bosib turish), xato emas
      if (!notAllowed(error)) return
      if (video.muted) return goTo(index + 1)
      // Ovozli avto-ijroga ruxsat yo'q (mijoz hali ekranga tegmagan) —
      // ovozsiz o'ynaymiz, ovozni yoqish tugmasini ko'rsatamiz
      video.muted = true
      setMuted(true)
      setAutoMuted(true)
      void video.play().catch((again: unknown) => {
        if (notAllowed(again)) goTo(index + 1)
      })
    })
  }, [paused, leaving, ready, slide, index, goTo])

  const toggleSound = () => {
    const next = !muted
    userMuted.current = next
    setMuted(next)
    setAutoMuted(false)
    const video = videoRef.current
    if (!video) return
    // Bosish — foydalanuvchi harakati: endi brauzer ovozga ruxsat beradi
    video.muted = next
    if (!next && video.paused && !paused) void video.play().catch(() => {})
  }

  /* ── Yuklanmay qolgan slayd ── */
  useEffect(() => {
    if (ready || !slide) return
    const timer = window.setTimeout(() => goTo(index + 1), STALL_MS)
    return () => window.clearTimeout(timer)
  }, [ready, slide, index, goTo])

  /*
   * ── Video uchun xira fon ──
   * Rasmda bo'sh chetlarni o'sha rasmning xiralashtirilgan nusxasi yopadi.
   * Videoda buni CSS fon bilan qilib bo'lmaydi, ikkinchi video esa telefonni
   * ikki baravar yuklaydi. Shuning uchun joriy kadr kichkina kanvasga
   * (~48px) soniyasiga ~12 marta chiziladi va CSS bilan kattalashtirib
   * xiralashtiriladi — fon video bilan birga «jonli» o'zgaradi.
   * Begona manzildagi video kanvasni «bulg'aydi», lekin biz undan piksel
   * o'qimaymiz, faqat ko'rsatamiz — bunga brauzer ruxsat beradi.
   */
  useEffect(() => {
    if (slide?.type !== 'video' || fit !== 'contain') return
    const canvas = videoBackdropRef.current
    const stage = stageRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !stage || !ctx) return

    // Kanvas nisbati sahna nisbatiga teng — cho'zilib ketmasin
    canvas.width = 48
    canvas.height = Math.max(1, Math.round(48 * (stage.clientHeight + 80) / Math.max(1, stage.clientWidth + 80)))

    let frame = 0
    let last = 0
    let drawn = false
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw)
      if (now - last < 80) return
      last = now
      const video = videoRef.current
      if (!video || video.readyState < 2 || !video.videoWidth) return
      // Pauzada kadr o'zgarmaydi — qayta chizish shart emas
      if (video.paused && drawn) return
      const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight)
      const sw = canvas.width / scale
      const sh = canvas.height / scale
      try {
        ctx.drawImage(video, (video.videoWidth - sw) / 2, (video.videoHeight - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height)
        drawn = true
      } catch {
        // Ba'zi eski WebView'lar videoni kanvasga chiza olmaydi — fon qora qoladi, video ishlayveradi
      }
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [slide, fit])

  /* ── Keyingi rasmni oldindan yuklab qo'yamiz — o'tishda kutish bo'lmasin ── */
  useEffect(() => {
    const next = slides[index + 1]
    if (next?.type === 'image') new Image().src = next.url
  }, [slides, index])

  /* ── Ilova fonga o'tsa — pauza; Escape — yopish; klaviatura strelkalari — slaydlar ── */
  useEffect(() => {
    if (preview) return
    const onVisibility = () => setPaused(document.hidden)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') goTo(index + 1)
      else if (e.key === 'ArrowLeft') goTo(index - 1)
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('keydown', onKey)
    }
  }, [preview, close, goTo, index])

  /**
   * Media ekranni to'ldirsinmi (cover) yoki to'liq ko'rinsinmi (contain)?
   *
   * «Tik rasm — to'ldiramiz» qoidasi yetmaydi: zamonaviy telefon ekrani
   * 9:16 emas, ~9:19.5 (to'liq ekranda undan ham cho'ziq). 9:16 rasm shunday
   * ekranni to'ldirsa, yonlaridan ~18% kesilib, kattalashib ketgandek
   * ko'rinardi. Shuning uchun ekran va media nisbatidan kesiladigan qism
   * hisoblanadi: arzimas bo'lsa — to'ldiramiz, sezilarli bo'lsa — to'liq
   * ko'rsatib, bo'sh chetlarni xiralashtirilgan fon bilan yopamiz.
   */
  const applyFit = useCallback(() => {
    const stage = stageRef.current
    const size = mediaSize.current
    if (!stage || !size || !size.width || !size.height || !stage.clientHeight) return
    const screen = stage.clientWidth / stage.clientHeight
    const media = size.width / size.height
    const crop = media > screen ? 1 - screen / media : 1 - media / screen
    setFit(crop <= MAX_CROP ? 'cover' : 'contain')
  }, [])

  const onMediaSize = (width: number, height: number) => {
    mediaSize.current = { width, height }
    applyFit()
  }

  // Telefon burilsa yoki oyna o'lchami o'zgarsa — qayta hisoblaymiz
  useEffect(() => {
    window.addEventListener('resize', applyFit)
    return () => window.removeEventListener('resize', applyFit)
  }, [applyFit])

  /** Oldingi/keyingi slayd — bosish va surish shu yerdan o'tadi. */
  const step = (by: -1 | 1) => {
    onTap?.()
    goTo(index + by)
  }

  /* ── O'ng yarmi — keyingi, chap yarmi — oldingi; surish; bosib turish — pauza ── */
  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    held.current = false
    pointerStart.current = { x: e.clientX, y: e.clientY }
    holdTimer.current = window.setTimeout(() => {
      held.current = true
      setPaused(true)
    }, HOLD_MS)
  }

  const onPointerMove = (e: PointerEvent) => {
    const from = pointerStart.current
    if (!from || held.current) return
    // Barmoq siljiy boshladi — bu surish, pauza emas
    if (Math.abs(e.clientX - from.x) > MOVE_PX || Math.abs(e.clientY - from.y) > MOVE_PX) {
      if (holdTimer.current) window.clearTimeout(holdTimer.current)
    }
  }

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current)
    const from = pointerStart.current
    pointerStart.current = null
    if (held.current) {
      held.current = false
      setPaused(false)
      return
    }
    if (!from) return

    const dx = e.clientX - from.x
    const dy = e.clientY - from.y
    // Chapga surish — keyingi (kitob varag'idek), o'ngga surish — oldingi
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy)) return step(dx < 0 ? 1 : -1)
    // Sal siljib qolgan, lekin surish ham emas — hech narsa qilmaymiz
    if (Math.abs(dx) > MOVE_PX || Math.abs(dy) > MOVE_PX) return

    const rect = e.currentTarget.getBoundingClientRect()
    step(e.clientX - rect.left < rect.width / 2 ? -1 : 1)
  }

  const onPointerCancel = () => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current)
    pointerStart.current = null
    held.current = false
    setPaused(false)
  }

  if (!slide) return null

  return (
    <div
      className={'splash-ad' + (preview ? ' splash-ad--preview' : '') + (leaving ? ' leaving' : '')}
      role="dialog"
      aria-modal={!preview}
      // Ostidagi sahifalar orasida surish (use-swipe-nav) ishga tushmasin
      data-no-swipe
    >
      <div
        ref={stageRef}
        className="splash-ad__stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={(e) => { if (e.buttons) onPointerCancel() }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {slide.type === 'image' ? (
          <>
            {fit === 'contain' && (
              <div className="splash-ad__backdrop" style={{ backgroundImage: `url("${slide.url}")` }} />
            )}
            <img
              key={slide.id}
              className={'splash-ad__media is-' + fit + (ready ? ' is-ready' : '')}
              src={slide.url}
              alt=""
              draggable={false}
              onLoad={(e) => {
                onMediaSize(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)
                setReady(true)
              }}
              onError={() => goTo(index + 1)}
            />
          </>
        ) : (
          <>
            {fit === 'contain' && (
              <canvas key={`bg-${slide.id}`} ref={videoBackdropRef} className="splash-ad__backdrop splash-ad__backdrop--video" aria-hidden="true" />
            )}
            <video
              key={slide.id}
              ref={(el) => {
                videoRef.current = el
                // iOS ovozsiz ijroni `muted` ATRIBUTI bo'yicha ham tekshiradi, React
                // esa faqat xususiyatni qo'yadi (facebook/react#10389) — atributni
                // joriy holatga moslab qo'yamiz.
                // Faqat o'zgarganda: bu funksiya har kadrda chaqiriladi
                if (el && el.defaultMuted !== muted) el.defaultMuted = muted
              }}
              className={'splash-ad__media is-' + fit + (ready ? ' is-ready' : '')}
              src={slide.url}
              muted={muted}
              playsInline
              preload="auto"
              disablePictureInPicture
              onLoadedMetadata={(e) => onMediaSize(e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
              onCanPlay={() => setReady(true)}
              onEnded={() => goTo(index + 1)}
              onError={() => goTo(index + 1)}
            />
          </>
        )}

        <div className="splash-ad__shade" aria-hidden="true" />

        {!ready && (
          <div className="splash-ad__loading" aria-hidden="true">
            <Loader2 size={30} className="animate-spin" />
          </div>
        )}
      </div>

      {/* Tepada: har slayd uchun chiziq */}
      <div className="splash-ad__bars" aria-hidden="true">
        {slides.map((s, i) => (
          <span key={s.id} className="splash-ad__bar">
            <i style={{ transform: `scaleX(${i < index ? 1 : i === index ? progress : 0})` }} />
          </span>
        ))}
      </div>

      {slide.type === 'video' && (
        <button
          // Ovozni brauzer o'chirgan bo'lsa — matnli, yaqqol tugma: mijoz video
          // ovozsiz ekanini va bir bosishda yoqish mumkinligini ko'rsin
          className={'splash-ad__round' + (autoMuted ? ' splash-ad__round--hint' : '')}
          onClick={toggleSound}
          aria-label={muted ? labels.unmute : labels.mute}
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          {autoMuted && <span>{labels.unmute}</span>}
        </button>
      )}

      <div className="splash-ad__bottom">
        {slide.button && (
          <button
            className="splash-ad__cta"
            onClick={() => {
              if (preview) return
              onAction(slide.button!.link)
              close()
            }}
          >
            <span className="truncate">
              {labels.lang === 'ru' && slide.button.textRu
                ? slide.button.textRu
                : slide.button.text}
            </span>
            <ArrowRight size={19} />
          </button>
        )}
        <button className="splash-ad__skip" onClick={close}>
          {isLast ? labels.close : labels.skip}
        </button>
      </div>
    </div>
  )
}
