/**
 * Xabar qoralamasi — tugma turlari va tekshiruvlar.
 * Muharrir komponentlari: src/admin/components/PostComposer.tsx.
 */

/** Mini ilovada qayer ochiladi. */
export type Target = 'home' | 'catalog' | 'category' | 'section' | 'product' | 'orders' | 'favorites'
/** Telegram tugma rangi: '' — odatiy. */
export type ButtonColor = '' | 'success' | 'primary' | 'danger'

/** Inline tugma: havola yoki mini ilovaning kerakli joyini ochadi. */
export type ButtonDraft = {
  kind: 'url' | 'app'
  text: string
  textRu: string
  url: string
  target: Target
  /** Kategoriya nomi, bo'lim id'si yoki mahsulot id'si — `target` ga qarab. */
  value: string
  style: ButtonColor
}

export const TARGETS: { key: Target; label: string }[] = [
  { key: 'home', label: 'Bosh sahifa' },
  { key: 'catalog', label: 'Katalog' },
  { key: 'category', label: 'Kategoriya' },
  { key: 'section', label: 'Bo‘lim' },
  { key: 'product', label: 'Mahsulot' },
  { key: 'orders', label: 'Buyurtmalarim' },
  { key: 'favorites', label: 'Sevimlilar' },
]

export const COLORS: { key: ButtonColor; label: string; swatch: string }[] = [
  { key: '', label: 'Odatiy', swatch: '#8e99a4' },
  { key: 'success', label: 'Yashil', swatch: '#2fa84f' },
  { key: 'primary', label: 'Ko‘k', swatch: '#2f80ed' },
  { key: 'danger', label: 'Qizil', swatch: '#e5484d' },
]

/** Serverga ketadigan manzil: api/_lib/actions/people.ts → appQuery. */
function targetOf(b: ButtonDraft): string {
  if (b.target === 'category') return `cat:${b.value}`
  if (b.target === 'section') return `sec:${b.value}`
  if (b.target === 'product') return `product:${b.value}`
  return b.target
}

export const NEW_BUTTON: ButtonDraft = {
  kind: 'app', text: '', textRu: '', url: '', target: 'home', value: '', style: '',
}

/** Telegram izoh chegarasi — uzunroq matn rasmdan keyin alohida xabar bo'lib ketadi. */
export const CAPTION_MAX = 1024
export const MAX_BUTTONS = 4
export const plainLength = (value: string) => value.replace(/<[^>]+>/g, '').length

export function buttonError(b: ButtonDraft): string {
  if (!b.text.trim()) return 'Tugma matnini yozing'
  if (b.kind === 'url') return /^(https?:\/\/|tg:\/\/)\S+$/i.test(b.url.trim()) ? '' : 'Havola https:// bilan boshlansin'
  if (b.target === 'category' && !b.value) return 'Kategoriyani tanlang'
  if (b.target === 'section' && !b.value) return 'Bo‘limni tanlang'
  if (b.target === 'product' && !b.value) return 'Mahsulotni tanlang'
  return ''
}

/** Serverga ketadigan ko'rinish (people.ts → readButtons). */
export function cleanButtons(buttons: ButtonDraft[]) {
  return buttons.map((b) => ({
    kind: b.kind,
    text: b.text.trim(),
    textRu: b.textRu.trim(),
    url: b.url.trim(),
    target: b.kind === 'app' ? targetOf(b) : '',
    style: b.style,
  }))
}

/** Serverdagi tugma (tarix, shablon) → muharrir ko'rinishi (people.ts → appQuery teskarisi). */
export function toButtonDraft(b: {
  kind?: string; text?: string; textRu?: string; url?: string; target?: string; value?: string; style?: string | null
}): ButtonDraft {
  // Shablonda muharrir ko'rinishi (`value` bilan), tarixda server ko'rinishi (`cat:…`)
  const match = /^(cat|sec|product):(.*)$/s.exec(b.target ?? '')
  const map = { cat: 'category', sec: 'section', product: 'product' } as const
  const target = (match ? map[match[1] as keyof typeof map] : b.target || 'home') as Target
  return {
    kind: b.kind === 'url' ? 'url' : 'app',
    text: b.text ?? '',
    textRu: b.textRu ?? '',
    url: b.url ?? '',
    target,
    value: match ? match[2] : (b.value ?? ''),
    style: (b.style ?? '') as ButtonColor,
  }
}

