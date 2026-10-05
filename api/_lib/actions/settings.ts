import { adminDb } from '../firebase-admin.js'
import { sendMessage } from '../telegram.js'
import type { Staff } from '../admin-auth.js'
import { WLCM_PROVIDERS, activeProviders, registerWebhook, wlcmConfigured, wlcmMe } from '../wlcm.js'
import { webhookUrl } from './payments.js'

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function num(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0
}

/**
 * WLCM kalitlari ishlayaptimi — imzolangan `me` so'rovi.
 * Kalitlarning o'zi qaytarilmaydi, faqat hamkor nomi va holati.
 */
export async function paymentCheck(actor: Staff) {
  if (actor.role !== 'owner') throw new Error('Faqat ega tekshira oladi')
  if (!wlcmConfigured()) return { ok: false, configured: false, message: 'WLCM kalitlari serverda sozlanmagan' }
  const active = await activeProviders().catch(() => [] as string[])
  const me = (await wlcmMe()) as { id?: number; name?: string; is_active?: boolean } | null
  const base = String(process.env.WLCM_BASE_URL || '')
  return {
    ok: true,
    configured: true,
    sandbox: base.includes('sandbox') || base.includes('apidev'),
    partner: { id: me?.id ?? null, name: me?.name ?? null, active: me?.is_active ?? null },
    activeProviders: active,
    webhookSecret: Boolean(process.env.WLCM_WEBHOOK_SECRET),
  }
}

/**
 * Webhook manzilini WLCM'ga ro'yxatdan o'tkazadi. Imzo siri — WLCM_WEBHOOK_SECRET
 * (serverda); WLCM webhookni shu sir bilan imzolaydi, biz shu bilan tekshiramiz.
 */
export async function paymentWebhook(actor: Staff) {
  if (actor.role !== 'owner') throw new Error('Faqat ega ulay oladi')
  if (!wlcmConfigured()) throw new Error('WLCM kalitlari serverda sozlanmagan')
  const secret = String(process.env.WLCM_WEBHOOK_SECRET || '')
  if (secret.length < 24) throw new Error('WLCM_WEBHOOK_SECRET serverda sozlanmagan (kamida 24 belgi)')
  const url = webhookUrl()
  const hook = await registerWebhook(url, secret)
  return { ok: true, url, id: hook?.id ?? null }
}

/**
 * Sozlamalar `settings/{doc}` hujjatlarida:
 *   payment  — karta raqami va egasi (mini app checkout'da ko'rsatadi)
 *   delivery — yetkazish narxi va bepul chegarasi
 *   courier  — buyurtma kuryerlarga qanday yetkaziladi
 */
