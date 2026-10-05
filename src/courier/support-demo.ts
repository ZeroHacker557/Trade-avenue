import type { SupportMessage, SupportThread } from '../types/support'
import { demoOrderById } from './demo'

/* ─── Faqat `?courierDemo` uchun: xotiradagi chat ─────────────
   Admin 1,5 soniyadan keyin avtomatik javob beradi — jonli
   yangilanishni Telegram va serversiz ko'rish uchun. */
export const demo = (() => {
  let threads: SupportThread[] = []
  const messages = new Map<string, SupportMessage[]>()
  const threadSubs = new Set<(list: SupportThread[]) => void>()
  const messageSubs = new Map<string, Set<(list: SupportMessage[]) => void>>()
  let seq = 0

  const emit = (threadId?: string) => {
    const sorted = [...threads].sort((a, b) => b.lastAt.localeCompare(a.lastAt))
    threadSubs.forEach((fn) => fn(sorted))
    if (threadId) messageSubs.get(threadId)?.forEach((fn) => fn([...(messages.get(threadId) ?? [])]))
  }

  const push = (threadId: string, from: 'courier' | 'admin', text: string) => {
    const at = new Date().toISOString()
    messages.set(threadId, [...(messages.get(threadId) ?? []), {
      id: 'm' + ++seq, from, authorName: from === 'admin' ? 'Abubakr' : 'Komiljon', text, at,
    }])
    threads = threads.map((t) => t.id !== threadId ? t : {
      ...t, lastAt: at, lastText: text, lastFrom: from, status: 'open',
      unreadCourier: from === 'admin' ? t.unreadCourier + 1 : 0,
    })
    emit(threadId)
    if (from === 'courier') {
      setTimeout(() => push(threadId, 'admin', 'Qabul qildik, hozir tekshiramiz. Bir daqiqa kuting 🙏'), 1500)
    }
  }

  return {
    subscribeThreads(fn: (list: SupportThread[]) => void) {
      threadSubs.add(fn)
      fn([...threads])
      return () => { threadSubs.delete(fn) }
    },
    subscribeMessages(threadId: string, fn: (list: SupportMessage[]) => void) {
      const set = messageSubs.get(threadId) ?? new Set()
      set.add(fn)
      messageSubs.set(threadId, set)
      fn([...(messages.get(threadId) ?? [])])
      return () => { set.delete(fn) }
    },
    async open(orderId: string | null, text: string) {
      const id = 't' + ++seq
      const now = new Date().toISOString()
      threads = [...threads, {
        id, courierUid: 'demo', courierTg: 1, courierName: 'Komiljon', orderId,
        orderNumber: orderId ? demoOrderById(orderId)?.number ?? null : null, orderDay: now.slice(0, 10),
        status: 'open', createdAt: now, lastAt: now, lastText: '', lastFrom: 'courier',
        unreadAdmin: 0, unreadCourier: 0,
      }]
      push(id, 'courier', text)
      return id
    },
    async send(threadId: string, text: string) {
      push(threadId, 'courier', text)
    },
    async read(threadId: string) {
      threads = threads.map((t) => (t.id === threadId ? { ...t, unreadCourier: 0 } : t))
      emit()
    },
  }
})()
