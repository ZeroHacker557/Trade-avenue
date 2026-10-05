/**
 * Trade Avenue brend va kompaniya ma'lumotlari — bitta manba.
 *
 * Bot username, domen va aloqa raqamlari shu yerda turadi; ilovaning
 * qolgan qismi faqat shu konstantalarga murojaat qiladi. Yangi bot
 * tokeni / domen kelganda o'zgartiriladigan yagona fayl (bot tomonida
 * esa bot/config.py).
 *
 * ⚠️ Aloqa qiymatlari — vaqtinchalik. Amaldagisi admin panel →
 * Sozlamalar → «Biz bilan aloqa» dan keladi (src/config/contact.ts).
 */
export const BRAND = {
  name: 'Trade Avenue',
  legalName: 'Trade Avenue',
  tagline: 'Do‘konlar uchun ulgurji savdo',
  taglineRu: 'Оптовые закупки для магазинов',

  /** Telegram bot — mini app shu bot ichida ochiladi. TODO: haqiqiy username. */
  botUsername: 'tradeavenue_bot',

  /** Mijozlar xizmati — standart; amaldagisi admin panelda (src/config/contact.ts). */
  phone: '+998 00 000 00 00',
  phoneHref: 'tel:+998000000000',
  email: 'info@tradeavenue.uz',
  telegram: '@tradeavenue_support',
  telegramHref: 'https://t.me/tradeavenue_support',

  /** Ish vaqti va manzil — bot javoblarida ham ishlatiladi. */
  city: "Toshkent, O'zbekiston",
  workHours: '09:00 — 18:00',
} as const

export const BOT_URL = `https://t.me/${BRAND.botUsername}`