export async function settingsSave(actor: Staff, body: Record<string, unknown>) {
  if (actor.role !== 'owner') throw new Error('Faqat ega sozlamalarni o‘zgartira oladi')

  const db = await adminDb()
  const section = text(body.section)

  // Karta orqali to'lov (o'tkazma): mijoz shu kartaga o'tkazib, chek yuklaydi
  if (section === 'payment') {
    const digits = text(body.cardNumber).replace(/\D/g, '')
    const cardOwner = text(body.cardOwner).replace(/\s+/g, ' ').slice(0, 60)
    const transfer = body.transfer !== false
    if (digits.length !== 16) throw new Error('Karta raqami 16 ta raqamdan iborat bo‘lsin')
    if (!cardOwner) throw new Error('Karta egasining ismini kiriting')
    await db.collection('settings').doc('payment').set({
      cardNumber: digits.replace(/(\d{4})(?=\d)/g, '$1 '),
      cardOwner,
      transfer,
      updatedAt: new Date().toISOString(),
    }, { merge: true })
    return { ok: true }
  }

  // Onlayn to'lov (WLCM): yoqish va mijozga ko'rinadigan usullar
  if (section === 'online') {
    const online = body.online === true
    const onlineProviders = (Array.isArray(body.onlineProviders) ? body.onlineProviders : [])
      .map((p) => String(p).toLowerCase())
      .filter((p) => (WLCM_PROVIDERS as readonly string[]).includes(p))
    if (online && !wlcmConfigured()) throw new Error('WLCM kalitlari serverda sozlanmagan — avval ularni kiriting')
    if (online && !onlineProviders.length) throw new Error('Kamida bitta to‘lov usulini tanlang')
    if (online) {
      // WLCM'da o'chiq usulni yoqib bo'lmaydi — mijoz tanlasa to'lov yaratilmasdi
      const active = await activeProviders().catch(() => null)
      const off = active ? onlineProviders.filter((p) => !active.includes(p)) : []
      if (off.length) throw new Error(`Bu usullar hozir WLCM'da faol emas: ${off.join(', ')}`)
    }

    /*
     * Sinov rejimi: onlayn to'lovni faqat ega va adminlar ko'radi (sandbox
     * kalitlari bilan jonli saytda sinash uchun — mijozlar sezmaydi).
     * Ularning Telegram ID'lari shu yerda yig'iladi: mijoz ilovasi staff
     * to'plamini o'qiy olmaydi, sozlama hujjatini esa o'qiydi.
     */
    const onlineTestOnly = body.onlineTestOnly === true
    let onlineTesters: number[] = []
    if (onlineTestOnly) {
      const staff = await db.collection('staff').where('role', 'in', ['owner', 'admin']).get()
      onlineTesters = staff.docs
        .map((doc) => doc.data() as { telegramId?: number; active?: boolean })
        .filter((s) => s.active !== false && Number(s.telegramId) > 0)
        .map((s) => Number(s.telegramId))
      if (online && !onlineTesters.length) throw new Error('Sinov rejimi uchun Telegram ID si bor admin kerak')
    }

    await db.collection('settings').doc('payment').set(
      { online, onlineProviders, onlineTestOnly, onlineTesters },
      { merge: true },
    )
    return { ok: true, testers: onlineTesters.length }
  }

  // Kompaniya rekvizitlari — nakladnoy va marshrut varaqasida chiqadi
  if (section === 'company') {
    const field = (key: string, max: number) => text(body[key]).slice(0, max)
    const inn = field('inn', 20).replace(/\s/g, '')
    const account = field('account', 40).replace(/\s/g, '')
    const mfo = field('mfo', 10).replace(/\s/g, '')
    if (inn && !/^\d{9}$/.test(inn)) throw new Error('STIR 9 ta raqamdan iborat bo‘lsin')
    if (account && !/^\d{20}$/.test(account)) throw new Error('Hisob raqami 20 ta raqamdan iborat bo‘lsin')
    if (mfo && !/^\d{5}$/.test(mfo)) throw new Error('MFO 5 ta raqamdan iborat bo‘lsin')
    await db.collection('settings').doc('company').set({
      legalName: field('legalName', 120),
      inn,
      address: field('address', 200),
      phone: field('phone', 40),
      bank: field('bank', 120),
      account,
      mfo,
      director: field('director', 80),
      updatedAt: new Date().toISOString(),
    }, { merge: true })
    return { ok: true }
  }

  // «Biz bilan aloqa» — mini app «Yordam» sahifasi, bot, chek (src/config/contact.ts)
  if (section === 'contact') {
    const field = (key: string, max: number) => text(body[key]).slice(0, max)
    const phone = field('phone', 40)
    const telegram = field('telegram', 100)
      .replace(/^(https?:\/\/)?(t\.me|telegram\.me)\//i, '')
      .replace(/^@/, '')
      .replace(/[/?#].*$/, '')
    const email = field('email', 120)
    if (!phone) throw new Error('Telefon raqamini kiriting')
    if (phone.replace(/\D/g, '').length < 7) throw new Error('Telefon raqami noto‘g‘ri')
    if (telegram && !/^[A-Za-z][\w]{3,31}$/.test(telegram)) throw new Error('Telegram username noto‘g‘ri (masalan @musa_support)')
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email noto‘g‘ri')
    await db.collection('settings').doc('contact').set({
      phone,
      telegram,
      email,
      address: field('address', 200),
      workHours: field('workHours', 60),
      updatedAt: new Date().toISOString(),
    }, { merge: true })
    return { ok: true }
  }

  if (section === 'delivery') {
    const fee = num(body.fee)
    const freeFrom = num(body.freeFrom)
    // 0 — minimal summa yo'q, buyurtma har qanday summada o'tadi
    const minOrder = num(body.minOrder)
    await db.collection('settings').doc('delivery').set({ fee, freeFrom, minOrder }, { merge: true })
    return { ok: true }
  }

  if (section === 'courier') {
    /*
     * Kanal BITTA: shaxsiy xabar YOKI guruh.
     *
     * Ilgari ikkalasi mustaqil belgilanardi. Ikkalasi yoqilganda kuryer
     * bir buyurtmani ikki marta olardi va har nusxada o'z «Oldim»
     * tugmasi bo'lardi — biri bosilsa, ikkinchisi eskirib qolardi.
     */
    const channel = text(body.channel) === 'group' ? 'group' : 'couriers'
    const groupChatId = text(body.groupChatId) || null

    if (channel === 'group' && !groupChatId) {
      throw new Error('Guruhga yuborish uchun guruh ID si kerak')
    }

    await db.collection('settings').doc('courier').set(
      {
        channel,
        groupChatId,
        notifyAdmins: body.notifyAdmins !== false,
        // Eski maydonlar — mos qolishi uchun
        toCouriers: channel === 'couriers',
        toGroup: channel === 'group',
      },
      { merge: true },
    )
    return { ok: true }
  }

  throw new Error('Noma’lum sozlama bo‘limi')
}

/**
 * Guruh ulanishini tekshiradi — sinov xabari yuboradi.
 *
 * Guruh ID sini qo'lda yozishda xato qilish oson (masalan minus belgisi
 * tushib qoladi), shuning uchun saqlashdan oldin sinab ko'rish kerak.
 */
export async function settingsTestGroup(actor: Staff, body: Record<string, unknown>) {
  if (actor.role !== 'owner') throw new Error('Faqat ega sinovdan o‘tkaza oladi')

  const chatId = text(body.groupChatId)
  if (!chatId) throw new Error('Guruh ID si kerak')

  const result = await sendMessage(
    chatId,
    '✅ <b>MUSA admin panel</b>\n\nGuruh ulandi — yangi buyurtmalar shu yerga tushadi.',
  )
  if (!result.ok) throw new Error(`Yuborib bo‘lmadi: ${result.error}`)
  return { ok: true }
}
