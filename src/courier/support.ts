import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../lib/firebase'
import { apiPost } from '../lib/api'
import {
  readMessage, readThread, type SupportMessage, type SupportThread,
} from '../types/support'
import { DEMO } from './api'

/** Faqat `vite dev` + `?courierDemo`: xotiradagi chat. Production'ga kirmaydi. */
const loadDemo = () =>
  // `import.meta.env.DEV` build paytida `false` ga aylanadi — fayl bundlega kirmaydi
  import.meta.env.DEV
    ? import('./support-demo').then((m) => m.demo)
    : Promise.reject(new Error('Demo faqat dev rejimida'))

/** Dinamik yuklanadigan obuna — effekt tozalanganda ham to'g'ri uziladi. */
function demoSubscribe(start: (demo: Awaited<ReturnType<typeof loadDemo>>) => () => void) {
  let stop: (() => void) | null = null
  let cancelled = false
  void loadDemo().then((demo) => {
    if (!cancelled) stop = start(demo)
  })
  return () => {
    cancelled = true
    stop?.()
  }
}

/*
 * Kuryerning qo'llab-quvvatlash chati — mini app tomoni.
 *
 * O'qish JONLI: Firestore obunasi (qoidalar kuryerga faqat o'z
 * murojaatlarini beradi). Yozish — /api/courier orqali: server
 * adminlarga Telegram xabarini ham yuboradi.
 */

/** Kuryerning murojaatlari — oxirgi yozilgani birinchi. */
export function useMyThreads(telegramId: number | null) {
  const [threads, setThreads] = useState<SupportThread[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (DEMO) return demoSubscribe((demo) => demo.subscribeThreads((list) => {
      setThreads(list)
      setReady(true)
    }))
    if (!telegramId) return
    // Faqat `where` — `orderBy` bilan birga kompozit indeks kerak bo'lardi
    return onSnapshot(
      query(collection(db, 'support_threads'), where('courierTg', '==', telegramId)),
      (snap) => {
        const list = snap.docs.map((d) => readThread(d.id, d.data()))
        list.sort((a, b) => b.lastAt.localeCompare(a.lastAt))
        setThreads(list)
        setReady(true)
      },
      () => setReady(true),
    )
  }, [telegramId])

  return { threads, ready }
}

export function useThreadMessages(threadId: string | null) {
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!threadId) return
    if (DEMO) return demoSubscribe((demo) => demo.subscribeMessages(threadId, (list) => {
      setMessages(list)
      setReady(true)
    }))
    return onSnapshot(
      query(collection(db, 'support_threads', threadId, 'messages'), orderBy('at')),
      (snap) => {
        setMessages(snap.docs.map((d) => readMessage(d.id, d.data())))
        setReady(true)
      },
      () => setReady(true),
    )
  }, [threadId])

  return { messages, ready: ready && threadId !== null }
}

export async function openThread(orderId: string | null, text: string): Promise<string> {
  if (DEMO) return (await loadDemo()).open(orderId, text)
  const result = await apiPost<{ threadId: string }>('/api/courier', { action: 'support.open', orderId, text })
  return result.threadId
}

export async function sendSupport(threadId: string, text: string): Promise<void> {
  if (DEMO) return (await loadDemo()).send(threadId, text)
  await apiPost('/api/courier', { action: 'support.send', threadId, text })
}

export async function markSupportRead(threadId: string): Promise<void> {
  if (DEMO) return (await loadDemo()).read(threadId)
  await apiPost('/api/courier', { action: 'support.read', threadId }).catch(() => {})
}
