import { Bike, Loader2, ShoppingBag, Star } from 'lucide-react'
import { datedNumber } from '../../utils/order-label'
import { useState } from 'react'
import { useI18n, type TranslationKey } from '../../i18n'
import { usePresence } from '../../hooks/use-presence'
import { hapticError, hapticSelection, hapticSuccess } from '../../utils/telegram'
import { parseDate } from '../../utils/date'
import type { Order } from '../../types/domain'

/** `productStars` — buyurtmadagi hamma mahsulotga bitta baho (ixtiyoriy). */
export type CourierRatingPayload = { stars: number; tags: string[]; comment: string; productStars?: number }

type Props = {
  orders: Order[]
  /** Boshqa oyna (reklama, manzil taklifi) ochiq — kutib turadi. */
  blocked: boolean
  submit: (orderId: string, payload: CourierRatingPayload) => Promise<void>
}

const SKIP_KEY = 'musa:courier-rating-skip'
/** Shundan eski buyurtma uchun so'ralmaydi. */
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000

const GOOD: { key: string; label: TranslationKey }[] = [
  { key: 'fast', label: 'rating.tagFast' },
  { key: 'polite', label: 'rating.tagPolite' },
  { key: 'careful', label: 'rating.tagCareful' },
]
const BAD: { key: string; label: TranslationKey }[] = [
  { key: 'late', label: 'rating.tagLate' },
  { key: 'rude', label: 'rating.tagRude' },
  { key: 'damaged', label: 'rating.tagDamaged' },
]
const MOOD: TranslationKey[] = ['rating.mood1', 'rating.mood2', 'rating.mood3', 'rating.mood4', 'rating.mood5']

function readSkipped(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SKIP_KEY) || '[]') as string[]
  } catch {
    return []
  }
}

/**
 * Bot xabaridagi «⭐ Baholash» tugmasi ilovani `?rate=<id>` bilan ochadi
 * (api/_lib/actions/orders.ts → sendRatingPrompt): shu buyurtma «Keyinroq»
 * bosilgan yoki eski bo'lsa ham so'raladi — mijozning o'zi baholamoqchi.
 */
const RATE_PARAM = new URLSearchParams(location.search).get('rate')

/** Baholanmagan oxirgi yetkazilgan buyurtma (kuryeri bilan). */
function pending(orders: Order[], skipped: string[]): Order | null {
  const now = Date.now()
  const asked = RATE_PARAM
    ? orders.find((o) => o.id === RATE_PARAM && o.status === 'Yetkazildi' && o.courierId && !o.courierRating)
    : null
  if (asked) return asked
  return orders.find((o) =>
    o.status === 'Yetkazildi'
    && o.courierId
    && !o.courierRating
    && !skipped.includes(o.id)
    && now - parseDate(o.deliveredAt || o.createdAt) < MAX_AGE_MS,
  ) ?? null
}

/**
 * «Kuryer qanday yetkazdi?» — ilova ochilganda ekranning yarmida
 * chiqadigan oyna.
 *
 * Katta 5 ta yulduz, bahoga mos tez teglar va ixtiyoriy izoh. «Keyinroq»
 * bosilsa shu buyurtma uchun boshqa so'ralmaydi. Baho server tomonida
 * tekshiriladi (api/reviews.ts → kind: courier) va kuryer reytingiga
 * qo'shiladi.
 */