const money = (n: number) => `${Math.round(n).toLocaleString('ru-RU').replace(/\u00a0/g, ' ')} so‘m`
const moneyRu = (n: number) => `${Math.round(n).toLocaleString('ru-RU').replace(/\u00a0/g, ' ')} сум`
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Mahsulotdan tayyor e'lon: rasm, nom, vazn, narx (eski narx yoki aksiya
 * bilan), «Buyurtma berish» tugmasi — aynan shu mahsulot sahifasini ochadi.
 */
export function productDraft(p: {
  id: number; name: string; nameRu?: string; price: number; oldPrice?: number; pack?: number
  images?: string[]; sizes?: string[]; description?: string; descriptionRu?: string
}, promo?: { title: string; percent: number } | null) {
  // O'ram: bazadagi narx DONADA — mijoz qutini oladi (src/lib/firebase.ts bilan bir xil)
  const pack = p.pack && p.pack > 1 ? Math.floor(p.pack) : 1
  const price = p.price * pack
  const oldPrice = p.oldPrice ? p.oldPrice * pack : 0
  const final = promo ? Math.round((price * (100 - promo.percent)) / 100) : price
  const was = promo ? price : oldPrice > price ? oldPrice : 0
  const size = [p.sizes?.[0] ? String(p.sizes[0]) : '', pack > 1 ? `${pack} dona` : ''].filter(Boolean).join(' · ')
  const sizeRu = [p.sizes?.[0] ? String(p.sizes[0]) : '', pack > 1 ? `${pack} шт` : ''].filter(Boolean).join(' · ')
  const short = (v?: string) => {
    const t = (v ?? '').replace(/\s+/g, ' ').trim()
    return t.length > 180 ? t.slice(0, 177) + '…' : t
  }

  const uz = [
    `🆕 <b>${esc(p.name)}</b>`,
    short(p.description) && `\n${esc(short(p.description))}`,
    '',
    size && `⚖️ ${esc(size)}`,
    was
      ? `💰 <s>${money(was)}</s> → <b>${money(final)}</b>${promo ? ` (−${promo.percent}%)` : ''}`
      : `💰 Narxi: <b>${money(final)}</b>`,
    promo && `🔥 ${esc(promo.title)}`,
    '',
    '🛒 Buyurtma berish uchun pastdagi tugmani bosing!',
  ].filter((line): line is string => typeof line === 'string').join('\n').replace(/\n{3,}/g, '\n\n')

  const nameRu = p.nameRu || p.name
  const ru = [
    `🆕 <b>${esc(nameRu)}</b>`,
    short(p.descriptionRu) && `\n${esc(short(p.descriptionRu))}`,
    '',
    sizeRu && `⚖️ ${esc(sizeRu)}`,
    was
      ? `💰 <s>${moneyRu(was)}</s> → <b>${moneyRu(final)}</b>${promo ? ` (−${promo.percent}%)` : ''}`
      : `💰 Цена: <b>${moneyRu(final)}</b>`,
    promo && `🔥 ${esc(promo.title)}`,
    '',
    '🛒 Нажмите кнопку ниже, чтобы заказать!',
  ].filter((line): line is string => typeof line === 'string').join('\n').replace(/\n{3,}/g, '\n\n')

  const image = p.images?.find((src) => /^https:\/\//i.test(src))
    ?? (p.images?.[0] ? new URL(p.images[0], window.location.origin).href : '')
  return {
    text: uz,
    textRu: ru,
    media: image && /^https:\/\//i.test(image) ? { type: 'image' as const, url: image } : null,
    buttons: [{
      kind: 'app', text: '🛒 Buyurtma berish', textRu: '🛒 Заказать', url: '',
      target: 'product', value: String(p.id), style: 'success',
    } satisfies ButtonDraft],
  }
}
