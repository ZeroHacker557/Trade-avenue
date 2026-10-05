import { useCallback, useEffect, useRef, useState } from 'react'
import { apiErrorText } from '../utils/api-error'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { ApiError } from '../lib/api'
import type { TranslationKey } from '../i18n'
import { getTelegram, hapticError, hapticSuccess, requestLocation } from '../utils/telegram'
import { DEMO, arriveOrder, deliverOrder, fetchOverview, takeOrder, type CourierOverview } from './api'
import { enqueue, flushQueue, isNetworkError, readQueue } from './offline-queue'
import type { Point } from './route'

/**
 * Zaxira so'rov oralig'i. Asosiy yangilanish — `signals/orders`
 * belgisi (quyida): server har o'zgarishda uni yangilaydi va ro'yxat
 * bir-ikki soniyada keladi. Belgi biror sabab bilan kelmasa ham
 * ro'yxat eskirib qolmasin.
 */
const POLL_MS = 60_000
/**
 * Joylashuv shu oraliqda qayta o'qiladi — kuryer yurib boradi. Smenada
 * u serverga ham ketadi (admin xaritasi, mijoz kuzatuvi).
 */
const LOCATION_MS = 30_000

export type Feedback = { kind: 'success' | 'error'; text: string }

/**
 * Kuryer sahifasining ma'lumoti: ro'yxat, olish va yetkazish.
 *
 * Jonli obuna o'rniga so'rov bilan yangilanadi: kuryer ilovaga Telegram
 * ID si bilan kiradi, Firestore qoidalari esa buyurtmalarni faqat
 * xodim roliga ochadi. Shuning uchun hammasi server (api/courier.ts)
 * orqali, ekran ko'rinib turganda har 15 soniyada va ilovaga
 * qaytilganda.
 */
export function useCourierData(onNotCourier: () => void) {
  const [data, setData] = useState<CourierOverview | null>(null)
  /** Xom xato — matnga ekranda, kuryer tilida aylantiriladi. */
  const [error, setError] = useState<unknown>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  /** Internet bormi — brauzer hodisalari va so'rov natijasidan. */
  const [online, setOnline] = useState(() => navigator.onLine !== false)
  /** Internet kutayotgan amallar (offline-queue.ts). */
  const [queued, setQueued] = useState(() => readQueue().length)
  const notCourier = useRef(onNotCourier)
  useEffect(() => {
    notCourier.current = onNotCourier
  })

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    try {
      // Aloqa bor — avval navbatdagi amallar yuboriladi, keyin ro'yxat
      if (readQueue().length) await flushQueue()
      const next = await fetchOverview()
      setData(next)
      setError(null)
      setOnline(true)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'NOT_COURIER') {
        notCourier.current()
        return
      }
      if (isNetworkError(e)) setOnline(false)
      setError(e)
    } finally {
      if (manual) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    // Birinchi yuklash — effekt ichida sinxron setState chaqirilmasin
    const first = setTimeout(() => void load(), 0)
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    // Internet qaytdi — navbat yuboriladi va ro'yxat yangilanadi
    const onOnline = () => {
      setOnline(true)
      void load()
    }
    const onOffline = () => setOnline(false)
    const onQueue = () => setQueued(readQueue().length)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener('musa:queue', onQueue)
    // Telegram oynasi yig'ilib, qayta ochilganda
    const tg = getTelegram()
    tg?.onEvent?.('activated', onVisible)

    /*
     * Jonli yangilanish: server buyurtma holati o'zgargan har safar
     * `signals/orders` ga vaqt yozadi. Birinchi javob — hozirgi holat,
     * uni o'tkazib yuboramiz (ro'yxat allaqachon so'ralgan). Ketma-ket
     * bir necha o'zgarish bitta so'rovga birlashadi.
     */
    let first_snapshot = true
    let debounce: ReturnType<typeof setTimeout> | undefined
    const stopSignal = DEMO
      ? () => {}
      : onSnapshot(
          doc(db, 'signals', 'orders'),
          () => {
            if (first_snapshot) {
              first_snapshot = false
              return
            }
            clearTimeout(debounce)
            debounce = setTimeout(() => void load(), 400)
          },
          // Qoidalar hali nashr qilinmagan bo'lsa ham ilova so'rov bilan ishlayveradi
          () => {},
        )

    return () => {
      clearTimeout(first)
      clearTimeout(debounce)
      clearInterval(timer)
      stopSignal()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('musa:queue', onQueue)
      tg?.offEvent?.('activated', onVisible)
    }
  }, [load])

  return { data, error, refreshing, busyId, setBusyId, load, online, queued }
}

