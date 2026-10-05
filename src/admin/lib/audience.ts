import { useMemo, useState } from 'react'
import { apiPost } from './api'
import { useCustomers, useOrders, type CustomerRow } from './live'
import type { UploadedAdMedia } from './storage'

/**
 * Kimga yuboriladi.
 *
 * Qabul qiluvchilar ro'yxati shu yerda — admin panelda — hisoblanadi:
 * mijozlar va buyurtmalar allaqachon jonli yuklangan, shuning uchun
 * «nechta odamga boradi» yuborishdan OLDIN aniq ko'rinadi. Serverga
 * tayyor identifikatorlar bo'laklab ketadi, server esa ular bazada
 * borligini tekshiradi.
 */
export type Audience = 'all' | 'buyers' | 'never' | 'category' | 'product' | 'lapsed' | 'active' | 'manual'

export const AUDIENCES: { key: Audience; label: string; hint: string }[] = [
  { key: 'all', label: 'Hamma', hint: 'Botni ishga tushirgan barcha foydalanuvchilar' },
  { key: 'buyers', label: 'Xarid qilganlar', hint: 'Kamida bitta buyurtma bergan mijozlar' },
  { key: 'never', label: 'Hali xarid qilmaganlar', hint: 'Botga kirgan, lekin buyurtma bermaganlar — birinchi xaridga undash uchun' },
  { key: 'category', label: 'Kategoriya bo‘yicha', hint: 'Tanlangan kategoriyadan xarid qilganlar' },
  { key: 'product', label: 'Mahsulot bo‘yicha', hint: 'Aniq mahsulotni olganlar — masalan yangi ta’mi chiqqanda' },
  { key: 'lapsed', label: 'Uzoq vaqt buyurtma bermaganlar', hint: 'Avval olgan, lekin so‘nggi kunlarda qaytmaganlar — «sizni sog‘indik»' },
  { key: 'active', label: 'Yaqinda ilovaga kirganlar', hint: 'So‘nggi kunlarda ilovani ochganlar' },
  { key: 'manual', label: 'Qo‘lda tanlash', hint: 'Ro‘yxatdan kerakli mijozlarni belgilang' },
]

const DAY = 24 * 60 * 60 * 1000
export const displayName = (c: CustomerRow) =>
  [c.first_name, c.last_name].filter(Boolean).join(' ') || (c.username ? `@${c.username}` : `ID ${c.id}`)

/** Auditoriya holati va hisoblangan qabul qiluvchilar. */
export function useAudience() {
  const { customers } = useCustomers()
  // Auditoriya (kim qachon xarid qilgan) — butun tarix
  const { orders } = useOrders(undefined, 'all')

  const [audience, setAudience] = useState<Audience>('all')
  const [pickedCategories, setPickedCategories] = useState<string[]>([])
  const [pickedProducts, setPickedProducts] = useState<string[]>([])
  const [manual, setManual] = useState<string[]>([])
  const [days, setDays] = useState('30')
  // «Necha kun» hisobi uchun sahifa ochilgan vaqt — sahifada kun almashishi muhim emas
  const [now] = useState(() => Date.now())

  // Mijoz → uning (bekor qilinmagan) buyurtmalari
  const history = useMemo(() => {
    const map = new Map<string, { last: number; categories: Set<string>; products: Set<string> }>()
    for (const o of orders) {
      if (o.status === 'Bekor qilingan' || o.status === 'Rad etildi' || !o.userId) continue
      const key = String(o.userId)
      const entry = map.get(key) ?? { last: 0, categories: new Set(), products: new Set() }
      entry.last = Math.max(entry.last, Date.parse(String(o.createdAt)) || 0)
      for (const item of o.products || []) {
        if (item.product?.category) entry.categories.add(item.product.category)
        if (item.product?.id !== undefined) entry.products.add(String(item.product.id))
      }
      map.set(key, entry)
    }
    return map
  }, [orders])

  const recipients = useMemo(() => {
    const period = Math.max(1, Number(days) || 30) * DAY
    return customers.filter((c) => {
      const h = history.get(c.id)
      switch (audience) {
        case 'buyers': return Boolean(h)
        case 'never': return !h
        case 'category': return Boolean(h) && pickedCategories.some((name) => h!.categories.has(name))
        case 'product': return Boolean(h) && pickedProducts.some((id) => h!.products.has(id))
        case 'lapsed': return Boolean(h) && now - h!.last > period
        case 'active': return (Date.parse(String(c.lastActive || '')) || 0) > now - period
        case 'manual': return manual.includes(c.id)
        default: return true
      }
    })
  }, [customers, history, audience, pickedCategories, pickedProducts, manual, days, now])

  const audienceLabel = AUDIENCES.find((a) => a.key === audience)?.label ?? ''

  return {
    customers, history, recipients, audienceLabel,
    audience, setAudience,
    pickedCategories, setPickedCategories,
    pickedProducts, setPickedProducts,
    manual, setManual,
    days, setDays,
  }
}

export type AudienceState = ReturnType<typeof useAudience>

export type Progress = { sent: number; failed: number; skipped: number; processed: number }
const CHUNK = 25

/**
 * Botda mijozlarga bo'laklab yuboradi (api/_lib/actions/people.ts → broadcast).
 * Birinchi bo'lakdan keyin Telegram fayl id'sini qaytaradi — qolganlariga
 * shu ketadi, fayl qayta yuklanmaydi.
 */
export async function sendToCustomers(
  payload: { text: string; textRu: string; media: UploadedAdMedia | null; buttons: unknown[]; campaignId?: string },
  ids: string[],
  onProgress: (progress: Progress) => void,
  isCancelled: () => boolean,
): Promise<Progress> {
  const totals: Progress = { sent: 0, failed: 0, skipped: 0, processed: 0 }
  onProgress({ ...totals })
  let mediaId: string | null = null
  for (let i = 0; i < ids.length && !isCancelled(); i += CHUNK) {
    const result: Progress & { mediaId?: string | null } = await apiPost('action', {
      action: 'broadcast.send',
      text: payload.text,
      textRu: payload.textRu,
      media: payload.media ? { ...payload.media, fileId: mediaId } : null,
      buttons: payload.buttons,
      recipients: ids.slice(i, i + CHUNK),
      // Kampaniya: tugmalar manbani oladi, yuborilganlar soni yoziladi
      campaignId: payload.campaignId,
      last: i + CHUNK >= ids.length,
    })
    mediaId = result.mediaId ?? mediaId
    totals.sent += result.sent
    totals.failed += result.failed
    totals.skipped += result.skipped
    totals.processed += result.processed
    onProgress({ ...totals })
  }
  return totals
}
