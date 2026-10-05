import { adminDb } from '../firebase-admin.js'
import type { Staff } from '../admin-auth.js'
import { campaignStats } from '../campaigns.js'
import { plain, readButtons, readMedia } from './people.js'

/**
 * Ommaviy xabar kampaniyasi — yozuv va tarix.
 *
 * Panel yuborishni boshlashdan oldin `broadcast.start` chaqiradi va
 * kampaniya id'sini oladi; keyingi bo'laklar (`broadcast.send`) shu id
 * bilan ketadi — tugmalar manbani oladi, yuborilganlar soni yoziladi.
 */
export async function broadcastStart(actor: Staff | { name: string; email?: string }, body: Record<string, unknown>) {
  const media = readMedia(body.media)
  const buttons = readButtons(body.buttons)
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const textRu = typeof body.textRu === 'string' ? body.textRu.trim() : ''
  if (!text && !textRu && !media) throw new Error('Xabar matni bo‘sh')

  const ref = await (await adminDb()).collection('broadcasts').add({
    at: new Date().toISOString(),
    by: actor.name || actor.email || '—',
    snippet: plain(text || textRu).slice(0, 160),
    media: media ? { type: media.kind === 'photo' ? 'image' : 'video', url: media.url } : null,
    draft: { text, textRu, buttons },
    buttons: buttons.length,
    audience: typeof body.audience === 'string' ? body.audience.slice(0, 80) : '',
    total: Math.max(0, Math.round(Number(body.total) || 0)),
    channelPostId: typeof body.channelPostId === 'string' ? body.channelPostId.slice(0, 40) : null,
    scheduled: body.scheduled === true,
    sent: 0,
    failed: 0,
    status: 'running',
  })
  return { id: ref.id }
}

/** Oxirgi ommaviy xabarlar va ularning natijasi. */
export async function broadcastHistory() {
  const db = await adminDb()
  const snap = await db.collection('broadcasts').orderBy('at', 'desc').limit(15).get()
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown> & { id: string })
  const stats = await campaignStats(rows.map((r) => `bc_${r.id}`))
  return { rows: rows.map((r) => ({ ...r, stats: stats[`bc_${r.id}`] ?? null })) }
}
