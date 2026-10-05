import { useCallback, useSyncExternalStore } from 'react'

/**
 * Admin panel uchun UMUMIY Firestore obunalari.
 *
 * Ilgari har sahifa o'z obunasini ochib, chiqishda yopardi: sahifadan
 * sahifaga o'tish butun to'plamni (mahsulotlar, mijozlar, buyurtmalar)
 * serverdan qayta o'qish — har biri pulli o'qish — degani edi.
 *
 * Endi bir xil kalitli obuna bitta: hamma sahifa shuni ishlatadi,
 * oxirgi foydalanuvchi ketgach ham `KEEP_MS` ochiq turadi — qaytib
 * kelganda qayta o'qilmaydi, ma'lumot ham darhol ko'rinadi.
 */

const KEEP_MS = 5 * 60_000

export type SharedState<T> = { value: T; loading: boolean; error: unknown }
type Start<T> = (emit: (value: T) => void, fail: (error: unknown) => void) => () => void

type Entry<T> = {
  state: SharedState<T>
  subs: Set<() => void>
  stop: (() => void) | null
  timer: ReturnType<typeof setTimeout> | null
  start: Start<T>
}

const entries = new Map<string, Entry<unknown>>()

function entryFor<T>(key: string, initial: T, start: Start<T>): Entry<T> {
  let entry = entries.get(key) as Entry<T> | undefined
  if (!entry) {
    entry = { state: { value: initial, loading: true, error: null }, subs: new Set(), stop: null, timer: null, start }
    entries.set(key, entry as Entry<unknown>)
  }
  return entry
}

function notify(entry: Entry<unknown>) {
  for (const cb of entry.subs) cb()
}

/**
 * `key` — obunaning noyob nomi (parametrlari bilan). `null` — o'chiq:
 * hech narsa o'qilmaydi, `initial` qaytadi.
 */
export function useSharedSnapshot<T>(key: string | null, initial: T, start: Start<T>): SharedState<T> {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (!key) return () => {}
      const entry = entryFor(key, initial, start)
      entry.subs.add(cb)
      if (entry.timer) {
        clearTimeout(entry.timer)
        entry.timer = null
      }
      if (!entry.stop) {
        entry.stop = entry.start(
          (value) => {
            entry.state = { value, loading: false, error: null }
            notify(entry as Entry<unknown>)
          },
          (error) => {
            entry.state = { ...entry.state, loading: false, error }
            notify(entry as Entry<unknown>)
          },
        )
      }
      return () => {
        entry.subs.delete(cb)
        if (entry.subs.size === 0 && !entry.timer) {
          // Darhol yopilmaydi — boshqa sahifaga o'tib qaytilsa qayta o'qilmasin
          entry.timer = setTimeout(() => {
            entry.timer = null
            if (entry.subs.size === 0 && entry.stop) {
              entry.stop()
              entry.stop = null
            }
          }, KEEP_MS)
        }
      }
    },
    // `initial` va `start` kalit bilan birga o'zgarmaydi — faqat kalit muhim
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  )

  const getSnapshot = useCallback(
    () => (key ? (entryFor(key, initial, start).state as SharedState<T>) : disabledState(initial)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  )

  return useSyncExternalStore(subscribe, getSnapshot)
}

const disabled = new WeakMap<object, SharedState<unknown>>()
/** O'chiq obuna uchun barqaror holat (har renderda yangi obyekt bo'lmasin). */
function disabledState<T>(initial: T): SharedState<T> {
  if (typeof initial === 'object' && initial !== null) {
    let s = disabled.get(initial as object)
    if (!s) {
      s = { value: initial, loading: false, error: null }
      disabled.set(initial as object, s)
    }
    return s as SharedState<T>
  }
  return { value: initial, loading: false, error: null }
}
