import { adminDb } from './firebase-admin.js'
import { AWAITING_PAYMENT, miniAppUrl } from './actions/orders.js'

/**
 * Kampaniya (kanal e'loni yoki ommaviy xabar) natijasini o'lchash.
 *
 * Har kampaniyaning manbasi bor: `ch_<e'lon id>` yoki `bc_<xabar id>`.
 *   • «Ilovada ochish» tugmasi ilovani `src=<manba>` bilan ochadi — ilova
 *     buni `/api/track` ga bildiradi (bosish) va 72 soat eslab qoladi:
 *     shu orada berilgan buyurtmaga `source` yoziladi.
 *   • «Havola» tugmasi `/api/track?go=<manba>&b=<tartib>` orqali o'tadi:
 *     bosish sanaladi va asl manzilga yo'naltiriladi. Manzil so'rovdan
 *     emas, bazadagi e'londan olinadi — begona saytga yo'naltirib bo'lmaydi.
 */

export const SOURCE_RE = /^(ch|bc)_[A-Za-z0-9]{3,40}$/

export function isSource(value: unknown): value is string {
  return typeof value === 'string' && SOURCE_RE.test(value)
}

/** Havola tugmasi uchun kuzatiladigan manzil (sayt manzili bo'lmasa — asl havola). */
export function trackedUrl(source: string, index: number, original: string): string {
  const site = miniAppUrl()
  if (!site) return original
  return `${site}/api/track?go=${source}&b=${index}`
}

/** `?go=` — bosishni sanaydi va asl manzilni qaytaradi (yo'q bo'lsa null). */
export async function resolveClick(source: string, index: number): Promise<string | null> {
  if (!isSource(source) || !Number.isInteger(index) || index < 0 || index > 9) return null
  const db = await adminDb()
  const [kind, id] = [source.slice(0, 2), source.slice(3)]
  const snap = await db.collection(kind === 'ch' ? 'channel_posts' : 'broadcasts').doc(id).get()
  const buttons = (snap.data()?.draft?.buttons ?? []) as { kind?: string; url?: string }[]
  const url = buttons[index]?.kind === 'url' ? String(buttons[index].url ?? '') : ''
  if (!/^(https?:\/\/|tg:\/\/)\S+$/i.test(url)) return null
  await bump(source, { clicks: 1, [`buttons.${index}`]: 1 })
  return url
}

/** Ilova kampaniya havolasidan ochildi. */
export async function noteOpen(source: string) {
  if (!isSource(source)) return
  await bump(source, { clicks: 1, opens: 1 })
}

async function bump(source: string, fields: Record<string, number>) {
  const { FieldValue } = await import('firebase-admin/firestore')
  const data: Record<string, unknown> = { source, updatedAt: new Date().toISOString() }
  // `buttons.0` — nuqtali yo'l set(merge) da ishlamaydi, ichki obyekt kerak
  const buttons: Record<string, unknown> = {}
  for (const [key, n] of Object.entries(fields)) {
    if (key.startsWith('buttons.')) buttons[key.slice(8)] = FieldValue.increment(n)
    else data[key] = FieldValue.increment(n)
  }
  if (Object.keys(buttons).length) data.buttons = buttons
  await (await adminDb()).collection('campaign_stats').doc(source).set(data, { merge: true })
}

export type CampaignStats = {
  clicks: number
  opens: number
  buttons: Record<string, number>
  orders: number
  revenue: number
}

const LOST = new Set(['Bekor qilingan', 'Rad etildi', AWAITING_PAYMENT])

/** Bir nechta kampaniyaning bosishlari, buyurtmalari va tushumi. */
export async function campaignStats(sources: string[]): Promise<Record<string, CampaignStats>> {
  const list = [...new Set(sources.filter(isSource))]
  const out: Record<string, CampaignStats> = {}
  if (!list.length) return out
  const db = await adminDb()
  for (const s of list) out[s] = { clicks: 0, opens: 0, buttons: {}, orders: 0, revenue: 0 }

  const snaps = await db.getAll(...list.map((s) => db.collection('campaign_stats').doc(s)))
  for (const snap of snaps) {
    const d = snap.data()
    if (!d) continue
    out[snap.id] = { ...out[snap.id], clicks: Number(d.clicks) || 0, opens: Number(d.opens) || 0, buttons: d.buttons ?? {} }
  }
  // Buyurtmalar — `in` so'rovi 10 tadan
  for (let i = 0; i < list.length; i += 10) {
    const snap = await db.collection('orders').where('source', 'in', list.slice(i, i + 10)).get()
    for (const doc of snap.docs) {
      const o = doc.data()
      if (LOST.has(String(o.status))) continue
      const s = out[String(o.source)]
      if (!s) continue
      s.orders += 1
      s.revenue += Number(o.total) || 0
    }
  }
  return out
}
