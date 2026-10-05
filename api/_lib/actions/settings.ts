import { adminDb } from '../firebase-admin.js'
import { sendMessage } from '../telegram.js'
import type { Staff } from '../admin-auth.js'

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function num(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0
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
    if (telegram && !/^[A-Za-z][\w]{3,31}$/.test(telegram)) throw new Error('Telegram username noto‘g‘ri (masalan @tradeavenue_support)')
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
    '✅ <b>Trade Avenue admin panel</b>\n\nGuruh ulandi — yangi buyurtmalar shu yerga tushadi.',
  )
  if (!result.ok) throw new Error(`Yuborib bo‘lmadi: ${result.error}`)
  return { ok: true }
}
