import { adminDb } from '../firebase-admin.js'
import type { Staff } from '../admin-auth.js'

/**
 * E'lon shablonlari — tez-tez yuboriladigan xabarlar («Dam olish kunlari
 * ishlaymiz», «Yangi set» …). Muharrir holati qanday bo'lsa shunday
 * saqlanadi: matn, ruscha matn, rasm/video va tugmalar (panel ko'rinishida).
 * Kanal va Ommaviy xabar sahifalari bitta ro'yxatdan foydalanadi.
 */

const TARGETS = ['home', 'catalog', 'category', 'section', 'product', 'orders', 'favorites']
const STYLES = ['', 'success', 'primary', 'danger']

const str = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : '')

function readDraftButtons(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 4).map((raw) => {
    const b = (raw ?? {}) as Record<string, unknown>
    return {
      kind: b.kind === 'url' ? 'url' : 'app',
      text: str(b.text, 64),
      textRu: str(b.textRu, 64),
      url: str(b.url, 500),
      target: TARGETS.includes(String(b.target)) ? String(b.target) : 'home',
      value: str(b.value, 200),
      style: STYLES.includes(String(b.style ?? '')) ? String(b.style ?? '') : '',
    }
  })
}

export async function templateSave(actor: Staff, body: Record<string, unknown>) {
  const name = str(body.name, 60).trim()
  if (!name) throw new Error('Shablon nomini yozing')
  const media = body.media && typeof body.media === 'object' ? (body.media as Record<string, unknown>) : null
  const data = {
    name,
    text: str(body.text, 4000),
    textRu: str(body.textRu, 4000),
    bilingual: body.bilingual === true,
    media: media && /^https:\/\/\S+$/i.test(String(media.url)) && (media.type === 'image' || media.type === 'video')
      ? { type: media.type, url: String(media.url) }
      : null,
    buttons: readDraftButtons(body.buttons),
    updatedAt: new Date().toISOString(),
    by: actor.name || actor.email,
  }
  if (!data.text.trim() && !data.textRu.trim() && !data.media) throw new Error('Shablon bo‘sh')

  const db = await adminDb()
  const id = typeof body.id === 'string' && /^[\w-]{1,40}$/.test(body.id) ? body.id : ''
  if (id) await db.collection('post_templates').doc(id).set(data, { merge: true })
  else await db.collection('post_templates').add({ ...data, createdAt: data.updatedAt })
  return templateList()
}

export async function templateList() {
  const snap = await (await adminDb()).collection('post_templates').orderBy('updatedAt', 'desc').limit(50).get()
  return { templates: snap.docs.map((d) => ({ id: d.id, ...d.data() })) }
}

export async function templateDelete(_actor: Staff, body: Record<string, unknown>) {
  const id = typeof body.id === 'string' && /^[\w-]{1,40}$/.test(body.id) ? body.id : ''
  if (!id) throw new Error('Shablon topilmadi')
  await (await adminDb()).collection('post_templates').doc(id).delete()
  return templateList()
}
