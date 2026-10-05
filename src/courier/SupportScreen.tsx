import {
  CheckCheck, ChevronLeft, ChevronRight, Headset, Loader2, MessageSquarePlus, Package, SendHorizontal,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { apiErrorText } from '../utils/api-error'
import { usePresence } from '../hooks/use-presence'
import { hapticError, hapticSuccess, setupBackButton, toggleBackButton } from '../utils/telegram'
import { orderLabel, type SupportThread } from '../types/support'
import type { CourierOrder } from './api'
import { clock } from './format'
import { markSupportRead, openThread, sendSupport, useThreadMessages } from './support'

type View = { kind: 'list' } | { kind: 'new' } | { kind: 'chat'; threadId: string }

type Props = {
  open: boolean
  /** Bot xabaridan (`?support=<id>`) — to'g'ridan-to'g'ri shu chat. */
  initialThreadId: string | null
  /**
   * Buyurtma tafsilotidan ochilgan — murojaat faqat SHU buyurtma
   * bo'yicha: boshqa buyurtmalar va murojaatlar ro'yxati ko'rinmaydi,
   * «orqaga» esa tafsilotga qaytaradi.
   */
  lockedOrder?: CourierOrder | null
  threads: SupportThread[]
  threadsReady: boolean
  /** Tanlash uchun kuryerning buyurtmalari (yo'lda, bugungi, tarix, yangi). */
  orders: CourierOrder[]
  onClose: () => void
}

/**
 * Qo'llab-quvvatlash — kuryer admin bilan jonli yozishadi.
 *
 * Kuryer buyurtmani tanlaydi (yoki «umumiy savol») va muammoni yozadi.
 * Xabar admin paneldagi «Qo'llab-quvvatlash» bo'limiga darhol tushadi,
 * adminning javobi shu yerda jonli paydo bo'ladi.
 */
export function SupportScreen({
  open, initialThreadId, lockedOrder = null, threads, threadsReady, orders, onClose,
}: Props) {
  const { t } = useI18n()
  const { mounted, leaving } = usePresence(open, 240)
  const [view, setView] = useState<View>(
    initialThreadId
      ? { kind: 'chat', threadId: initialThreadId }
      : lockedOrder ? { kind: 'new' } : { kind: 'list' },
  )

  // Telegram «orqaga» tugmasi va ekrandagi «‹» bir xil ishlaydi:
  // chatdan ro'yxatga, ro'yxatdan — oynani yopish. Buyurtmadan
  // ochilgan bo'lsa — to'g'ri tafsilotga qaytiladi.
  const back = () => (view.kind === 'list' || lockedOrder ? onClose() : setView({ kind: 'list' }))
  const backRef = useRef(back)
  useEffect(() => {
    backRef.current = back
  })
  useEffect(() => {
    if (!open) return
    toggleBackButton(true)
    const off = setupBackButton(() => backRef.current())
    return () => {
      off()
      toggleBackButton(false)
    }
  }, [open])

  if (!mounted) return null

  const thread = view.kind === 'chat' ? threads.find((x) => x.id === view.threadId) ?? null : null

  return (
    <div className={'crr-detail crr-support ' + (leaving ? 'leaving' : '')} role="dialog" aria-modal="true">
      <header className="crr-detail__head">
        <button className="crr-icon-btn" onClick={back} aria-label={t('common.back')}>
          <ChevronLeft size={21} />
        </button>
        <div className="min-w-0 flex-1">
          <b className="block truncate text-lg font-extrabold" style={{ color: 'var(--ink)' }}>
            {view.kind === 'chat'
              ? thread ? orderLabel(thread.orderNumber, thread.orderDay) ?? t('support.general') : t('support.title')
              : view.kind === 'new'
                ? lockedOrder ? orderLabel(lockedOrder.number, lockedOrder.orderDay) : t('support.new')
                : t('support.title')}
          </b>
          <span className="block text-xs" style={{ color: 'var(--muted)' }}>
            {view.kind === 'chat'
              ? thread?.status === 'closed' ? t('support.closedShort') : t('support.online')
              : t('support.subtitle')}
          </span>
        </div>
        {view.kind === 'list' && (
          <button className="crr-chip" onClick={() => setView({ kind: 'new' })}>
            <MessageSquarePlus size={15} className="mr-1 inline" />
            {t('support.newShort')}
          </button>
        )}
      </header>

      {view.kind === 'list' && (
        <ThreadList
          threads={threads}
          ready={threadsReady}
          onOpen={(id) => setView({ kind: 'chat', threadId: id })}
          onNew={() => setView({ kind: 'new' })}
        />
      )}
      {view.kind === 'new' && (
        <NewThread
          orders={orders}
          lockedOrder={lockedOrder}
          onCreated={(id) => setView({ kind: 'chat', threadId: id })}
        />
      )}
      {view.kind === 'chat' && <Chat key={view.threadId} threadId={view.threadId} thread={thread} />}
    </div>
  )
}

function ThreadList({
  threads, ready, onOpen, onNew,
}: {
  threads: SupportThread[]
  ready: boolean
  onOpen: (id: string) => void
  onNew: () => void
}) {
  const { t } = useI18n()
  return (
    <div className="crr-detail__body">
      {!ready ? (
        <div className="grid gap-2">{[0, 1, 2].map((i) => <span key={i} className="crr-skel h-16 w-full" />)}</div>
      ) : threads.length === 0 ? (
        <div className="crr-empty mt-2">
          <span className="crr-empty__icon"><Headset size={30} /></span>
          <p className="mt-3 font-extrabold" style={{ color: 'var(--ink)' }}>{t('support.emptyTitle')}</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>{t('support.emptyText')}</p>
          <button className="crr-btn crr-btn--primary mt-4" onClick={onNew}>
            <MessageSquarePlus size={18} /> {t('support.new')}
          </button>
        </div>
      ) : (
        <ul className="crr-threads">
          {threads.map((thread) => (
            <li key={thread.id}>
              <button className="crr-thread" onClick={() => onOpen(thread.id)}>
                <span className={'crr-thread__icon ' + (thread.orderId ? '' : 'is-general')}>
                  {thread.orderId ? <Package size={18} /> : <Headset size={18} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <b className="truncate text-sm" style={{ color: 'var(--ink)' }}>
                      {orderLabel(thread.orderNumber, thread.orderDay) ?? t('support.general')}
                    </b>
                    {thread.status === 'closed' && <span className="crr-thread__closed">{t('support.closedShort')}</span>}
                  </span>
                  <span className="block truncate text-xs" style={{ color: 'var(--muted)' }}>
                    {thread.lastFrom === 'admin' ? `${t('support.adminPrefix')}: ` : ''}{thread.lastText}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[11px]" style={{ color: 'var(--faint)' }}>{clock(thread.lastAt)}</span>
                  {thread.unreadCourier > 0 ? (
                    <span className="crr-count crr-count--hot">{thread.unreadCourier}</span>
                  ) : (
                    <ChevronRight size={16} style={{ color: 'var(--faint)' }} />
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Yangi murojaat: buyurtma tanlanadi va muammo yoziladi. */
function NewThread({
  orders, lockedOrder, onCreated,
}: {
  orders: CourierOrder[]
  lockedOrder: CourierOrder | null
  onCreated: (id: string) => void
}) {
  const { t } = useI18n()
  // Buyurtmadan ochilgan bo'lsa — u oldindan tanlangan va o'zgarmaydi
  const [orderId, setOrderId] = useState<string | null | undefined>(lockedOrder?.id)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (orderId === undefined || !text.trim()) return
    setBusy(true)
    setError(null)
    try {
      const id = await openThread(orderId, text.trim())
      hapticSuccess()
      onCreated(id)
    } catch (e) {
      hapticError()
      setError(apiErrorText(e, t, 'error.courierGeneric'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="crr-detail__body">
        {lockedOrder ? (
          <>
            <p className="crr-block__title">{t('support.aboutOrder')}</p>
            <div className="crr-pick__item active">
              <span className="crr-thread__icon"><Package size={17} /></span>
              <span className="min-w-0 flex-1 text-left">
                <b className="block text-sm">{orderLabel(lockedOrder.number, lockedOrder.orderDay)}</b>
                <span className="block truncate text-xs" style={{ color: 'var(--muted)' }}>
                  {lockedOrder.customer.address || '—'}
                </span>
              </span>
              <span className="crr-thread__closed">{statusShort(lockedOrder.status, t)}</span>
            </div>
          </>
        ) : (
          <>
            <p className="crr-block__title">{t('support.pickOrder')}</p>
            <div className="crr-pick">
              <button
                className={'crr-pick__item ' + (orderId === null ? 'active' : '')}
                onClick={() => setOrderId(null)}
              >
                <span className="crr-thread__icon is-general"><Headset size={17} /></span>
                <span className="min-w-0 flex-1 text-left">
                  <b className="block text-sm">{t('support.general')}</b>
                  <span className="block text-xs" style={{ color: 'var(--muted)' }}>{t('support.generalSub')}</span>
                </span>
              </button>
              {orders.map((order) => (
                <button
                  key={order.id}
                  className={'crr-pick__item ' + (orderId === order.id ? 'active' : '')}
                  onClick={() => setOrderId(order.id)}
                >
                  <span className="crr-thread__icon"><Package size={17} /></span>
                  <span className="min-w-0 flex-1 text-left">
                    <b className="block text-sm">{orderLabel(order.number, order.orderDay)}</b>
                    <span className="block truncate text-xs" style={{ color: 'var(--muted)' }}>
                      {order.customer.address || '—'}
                    </span>
                  </span>
                  <span className="crr-thread__closed">{statusShort(order.status, t)}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <p className="crr-block__title mt-5">{t('support.problem')}</p>
        <textarea
          className="crr-textarea"
          rows={5}
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('support.problemPlaceholder')}
        />
        {error && <p className="mt-2 text-sm font-bold" style={{ color: 'var(--danger)' }}>{error}</p>}
      </div>
      <footer className="crr-detail__foot">
        <button
          className="crr-btn crr-btn--primary crr-btn--block"
          disabled={busy || orderId === undefined || !text.trim()}
          onClick={submit}
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : <SendHorizontal size={18} />}
          {orderId === undefined ? t('support.pickFirst') : t('support.send')}
        </button>
      </footer>
    </>
  )
}

function statusShort(status: string, t: ReturnType<typeof useI18n>['t']) {
  if (status === 'Yetkazildi') return t('courier.statusDone')
  if (status === 'Yetkazilmoqda') return t('courier.statusActive')
  return t('courier.statusNew')
}

/** Jonli chat — xabarlar Firestore obunasidan keladi. */
function Chat({ threadId, thread }: { threadId: string; thread: SupportThread | null }) {
  const { t } = useI18n()
  const { messages, ready } = useThreadMessages(threadId)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  // Yangi xabar kelganda pastga tushamiz
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: messages.length > 1 ? 'smooth' : 'auto' })
  }, [messages.length])

  // Ochiq turganda kelgan javoblar ham darhol «o'qildi» bo'ladi
  const unread = thread?.unreadCourier ?? 0
  useEffect(() => {
    if (unread > 0) void markSupportRead(threadId)
  }, [threadId, unread])

  const send = async () => {
    const value = text.trim()
    if (!value) return
    setBusy(true)
    setError(null)
    try {
      await sendSupport(threadId, value)
      setText('')
    } catch (e) {
      hapticError()
      setError(apiErrorText(e, t, 'error.courierGeneric'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="crr-detail__body crr-chat">
        {!ready && <div className="grid place-items-center py-10"><Loader2 className="animate-spin" /></div>}
        {messages.map((m) => (
          <div key={m.id} className={'crr-msg ' + (m.from === 'courier' ? 'is-mine' : 'is-admin')}>
            {m.from === 'admin' && <span className="crr-msg__author">{m.authorName || t('support.adminPrefix')}</span>}
            <p className="crr-msg__text">{m.text}</p>
            <span className="crr-msg__time">
              {clock(m.at)} {m.from === 'courier' && <CheckCheck size={13} />}
            </span>
          </div>
        ))}
        {thread?.status === 'closed' && <p className="crr-chat__note">{t('support.closedNote')}</p>}
        <div ref={endRef} />
      </div>
      <footer className="crr-detail__foot crr-composer">
        {error && <p className="mb-2 text-xs font-bold" style={{ color: 'var(--danger)' }}>{error}</p>}
        <div className="flex items-end gap-2">
          <textarea
            className="crr-textarea crr-composer__input"
            rows={1}
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('support.messagePlaceholder')}
          />
          <button
            className="crr-composer__send"
            onClick={send}
            disabled={busy || !text.trim()}
            aria-label={t('support.send')}
          >
            {busy ? <Loader2 size={19} className="animate-spin" /> : <SendHorizontal size={19} />}
          </button>
        </div>
      </footer>
    </>
  )
}
