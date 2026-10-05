import { useEffect, useSyncExternalStore } from 'react'

/**
 * Joriy sahifa nomi — to'liq ekrandagi tepa panel (TopBar) uchun.
 *
 * Har sahifa nomini `PageTitle` orqali e'lon qiladi, panel esa shu
 * yerdan o'qiydi. Sahifalar ro'yxatini alohida yuritmaslik uchun shunday:
 * nom qadam bo'yicha o'zgarsa ham (masalan «Yangi manzil»), panel o'zi
 * yangilanadi. Nom yo'q (bosh sahifa) — panelda brend chiqadi.
 */

let current: string | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useTopTitle(): string | null {
  return useSyncExternalStore(subscribe, () => current)
}

export function usePublishTitle(title: string) {
  useEffect(() => {
    current = title
    emit()
    return () => {
      // Sahifa almashganda yangi sahifa nomini allaqachon yozgan bo'lishi mumkin
      if (current === title) {
        current = null
        emit()
      }
    }
  }, [title])
}
