import { useEffect, useState } from 'react'
import { getDeliverySettings } from '../lib/firebase'
import type { DeliverySettings } from '../types/domain'

// Sozlama bir marta o'qiladi — savat har ochilganda qayta so'ralmaydi
let cached: Promise<DeliverySettings> | null = null

/** Yetkazish sozlamasi (narx, minimal buyurtma summasi). */
export function useDeliverySettings(): DeliverySettings | null {
  const [settings, setSettings] = useState<DeliverySettings | null>(null)

  useEffect(() => {
    let alive = true
    cached ??= getDeliverySettings()
    cached.then((value) => alive && setSettings(value))
    return () => { alive = false }
  }, [])

  return settings
}
