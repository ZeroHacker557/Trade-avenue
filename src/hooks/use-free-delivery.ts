import { useEffect, useState } from 'react'
import { getDeliverySettings } from '../lib/firebase'
import { useT } from '../i18n'
import type { FreeDeliveryText } from '../components/cart/FreeDeliveryBar'
import type { DeliverySettings } from '../types/domain'

// Sozlama bir marta o'qiladi — savat har ochilganda qayta so'ralmaydi
let cached: Promise<DeliverySettings> | null = null

/** Yetkazish sozlamasi va «bepul yetkazishgacha» matnlari — joriy tilda. */
export function useFreeDelivery() {
  const t = useT()
  const [settings, setSettings] = useState<DeliverySettings | null>(null)

  useEffect(() => {
    let alive = true
    cached ??= getDeliverySettings()
    cached.then((value) => alive && setSettings(value))
    return () => { alive = false }
  }, [])

  const text: FreeDeliveryText = {
    remaining: [t('cart.freeLeft'), t('cart.freeLeftAfter')],
    reached: t('cart.freeReached'),
    saved: (amount) => t('cart.freeSaved', { amount }),
    goal: (amount) => t('cart.freeGoal', { amount }),
    fee: (amount) => t('cart.deliveryFee', { amount }),
  }
  return { settings, text }
}
