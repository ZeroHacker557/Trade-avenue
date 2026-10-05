import { ApiError } from '../lib/api'
import { arriveOrder, deliverOrder } from './api'

/**
 * Internet uzilganda amallar navbati.
 *
 * Kuryer yerto'lada yoki liftda «Yetkazdim» / «Yetib keldim» bossa,
 * amal yo'qolmaydi: telefon xotirasiga yoziladi va internet qaytishi
 * bilan o'zi yuboriladi. Ikkala amal ham serverda takror bosilsa zarar
 * qilmaydi («already» qaytadi).
 *
 * «Olaman» navbatga QO'YILMAYDI: buyurtmani birinchi olgan kuryer oladi,
 * kechikib yuborilgan so'rov boshqa kuryerni chalg'itardi.
 */

export type QueuedAction = { kind: 'deliver' | 'arrive'; orderId: string; at: string }

const KEY = 'musa:courier-queue'

export function readQueue(): QueuedAction[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]') as QueuedAction[]
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function writeQueue(list: QueuedAction[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // Xotira yopiq — navbat faqat shu seansda
  }
  window.dispatchEvent(new Event('musa:queue'))
}

export function enqueue(action: Omit<QueuedAction, 'at'>) {
  const list = readQueue().filter((a) => !(a.kind === action.kind && a.orderId === action.orderId))
  writeQueue([...list, { ...action, at: new Date().toISOString() }])
}

/** Tarmoq xatosimi (server javob bermadi) — faqat shunda navbatga olinadi. */
export function isNetworkError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 0
}

let flushing = false

/**
 * Navbatni yuboradi. Qaytaradi: nechtasi yuborildi. Tarmoq yana uzilsa —
 * qolganlari keyingi safarga qoladi.
 */
export async function flushQueue(): Promise<number> {
  if (flushing) return 0
  flushing = true
  let sent = 0
  try {
    for (const action of readQueue()) {
      try {
        if (action.kind === 'deliver') await deliverOrder(action.orderId)
        else await arriveOrder(action.orderId)
      } catch (error) {
        // Internet hali yo'q — keyinroq; boshqa xato (masalan buyurtma bekor
        // qilingan) — qayta urinishdan foyda yo'q, navbatdan olinadi
        if (isNetworkError(error)) break
      }
      writeQueue(readQueue().filter((a) => !(a.kind === action.kind && a.orderId === action.orderId)))
      sent++
    }
  } finally {
    flushing = false
  }
  return sent
}