export type OrderActions = {
  /** `point` — kuryerning joyi: mijozga taxminiy vaqt yoziladi. */
  take: (id: string, point?: Point | null) => Promise<Feedback>
  deliver: (id: string) => Promise<Feedback>
  arrive: (id: string) => Promise<Feedback>
}

/** Olish va yetkazish — natija matni chaqiruvchiga qaytadi (tarjima bilan). */
export function createOrderActions(
  t: (key: TranslationKey, values?: Record<string, string | number>) => string,
  reload: () => Promise<void>,
  setBusyId: (id: string | null) => void,
): OrderActions {
  const run = async (
    id: string,
    call: () => Promise<{ outcome: string; courierName?: string | null }>,
    good: string[],
    /** Muvaffaqiyat matni amalga qarab farq qiladi («Yetib keldim»). */
    doneKey: TranslationKey = 'courier.outcomeDone',
    /** Internet bo'lmasa navbatga olinadigan amal (offline-queue.ts). */
    queueAs?: 'deliver' | 'arrive',
  ): Promise<Feedback> => {
    setBusyId(id)
    try {
      const result = await call()
      const key: Record<string, TranslationKey> = {
        claimed: 'courier.outcomeClaimed',
        already: 'courier.outcomeAlready',
        taken: 'courier.outcomeTaken',
        closed: 'courier.outcomeClosed',
        not_found: 'courier.outcomeNotFound',
        done: doneKey,
        not_yours: 'courier.outcomeNotYours',
      }
      const ok = good.includes(result.outcome)
      if (ok) hapticSuccess()
      else hapticError()
      return {
        kind: ok ? 'success' : 'error',
        text: t(key[result.outcome] || 'courier.outcomeNotFound', {
          who: result.courierName || t('courier.otherCourier'),
        }),
      }
    } catch (e) {
      // Internet yo'q — amal yo'qolmaydi, ulanganda o'zi yuboriladi
      if (queueAs && isNetworkError(e)) {
        enqueue({ kind: queueAs, orderId: id })
        hapticSuccess()
        return { kind: 'success', text: t('courier.queued') }
      }
      hapticError()
      return { kind: 'error', text: apiErrorText(e, t, 'error.courierGeneric') }
    } finally {
      setBusyId(null)
      await reload()
    }
  }

  return {
    take: (id, point) => run(id, () => takeOrder(id, point ?? null), ['claimed', 'already']),
    deliver: (id) => run(id, () => deliverOrder(id), ['done', 'already'], 'courier.outcomeDone', 'deliver'),
    arrive: (id) => run(id, () => arriveOrder(id), ['done', 'already'], 'courier.outcomeArrived', 'arrive'),
  }
}

export type LocationState =
  | { status: 'loading'; point: Point | null }
  | { status: 'ok'; point: Point }
  | { status: 'off'; point: null; openSettings?: () => void }

/**
 * Kuryerning joylashuvi — marshrutning boshlang'ich nuqtasi.
 *
 * Ruxsat bo'lmasa sahifa baribir ishlaydi: tartib eng eski buyurtmadan
 * boshlanadi va tepada «Yoqish» tugmasi turadi.
 */
export function useCourierLocation() {
  const [state, setState] = useState<LocationState>({ status: 'loading', point: null })

  const read = useCallback(async () => {
    const result = await requestLocation()
    if (result.ok) setState({ status: 'ok', point: { lat: result.lat, lng: result.lng } })
    else {
      setState((prev) =>
        // Oldin aniqlangan joy bo'lsa, vaqtinchalik xatoda uni yo'qotmaymiz
        prev.status === 'ok' ? prev : { status: 'off', point: null, openSettings: result.openSettings },
      )
    }
  }, [])

  useEffect(() => {
    const first = setTimeout(() => void read(), 0)
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void read()
    }, LOCATION_MS)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [read])

  const retry = useCallback(() => {
    if (state.status === 'off' && state.openSettings) state.openSettings()
    setState((prev) => ({ status: 'loading', point: prev.point }) as LocationState)
    void read()
  }, [read, state])

  return { location: state, retry }
}
