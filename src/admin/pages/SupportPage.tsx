import {
  ArrowLeft, CheckCheck, ExternalLink, Headset, Loader2, Lock, LockOpen, Package, SendHorizontal,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { apiPost } from '../lib/api'
import { useSupportMessages, useSupportThreads } from '../lib/live'
import { useToast } from '../components/Toast'
import { orderLabel, type SupportThread } from '../../types/support'
import type { Route } from '../lib/router'

type Filter = 'open' | 'closed' | 'all'

const time = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const today = new Date().toDateString() === d.toDateString()
  return today ? hm : `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')} ${hm}`
}

/**
 * Qo'llab-quvvatlash chati — kuryerlarning murojaatlari.
 *
 * Kuryer mini app'dagi profilidan buyurtmani tanlab muammoni yozadi,
 * u shu yerga JONLI tushadi. Admin javobi kuryerning ilovasida darhol
 * chiqadi va Telegram orqali ham boradi.
 */
export function SupportPage({
  focusId, navigate,
}: {
  focusId: string | null
  navigate: (route: Route, param?: string) => void
}) {
  const { threads, loading } = useSupportThreads(true)
  const [filter, setFilter] = useState<Filter>('open')
  const { show, node: toast } = useToast()

  const visible = threads.filter((thread) => filter === 'all' || thread.status === filter)
  const selected = threads.find((thread) => thread.id === focusId) ?? null
  const openCount = threads.filter((thread) => thread.status === 'open').length

  return (
    <>
      <div className={'adm-support ' + (selected ? 'has-chat' : '')}>
        {/* Murojaatlar ro'yxati */}
        <section className="adm-card adm-support__list">
          <div className="adm-support__filters">
            {([
              ['open', `Ochiq · ${openCount}`],
              ['closed', 'Yopilgan'],
              ['all', 'Hammasi'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                className={'adm-support__filter ' + (filter === key ? 'active' : '')}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="grid place-items-center py-10"><Loader2 className="animate-spin" /></div>
          ) : visible.length === 0 ? (
            <div className="adm-empty">
              <Headset size={28} style={{ color: 'var(--faint)' }} />
              <p className="mt-2 text-sm font-bold">Murojaat yo‘q</p>
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                Kuryer ilovadagi «Qo‘llab-quvvatlash» orqali yozsa, shu yerga tushadi.
              </p>
            </div>
          ) : (
            <ul className="adm-support__threads">
              {visible.map((thread) => (
                <li key={thread.id}>
                  <button
                    className={'adm-support__thread ' + (thread.id === focusId ? 'active' : '')}
                    onClick={() => navigate('support', thread.id)}
                  >
                    <span className="adm-support__avatar">{thread.courierName.charAt(0).toUpperCase()}</span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="flex items-center gap-1.5">
                        <b className="truncate text-sm">{thread.courierName}</b>
                        <span className="adm-support__order">
                          {orderLabel(thread.orderNumber, thread.orderDay) ?? 'Umumiy'}
                        </span>
                      </span>
                      <span className="block truncate text-xs" style={{ color: 'var(--muted)' }}>
                        {thread.lastFrom === 'admin' ? 'Siz: ' : ''}{thread.lastText}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-[11px]" style={{ color: 'var(--faint)' }}>{time(thread.lastAt)}</span>
                      {thread.unreadAdmin > 0 && <span className="adm-nav__badge">{thread.unreadAdmin}</span>}
                      {thread.status === 'closed' && <Lock size={12} style={{ color: 'var(--faint)' }} />}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Chat */}
        <section className="adm-card adm-support__chat">
          {selected ? (
            <Conversation
              key={selected.id}
              thread={selected}
              onBack={() => navigate('support')}
              onOpenOrder={(id) => navigate('orders', id)}
              onError={(message) => show(message, 'error')}
            />
          ) : (
            <div className="adm-empty m-auto">
              <Headset size={32} style={{ color: 'var(--faint)' }} />
              <p className="mt-2 text-sm font-bold">Murojaatni tanlang</p>
            </div>
          )}
        </section>
      </div>
      {toast}
    </>
  )
}

function Conversation({
  thread, onBack, onOpenOrder, onError,
}: {
  thread: SupportThread
  onBack: () => void
  onOpenOrder: (orderId: string) => void
  onError: (message: string) => void
}) {
  const messages = useSupportMessages(thread.id)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: messages.length > 1 ? 'smooth' : 'auto' })
  }, [messages.length])

  // Ochiq turgan murojaatga kelgan xabar darhol o'qilgan bo'ladi
  useEffect(() => {
    if (thread.unreadAdmin > 0) {
      apiPost('action', { action: 'support.read', threadId: thread.id }).catch(() => {})
    }
  }, [thread.id, thread.unreadAdmin])

  const send = async () => {
    const value = text.trim()
    if (!value) return
    setBusy(true)
    try {
      await apiPost('action', { action: 'support.reply', threadId: thread.id, text: value })
      setText('')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Yuborilmadi')
    } finally {
      setBusy(false)
    }
  }

  const toggle = async () => {
    try {
      await apiPost('action', { action: 'support.close', threadId: thread.id, closed: thread.status === 'open' })
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Bajarilmadi')
    }
  }

  return (
    <>
      <header className="adm-support__head">
        <button className="adm-support__back lg:hidden" onClick={onBack} aria-label="Orqaga">
          <ArrowLeft size={18} />
        </button>
        <span className="adm-support__avatar">{thread.courierName.charAt(0).toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <b className="block truncate text-sm">{thread.courierName}</b>
          <span className="block truncate text-xs" style={{ color: 'var(--muted)' }}>
            {orderLabel(thread.orderNumber, thread.orderDay) ?? 'Umumiy savol'}
            {thread.status === 'closed' ? ' · yopilgan' : ''}
          </span>
        </div>
        {thread.orderId && (
          <button className="adm-btn adm-btn--ghost" onClick={() => onOpenOrder(thread.orderId!)} title="Buyurtmani ochish">
            <Package size={15} /> <span className="hidden sm:inline">Buyurtma</span> <ExternalLink size={13} />
          </button>
        )}
        <button className="adm-btn adm-btn--ghost" onClick={toggle} title={thread.status === 'open' ? 'Yopish' : 'Qayta ochish'}>
          {thread.status === 'open' ? <Lock size={15} /> : <LockOpen size={15} />}
          <span className="hidden sm:inline">{thread.status === 'open' ? 'Yopish' : 'Ochish'}</span>
        </button>
      </header>

      <div className="adm-support__messages">
        {messages.map((m) => (
          <div key={m.id} className={'adm-msg ' + (m.from === 'admin' ? 'is-mine' : 'is-courier')}>
            {m.from === 'admin' && <span className="adm-msg__author">{m.authorName}</span>}
            <p className="adm-msg__text">{m.text}</p>
            <span className="adm-msg__time">{time(m.at)} {m.from === 'admin' && <CheckCheck size={12} />}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <footer className="adm-support__composer">
        <textarea
          className="adm-input"
          rows={2}
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter — yuborish, Shift+Enter — yangi qator
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          placeholder="Javob yozing… (Enter — yuborish, Shift+Enter — yangi qator)"
        />
        <button className="adm-btn adm-btn--primary" onClick={send} disabled={busy || !text.trim()} aria-label="Yuborish">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <SendHorizontal size={16} />}
        </button>
      </footer>
    </>
  )
}
