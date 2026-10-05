import { apiPost } from './api'
import { launchParams } from '../utils/launch'

/**
 * Kanal e'loni yoki ommaviy xabardan kelgan mijoz.
 *
 * Tugma ilovani `src=ch_…` / `src=bc_…` bilan ochadi: bosish serverga
 * bildiriladi va manba 72 soat eslab qolinadi — shu orada berilgan
 * buyurtma o'sha e'longa yoziladi (admin panelda «buyurtmalar / tushum»).
 * Server: api/_lib/campaigns.ts.
 */
const KEY = 'musa_campaign'
const TTL = 72 * 60 * 60 * 1000
const SOURCE_RE = /^(ch|bc)_[A-Za-z0-9]{3,40}$/

let captured = false

export function captureCampaign() {
  if (captured) return
  captured = true
  const source = launchParams().get('src')
  if (!source || !SOURCE_RE.test(source)) return
  try {
    localStorage.setItem(KEY, JSON.stringify({ source, at: Date.now() }))
  } catch {
    // Xotira yopiq — buyurtmaga bog'lanmaydi, bosish baribir sanaladi
  }
  apiPost('/api/track', { event: 'campaign_open', source }).catch(() => {
    // Analitika xaridga xalaqit bermasin
  })
}

/** Buyurtma uchun: oxirgi 72 soatdagi manba. */
export function currentCampaign(): string | undefined {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null') as { source?: string; at?: number } | null
    if (!raw?.source || !SOURCE_RE.test(raw.source) || !raw.at || Date.now() - raw.at > TTL) return undefined
    return raw.source
  } catch {
    return undefined
  }
}
