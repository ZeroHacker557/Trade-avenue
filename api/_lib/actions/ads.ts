import { adminDb } from '../firebase-admin.js'

type Result = Record<string, unknown>

/**
 * Ochilish reklamasi: `ads/splash` — mijoz ilovasi ochilganda butun
 * ekranni egallaydigan 1–5 slayd.
 *
 * ⚠️ O'qish qoidasi mini appda: src/utils/splash-ad.ts (`readSplashAd`).
 * Bu yerdagi cheklovlar o'shanikidan KENG bo'lmasin — aks holda saqlangan
 * slaydni ilova jim tashlab yuboradi va admin nega chiqmayotganini tushunmaydi.
 */

const MAX_SLIDES = 5
const MIN_SECONDS = 3
const MAX_SECONDS = 15
const BUTTON_TEXT = 28

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

function httpUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null
  } catch {
    return null
  }
}

/** Media faqat o'z Storage'imizdan: panel yuklagan fayl, begona sayt emas. */
function isOurMedia(value: string): boolean {
  const url = httpUrl(value)
  return Boolean(url && url.protocol === 'https:' && url.hostname === 'firebasestorage.googleapis.com')
}

function readLink(raw: unknown, slideNo: number) {
  const data = (raw ?? {}) as Record<string, unknown>
  const kind = text(data.kind)
  if (kind === 'url') {
    const url = text(data.url)
    if (!httpUrl(url)) throw new Error(`${slideNo}-slayd: havola https:// bilan boshlanishi kerak`)
    return { kind, url: url.slice(0, 500) }
  }
  if (kind === 'category') {
    const category = text(data.category)
    if (!category) throw new Error(`${slideNo}-slayd: kategoriyani tanlang`)
    return { kind, category: category.slice(0, 120) }
  }
  if (kind === 'section') {
    const sectionId = text(data.sectionId)
    if (!sectionId) throw new Error(`${slideNo}-slayd: bo‘limni tanlang`)
    return { kind, sectionId: sectionId.slice(0, 64) }
  }
  if (kind === 'product') {
    const productId = text(data.productId)
    if (!productId) throw new Error(`${slideNo}-slayd: mahsulotni tanlang`)
    return { kind, productId: productId.slice(0, 64) }
  }
  throw new Error(`${slideNo}-slayd: tugma qayerga olib borishi tanlanmagan`)
}

export async function adSave(body: Record<string, unknown>): Promise<Result> {
  const rawSlides = Array.isArray(body.slides) ? body.slides : []
  if (rawSlides.length > MAX_SLIDES) throw new Error(`Ko‘pi bilan ${MAX_SLIDES} ta slayd`)

  const slides = rawSlides.map((raw, i) => {
    const data = (raw ?? {}) as Record<string, unknown>
    const no = i + 1
    const type = text(data.type)
    if (type !== 'image' && type !== 'video') throw new Error(`${no}-slayd: rasm yoki video bo‘lishi kerak`)
    const url = text(data.url)
    if (!isOurMedia(url)) throw new Error(`${no}-slayd: faylni panel orqali yuklang`)

    const seconds = Math.round(Number(data.seconds))
    const button = (data.button ?? null) as Record<string, unknown> | null
    const buttonText = button ? text(button.text) : ''
    if (buttonText.length > BUTTON_TEXT) throw new Error(`${no}-slayd: tugma matni ${BUTTON_TEXT} belgidan oshmasin`)
    const buttonTextRu = button ? text(button.textRu) : ''
    if (buttonTextRu.length > BUTTON_TEXT) {
      throw new Error(`${no}-slayd: ruscha tugma matni ${BUTTON_TEXT} belgidan oshmasin`)
    }

    return {
      id: text(data.id).slice(0, 40) || `s${Date.now()}${i}`,
      type,
      url,
      seconds: Number.isFinite(seconds) ? Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, seconds)) : 5,
      // Matn bo'sh bo'lsa tugma yo'q — havola ham saqlanmaydi
      button: buttonText
        ? {
            text: buttonText,
            // Bo'sh bo'lsa yozilmaydi — ruscha tilda o'zbekchasi ko'rinadi
            ...(buttonTextRu ? { textRu: buttonTextRu } : {}),
            link: readLink(button?.link, no),
          }
        : null,
    }
  })

  const active = body.active === true
  if (active && slides.length === 0) throw new Error('Reklamani yoqish uchun kamida bitta slayd qo‘shing')

  const frequency = text(body.frequency)
  if (!['always', 'daily', 'once'].includes(frequency)) throw new Error('Qanchalik tez-tez chiqishini tanlang')

  const now = new Date().toISOString()
  await (await adminDb()).collection('ads').doc('splash').set({
    active,
    slides,
    frequency,
    // Har saqlashda yangi — «bir marta» rejimida o'zgargan reklama yana chiqadi
    version: now,
    updatedAt: now,
  })
  return { ok: true, version: now }
}