export function CourierRatingSheet({ orders, blocked, submit }: Props) {
  const { t } = useI18n()
  const [skipped, setSkipped] = useState(readSkipped)
  const [stars, setStars] = useState(0)
  const [productStars, setProductStars] = useState(0)
  const [tags, setTags] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [thanked, setThanked] = useState<string | null>(null)

  const target = pending(orders, skipped)
  const open = !blocked && (target !== null || thanked !== null)
  const { mounted, leaving } = usePresence(open && thanked !== 'closed', 260)
  const [shown, setShown] = useState<Order | null>(target)
  if (target && target !== shown && thanked === null) setShown(target)
  if (!mounted || !shown) return null

  const close = (skip: boolean) => {
    if (skip && shown) {
      const next = [...skipped, shown.id]
      setSkipped(next)
      try {
        localStorage.setItem(SKIP_KEY, JSON.stringify(next.slice(-30)))
      } catch {
        // saqlanmasa ham shu seansda so'ralmaydi
      }
    }
    setThanked('closed')
  }

  const choose = (n: number) => {
    hapticSelection()
    // Yaxshidan yomonga o'tsa — teglar ham almashadi
    if ((n >= 4) !== (stars >= 4)) setTags([])
    setStars(n)
  }

  const send = async () => {
    if (!stars || !shown) return
    setBusy(true)
    try {
      await submit(shown.id, {
        stars,
        tags,
        comment: comment.trim(),
        ...(productStars ? { productStars } : {}),
      })
      hapticSuccess()
      setThanked(shown.id)
      setTimeout(() => close(false), 1600)
    } catch {
      hapticError()
      // Xato bo'lsa ham oyna mijozni ushlab turmasin — keyingi safar so'raladi
      setThanked('closed')
    } finally {
      setBusy(false)
    }
  }

  const options = stars >= 4 ? GOOD : BAD
  const initial = (shown.courierName || 'K').trim().charAt(0).toUpperCase()

  return (
    <div className={'crt-overlay ' + (leaving ? 'leaving' : '')} onClick={() => !busy && close(true)}>
      <div
        className={'crt-sheet ' + (leaving ? 'leaving' : '')}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="crt-grip" />

        {thanked && thanked !== 'closed' ? (
          <div className="crt-thanks">
            <span className="crt-thanks__stars">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} size={30} fill={n <= stars ? 'currentColor' : 'none'} style={{ animationDelay: `${n * 70}ms` }} />
              ))}
            </span>
            <b className="mt-3 block text-xl font-extrabold" style={{ color: 'var(--ink)' }}>{t('rating.thanks')}</b>
            <span className="mt-1 block text-sm" style={{ color: 'var(--muted)' }}>{t('rating.thanksText')}</span>
          </div>
        ) : (
          <>
            <div className="crt-head">
              <span className="crt-avatar">
                {initial}
                <span className="crt-avatar__badge"><Bike size={13} /></span>
              </span>
              <b className="mt-3 block text-lg font-extrabold" style={{ color: 'var(--ink)' }}>{t('rating.title')}</b>
              <span className="mt-0.5 block text-sm" style={{ color: 'var(--muted)' }}>
                {t('rating.subtitle', { name: shown.courierName || t('rating.courier'), number: datedNumber(shown.orderNumber, shown.orderDay, shown.createdAt) })}
              </span>
            </div>

            <div className="crt-stars" role="radiogroup" aria-label={t('rating.title')}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  role="radio"
                  aria-checked={stars === n}
                  aria-label={`${n}`}
                  className={'crt-star ' + (n <= stars ? 'is-on' : '')}
                  onClick={() => choose(n)}
                >
                  <Star size={40} strokeWidth={1.8} fill={n <= stars ? 'currentColor' : 'none'} />
                </button>
              ))}
            </div>
            <p className="crt-mood">{stars ? t(MOOD[stars - 1]) : t('rating.tapStar')}</p>

            {stars > 0 && (
              <>
                <div className="crt-tags">
                  {options.map((o) => {
                    const on = tags.includes(o.key)
                    return (
                      <button
                        key={o.key}
                        className={'crt-tag ' + (on ? 'is-on' : '')}
                        onClick={() => setTags((list) => (on ? list.filter((x) => x !== o.key) : [...list, o.key]))}
                      >
                        {t(o.label)}
                      </button>
                    )
                  })}
                </div>
                {/* Mahsulotlar — alohida so'rov yo'q, shu oynaning o'zida */}
                <div className="crt-products">
                  <span className="crt-products__label">
                    <ShoppingBag size={16} /> {t('rating.products')}
                  </span>
                  <span className="crt-products__stars" role="radiogroup" aria-label={t('rating.products')}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        role="radio"
                        aria-checked={productStars === n}
                        aria-label={`${n}`}
                        className={'crt-star crt-star--sm ' + (n <= productStars ? 'is-on' : '')}
                        onClick={() => {
                          hapticSelection()
                          setProductStars(n)
                        }}
                      >
                        <Star size={24} strokeWidth={1.9} fill={n <= productStars ? 'currentColor' : 'none'} />
                      </button>
                    ))}
                  </span>
                </div>
                <textarea
                  className="crt-comment"
                  rows={2}
                  maxLength={500}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={t('rating.commentPlaceholder')}
                />
              </>
            )}

            <button className="btn-primary crt-send" disabled={!stars || busy} onClick={send}>
              {busy && <Loader2 size={18} className="animate-spin" />}
              {t('rating.send')}
            </button>
            <button className="crt-later" onClick={() => close(true)} disabled={busy}>
              {t('rating.later')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
