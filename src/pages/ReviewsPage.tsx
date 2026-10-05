import { useEffect, useState } from 'react'
import { ChevronLeft, MessageSquare, Star } from 'lucide-react'
import { subscribeToUserReviews } from '../lib/firebase'
import { auth } from '../lib/auth'
import { formatDate } from '../utils/date'
import { useT } from '../i18n'
import type { Review } from '../types/domain'
import { PageTitle } from '../components/layout/PageTitle'

type Props = { onBack: () => void }

export function ReviewsPage({ onBack }: Props) {
  const t = useT()
  const uid = auth.currentUser?.uid
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(Boolean(uid))

  useEffect(() => {
    if (!uid) return
    const unsub = subscribeToUserReviews(Number(uid), (fetched) => {
      setReviews(fetched)
      setLoading(false)
    })
    return () => unsub()
  }, [uid])

  return (
    <>
      <header className="page-head page-head--solo flex items-center gap-3 px-5 pt-8 sm:px-10">
        <button onClick={onBack} className="back-button" aria-label={t('common.back')}>
          <ChevronLeft size={22} />
        </button>
        <PageTitle className="text-2xl font-extrabold">{t('reviews.myTitle')}</PageTitle>
      </header>

      <div className="px-5 pb-32 pt-6 sm:px-10 page-animate">
        {loading ? (
          <div className="flex justify-center py-10">
            <div
              className="size-8 animate-spin rounded-full border-4"
              style={{ borderColor: 'var(--brand-soft)', borderTopColor: 'var(--brand)' }}
            />
          </div>
        ) : reviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div
              className="mb-4 grid size-16 place-items-center rounded-full"
              style={{ background: 'var(--surface-3)', color: 'var(--muted)' }}
            >
              <MessageSquare size={26} />
            </div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--ink-2)' }}>{t('reviews.myEmpty')}</h3>
            <p className="mt-1 max-w-[240px] text-sm" style={{ color: 'var(--muted)' }}>{t('reviews.myEmptyText')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {reviews.map((review) => (
              <div
                key={review.id}
                className="rounded-2xl border p-4"
                style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
                    {t('reviews.productId', { id: review.productId })}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--faint)' }}>{formatDate(review.date)}</span>
                </div>

                <div className="mb-3 flex gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      size={16}
                      fill={star <= review.rating ? 'var(--warning)' : 'none'}
                      style={{ color: star <= review.rating ? 'var(--warning)' : 'var(--line)' }}
                    />
                  ))}
                </div>

                {review.comment && (
                  <p
                    className="rounded-xl border p-3 text-sm"
                    style={{ background: 'var(--surface-2)', borderColor: 'var(--line-soft)', color: 'var(--ink-2)' }}
                  >
                    {review.comment}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
