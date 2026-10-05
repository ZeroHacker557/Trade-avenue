import { createHmac, timingSafeEqual } from 'node:crypto'

export type TelegramUser = {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
  photo_url?: string
}

/** initData necha soatdan keyin eskirgan hisoblanadi. */
const MAX_AGE_SECONDS = 24 * 60 * 60

/**
 * Telegram WebApp initData imzosini tekshiradi.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Imzo bot tokeni bilan yasaladi — ya'ni tokenni bilgan odam istalgan
 * foydalanuvchi nomidan haqiqiy initData yasay oladi. Shuning uchun token
 * hech qachon mijoz tomoniga tushmasligi va sizib chiqmasligi shart.
 *
 * Xato bo'lsa Error tashlaydi, muvaffaqiyatda foydalanuvchini qaytaradi.
 */
export function verifyInitData(initData: string, botToken: string): TelegramUser {
  if (!initData) throw new Error('initData bo\u2018sh')
  if (!botToken) throw new Error('BOT_TOKEN sozlanmagan')

  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) throw new Error('initData ichida hash yo\u2018q')

  // hash maydonining o'zi tekshiruvga kirmaydi
  params.delete('hash')

  // Qolgan maydonlar kalit bo'yicha alifbo tartibida "key=value" qatorlari
  const dataCheckString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n')

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const computed = createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

  const a = Buffer.from(computed, 'hex')
  const b = Buffer.from(hash, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('initData imzosi noto\u2018g\u2018ri')
  }

  // Qayta ishlatishdan himoya: eski initData qabul qilinmaydi
  const authDate = Number(params.get('auth_date') || 0)
  if (!authDate) throw new Error('auth_date yo\u2018q')
  const age = Math.floor(Date.now() / 1000) - authDate
  if (age > MAX_AGE_SECONDS) throw new Error('initData muddati o\u2018tgan')

  const rawUser = params.get('user')
  if (!rawUser) throw new Error('initData ichida foydalanuvchi yo\u2018q')

  const user = JSON.parse(rawUser) as TelegramUser
  if (!user?.id) throw new Error('foydalanuvchi id\u2018si yo\u2018q')

  return user
}
