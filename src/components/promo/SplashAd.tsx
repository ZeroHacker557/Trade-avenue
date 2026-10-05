import { useEffect, useRef, useState } from 'react'
import { useI18n, useT } from '../../i18n'
import { fetchSplashAd } from '../../lib/firebase'
import type { Product, Section } from '../../types/domain'
import { ALL_CATEGORIES, markAdSeen, shouldShowAd, type AdLink, type SplashAd as Ad } from '../../utils/splash-ad'
import { getTelegram, hapticFeedback, hapticSelection } from '../../utils/telegram'
import { SplashAdView } from './SplashAdView'

type Props = {
  products: Product[]
  sections: Section[]
  /** Bo'sh kategoriya — «Barchasi»; `sectionId` — o'sha bo'limga surish. */
  onOpenCategory: (category: string, sectionId?: string | null) => void
  onOpenProduct: (product: Product) => void
  /** Reklama ko'rinib turganda boshqa takliflar (manzil) chiqmasin. */
  onVisibleChange?: (visible: boolean) => void
  /**
   * Intro tugadi — reklama yopila boshladi yoki umuman chiqmadi.
   * Reklama yopilganda bosish hodisasi ichida chaqiriladi (kirish ovozi uchun).
   */
  onFinished?: () => void
}

/** Ochilish animatsiyasidan keyin birinchi rasm shuncha vaqtda yuklanmasa, reklama bu safar chiqmaydi. */
const FIRST_IMAGE_WAIT_MS = 3000

/** index.html dagi ochilish animatsiyasi tugashini kutadi. */
function splashDone(): Promise<void> {
  if (!document.documentElement.hasAttribute('data-splash')) return Promise.resolve()
  return new Promise((resolve) => window.addEventListener('ta:splash-done', () => resolve(), { once: true }))
}

/** Birinchi slayd rasmi bo'lsa — oldindan yuklab olamiz, qora ekran chaqnamasin. */
function preloadFirst(ad: Ad): Promise<boolean> {
  const first = ad.slides[0]
  if (first.type !== 'image') return Promise.resolve(true)
  return new Promise((resolve) => {
    const image = new Image()
    const timer = window.setTimeout(() => resolve(false), FIRST_IMAGE_WAIT_MS)
    image.onload = () => { window.clearTimeout(timer); resolve(true) }
    image.onerror = () => { window.clearTimeout(timer); resolve(false) }
    image.src = first.url
  })
}

/**
 * Ilova ochilganda chiqadigan reklama (admin panel → «Reklama banneri»).
 *
 * Tartib: reklama ochilish animatsiyasi bilan PARALLEL yuklanadi,
 * animatsiya tugagach chiqadi. Qanchalik tez-tez chiqishini admin
 * belgilaydi (har safar / kuniga bir / bir marta) — hisob shu
 * qurilmada saqlanadi.
 *
 * Reklama do'konni hech qachon to'sib qolmaydi: o'qib bo'lmasa,
 * rasm yuklanmasa yoki o'chirilgan bo'lsa — shunchaki chiqmaydi.
 */
export function SplashAd({ products, sections, onOpenCategory, onOpenProduct, onVisibleChange, onFinished }: Props) {
  const t = useT()
  const { lang } = useI18n()
  const [ad, setAd] = useState<Ad | null>(null)
  const finished = useRef(onFinished)
  useEffect(() => { finished.current = onFinished }, [onFinished])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [loaded] = await Promise.all([fetchSplashAd().catch(() => null), splashDone()])
      if (cancelled) return
      // Reklama bu safar chiqmaydi — intro shu bilan tugadi
      if (!loaded || !shouldShowAd(loaded) || !(await preloadFirst(loaded))) {
        if (!cancelled) {
          try { finished.current?.() } catch { /* ovoz — bezak */ }
        }
        return
      }
      if (cancelled) return
      markAdSeen(loaded)
      setAd(loaded)
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => onVisibleChange?.(ad !== null), [ad, onVisibleChange])

  if (!ad) return null

  const act = (link: AdLink) => {
    hapticFeedback('medium')
    if (link.kind === 'category') return onOpenCategory(link.category === ALL_CATEGORIES ? '' : link.category)
    if (link.kind === 'section') {
      const section = sections.find((s) => s.id === link.sectionId)
      // Bo'lim o'chirilgan bo'lsa — butun katalog, tugma baribir ishlasin
      return section ? onOpenCategory(section.category, section.id) : onOpenCategory('')
    }
    if (link.kind === 'product') {
      const product = products.find((p) => String(p.id) === link.productId)
      if (product) onOpenProduct(product)
      return
    }
    const tg = getTelegram()
    const isTelegramLink = /^https?:\/\/t\.me\//i.test(link.url)
    if (isTelegramLink && tg?.openTelegramLink) tg.openTelegramLink(link.url)
    else if (tg?.openLink) tg.openLink(link.url)
    else window.open(link.url, '_blank', 'noopener')
  }

  return (
    <SplashAdView
      ad={ad}
      labels={{
        skip: t('ad.skip'), close: t('ad.close'), mute: t('ad.mute'), unmute: t('ad.unmute'),
        lang,
      }}
      onClose={() => setAd(null)}
      onLeave={() => finished.current?.()}
      onAction={act}
      onTap={hapticSelection}
    />
  )
}
