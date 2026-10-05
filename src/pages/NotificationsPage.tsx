import { ArrowLeft, Bell, BellRing, Info, Package, Tag } from 'lucide-react'
import { formatDateTime } from '../utils/date'
import { useT } from '../i18n'
import type { Notification } from '../types/domain'
import { PageTitle } from '../components/layout/PageTitle'

type Props = {
  notifications: Notification[]
  onBack: () => void
}

const STYLES = {
  order: { Icon: Package, color: 'var(--info)', bg: 'var(--info-soft)' },
  promo: { Icon: Tag, color: 'var(--success)', bg: 'var(--success-soft)' },
  system: { Icon: Info, color: 'var(--warning)', bg: 'var(--warning-soft)' },
} as const

export function NotificationsPage({ notifications, onBack }: Props) {
  const t = useT()

  return (
    <>
      <header className="page-head page-head--solo flex items-center gap-3 px-5 pt-8 sm:px-10">
        <button onClick={onBack} className="back-button" aria-label={t('common.back')}>
          <ArrowLeft size={20} />
        </button>
        <PageTitle className="text-2xl font-extrabold">{t('notifications.title')}</PageTitle>
      </header>

      <div className="px-5 pb-32 pt-6 sm:px-10 page-animate">
        {notifications.length === 0 ? (
          <div className="mt-20 flex flex-col items-center justify-center text-center">
            <div
              className="grid size-20 place-items-center rounded-full"
              style={{ background: 'var(--surface-3)', color: 'var(--muted)' }}
            >
              <Bell size={30} />
            </div>
            <h3 className="mt-4 text-lg font-bold" style={{ color: 'var(--ink-2)' }}>
              {t('notifications.empty')}
            </h3>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
              {t('notifications.emptyText')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notif) => {
              const style = STYLES[notif.type as keyof typeof STYLES] ?? {
                Icon: BellRing,
                color: 'var(--brand)',
                bg: 'var(--brand-soft)',
              }
              const { Icon } = style

              return (
                <div
                  key={notif.id}
                  className="flex gap-4 rounded-2xl border p-4"
                  style={{
                    background: 'var(--surface)',
                    borderColor: notif.read ? 'var(--line)' : 'var(--brand-line)',
                    opacity: notif.read ? 0.75 : 1,
                  }}
                >
                  <div
                    className="grid size-10 shrink-0 place-items-center rounded-full"
                    style={{ background: style.bg, color: style.color }}
                  >
                    <Icon size={19} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{notif.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>{notif.body}</p>
                    {notif.image && (
                      <img src={notif.image} alt="" loading="lazy" className="mt-2 max-h-48 w-full rounded-xl object-cover" />
                    )}
                    <p className="mt-2 text-[10px] font-medium" style={{ color: 'var(--faint)' }}>
                      {formatDateTime(notif.date)}
                    </p>
                  </div>
                  {!notif.read && (
                    <div className="mt-1 size-2 shrink-0 rounded-full" style={{ background: 'var(--brand)' }} />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
