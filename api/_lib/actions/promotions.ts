import { adminDb } from '../firebase-admin.js'

type Result = Record<string, unknown>

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

/**
 * Vaqtli aksiya: «Juma 18:00 dan yakshanba 23:59 gacha ichimliklar −20%».
 *
 * Aksiya o'zi yoqiladi va o'zi o'chadi — boshlanish va tugash vaqti
 * bo'yicha. `active` — qo'lda to'xtatib qo'yish uchun (vaqti kelgan
 * bo'lsa ham ishlamaydi).
 */
export async function promotionSave(body: Record<string, unknown>): Promise<Result> {
  const title = text(body.title)
  if (!title) throw new Error('Aksiya nomi kerak')
  if (title.length > 80) throw new Error('Aksiya nomi juda uzun')

  const percent = Math.round(Number(body.percent))
  if (!Number.isFinite(percent) || percent < 1 || percent > 90) throw new Error('Chegirma 1–90% oralig‘ida bo‘lsin')

  const target = text(body.target)
  if (!['all', 'category', 'section', 'products'].includes(target)) throw new Error('Aksiya kimga tegishli — tanlanmagan')
  const targetIds = Array.isArray(body.targetIds) ? body.targetIds.map((v) => String(v).trim()).filter(Boolean) : []
  if (target !== 'all' && !targetIds.length) throw new Error('Kamida bitta kategoriya, bo‘lim yoki mahsulot tanlang')

  const start = Date.parse(text(body.startsAt))
  const end = Date.parse(text(body.endsAt))
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error('Boshlanish va tugash vaqtini kiriting')
  if (end <= start) throw new Error('Tugash vaqti boshlanishdan keyin bo‘lsin')

  const data = {
    title,
    percent,
    target,
    targetIds: target === 'all' ? [] : targetIds.slice(0, 500),
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(end).toISOString(),
    active: body.active !== false,
    // Boshlanganda kanalga / mijozlarga avtomatik e'lon (actions/scheduler.ts)
    announce: readAnnounce(body.announce),
    updatedAt: new Date().toISOString(),
  }

  const db = await adminDb()
  const id = text(body.id)
  if (id) {
    // Boshlanish vaqti kelajakka surilsa — e'lon qaytadan (o'sha paytda) chiqadi
    const extra = start > Date.now() ? { announcedAt: null } : {}
    await db.collection('promotions').doc(id).set({ ...data, ...extra }, { merge: true })
    return { id }
  }
  const ref = await db.collection('promotions').add({ ...data, createdAt: data.updatedAt })
  return { id: ref.id, created: true }
}

function readAnnounce(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const image = text(raw.image)
  const announce = {
    channel: raw.channel === true,
    customers: raw.customers === true,
    image: /^https:\/\/\S+$/i.test(image) ? image : null,
  }
  return announce.channel || announce.customers ? announce : null
}

export async function promotionDelete(body: Record<string, unknown>): Promise<Result> {
  const id = text(body.id)
  if (!id) throw new Error('id kerak')
  await (await adminDb()).collection('promotions').doc(id).delete()
  return { id }
}
