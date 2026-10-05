import { FONTS } from './fonts.js'

/**
 * Kunlik e’lon rasmi: 1–6 ta mahsulot, narxlari bilan, bir xil shablonda.
 *
 * satori — tartib (flexbox) va matnni SVG ga aylantiradi, resvg — PNG ga.
 * Ikkalasi ham og‘ir, shuning uchun faqat rasm kerak bo‘lganda yuklanadi.
 */

export type CardProduct = {
  name: string
  price: number
  oldPrice?: number | null
  /** data: URI (png/jpeg/webp) yoki null — rasm o‘rnida belgi. */
  image: string | null
}

export type CardInput = {
  products: CardProduct[]
  /** Sarlavhaning oq qatori: «BUGUN BUYURTMA BERING —». */
  title: string
  /** Sarlavhaning amber qatori: «ULGURJI NARXLARDA». */
  accent: string
  /** Pastki chap: «@tradeavenue_bot». */
  footer: string
  /** Pastki o‘ng: «Yetkazish 15 000 so‘m». */
  footerNote: string
  /** Yuqori o‘ng: «1-oktabr». */
  dateLabel: string
}

export const CARD_WIDTH = 1080
export const CARD_HEIGHT = 1350

const C = {
  blue: '#1d4ed8',
  blueDeep: '#0f1f4d',
  blueBright: '#2563eb',
  amber: '#fbbf24',
  amberDeep: '#f59e0b',
  ink: '#0f172a',
  muted: '#5b6b82',
  red: '#e8453c',
  white: '#ffffff',
  tile: '#eef1f6',
}

type Style = Record<string, string | number>
type Node = { type: string; props: { style?: Style; children?: unknown; [key: string]: unknown } }

/** Kichik «JSX» — satori oddiy obyektlarni ham qabul qiladi. */
function h(type: string, style: Style, ...children: unknown[]): Node {
  const flat = children.flat().filter((c) => c !== null && c !== undefined && c !== false)
  return { type, props: { style: { display: 'flex', ...style }, children: flat.length === 1 ? flat[0] : flat } }
}

/** 15000 → «15 000». */
export function som(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

/** Brend belgisi: oq plita ustida «TA» — favicon bilan bir xil g'oya. */
function logo(): Node {
  return h(
    'div',
    {
      alignItems: 'center',
      gap: 16,
      height: 84,
      padding: '0 26px 0 14px',
      borderRadius: 24,
      background: C.white,
      boxShadow: '0 10px 24px rgba(0,0,0,0.25)',
    },
    h(
      'div',
      {
        width: 58,
        height: 58,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        background: `linear-gradient(135deg, ${C.blueBright} 0%, #1e3a8a 100%)`,
        fontFamily: 'Archivo Black',
        fontSize: 30,
        color: C.white,
      },
      'TA',
    ),
    h('div', { fontFamily: 'Archivo Black', fontSize: 36, letterSpacing: 0.5, color: C.ink, marginTop: 2 }, 'Trade Avenue'),
  )
}

/** Kartochka o'lchami va yo'nalishi — mahsulotlar soniga qarab (`gridFor`). */
type Slot = {
  w: number
  h: number
  /** v — rasm tepada, h — rasm chapda (keng, past kartochka). */
  dir: 'v' | 'h'
  name: number
  price: number
}

/** Kartochkalar maydoni balandligi (sarlavha va pastki qator oralig'i). */
const GRID_H = 856
const GAP = 24
const FULL_W = CARD_WIDTH - 96

/**
 * 1 — bitta katta; 2–3 — keng gorizontal qatorlar; 4 — 2×2;
 * 5–6 — 3 ustun (5 da pastki qator o'rtada).
 */
export function gridFor(count: number): Slot {
  const two = (GRID_H - GAP) / 2
  if (count <= 1) return { w: FULL_W, h: GRID_H, dir: 'v', name: 46, price: 84 }
  if (count === 2) return { w: FULL_W, h: two, dir: 'h', name: 42, price: 68 }
  if (count === 3) return { w: FULL_W, h: (GRID_H - 2 * GAP) / 3, dir: 'h', name: 34, price: 54 }
  if (count === 4) return { w: (FULL_W - GAP) / 2, h: two, dir: 'v', name: 30, price: 50 }
  return { w: (FULL_W - 2 * GAP) / 3, h: two, dir: 'v', name: 24, price: 40 }
}

function productCard(p: CardProduct, slot: Slot): Node {
  const discount = p.oldPrice && p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0
  const pad = slot.w < 400 ? 16 : 20
  const nameH = Math.ceil(slot.name * 1.22 * 2)
  const small = slot.price * 0.5

  // Rasm maydoni: tepada (v) yoki chapda (h)
  const imgW = slot.dir === 'v' ? slot.w - 2 * pad : Math.min(slot.h - 2 * pad, Math.round(slot.w * 0.42))
  const imgH = slot.dir === 'v' ? slot.h - 2 * pad - 14 - nameH - 12 - slot.price : slot.h - 2 * pad
  const image = h(
    'div',
    { width: imgW, height: imgH, flexShrink: 0, borderRadius: 24, background: C.white, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    p.image
      ? { type: 'img', props: { src: p.image, width: imgW - 20, height: imgH, style: { objectFit: 'contain', width: imgW - 20, height: imgH } } }
      : h('div', { width: Math.min(imgW, imgH) * 0.5, height: Math.min(imgW, imgH) * 0.5, borderRadius: 999, background: C.tile }),
  )
  const name = h(
    'div',
    {
      marginTop: slot.dir === 'v' ? 14 : 0,
      height: nameH,
      fontSize: slot.name,
      fontWeight: 700,
      lineHeight: 1.22,
      color: C.ink,
      overflow: 'hidden',
      // ikki qatorga sig‘masa — «…»
      display: 'block',
      lineClamp: 2,
    },
    p.name,
  )
  const price = h(
    'div',
    { marginTop: slot.dir === 'v' ? 'auto' : 18, alignItems: 'flex-end', flexWrap: 'wrap', gap: 10 },
    h('div', { fontSize: slot.price, fontWeight: 800, color: C.blue, lineHeight: 1 }, som(p.price)),
    h('div', { fontSize: small, fontWeight: 700, color: C.blue, marginBottom: slot.price * 0.08 }, 'so‘m'),
    discount > 0
      ? h('div', { fontSize: small * 0.92, fontWeight: 600, color: C.muted, textDecoration: 'line-through', marginBottom: slot.price * 0.1, marginLeft: 4 }, som(p.oldPrice!))
      : null,
  )
  const badge = discount > 0
    ? h(
        'div',
        { position: 'absolute', top: pad + 12, left: pad + 12, padding: '8px 16px', borderRadius: 999, background: C.red, color: C.white, fontSize: Math.max(22, small), fontWeight: 800 },
        `−${discount}%`,
      )
    : null

  return h(
    'div',
    {
      flexDirection: slot.dir === 'v' ? 'column' : 'row',
      alignItems: slot.dir === 'v' ? 'stretch' : 'center',
      width: slot.w,
      height: slot.h,
      padding: pad,
      borderRadius: 36,
      background: C.white,
      boxShadow: '0 18px 40px rgba(5,12,40,0.3)',
      position: 'relative',
      flexShrink: 0,
    },
    image,
    badge,
    slot.dir === 'v'
      ? [name, price]
      : h('div', { flexDirection: 'column', justifyContent: 'center', marginLeft: 28, flexGrow: 1, flexShrink: 1, minWidth: 0 }, name, price),
  )
}

/** Shablon daraxti — sinovda ham shu ishlatiladi. */
export function cardTree(input: CardInput): Node {
  const items = input.products.slice(0, 6)
  const slot = gridFor(items.length)
  return h(
    'div',
    {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      flexDirection: 'column',
      position: 'relative',
      fontFamily: 'Montserrat',
      padding: '44px 48px 40px',
      background: `linear-gradient(160deg, ${C.blueBright} 0%, ${C.blue} 45%, ${C.blueDeep} 100%)`,
      overflow: 'hidden',
    },
    // Fon: yorug' dog'lar
    h('div', { position: 'absolute', top: -260, right: -200, width: 720, height: 720, borderRadius: 720, background: 'rgba(255,255,255,0.10)' }),
    h('div', { position: 'absolute', bottom: -220, left: -160, width: 520, height: 520, borderRadius: 520, background: 'rgba(251,191,36,0.10)' }),
    // Yuqori qator
    h(
      'div',
      { justifyContent: 'space-between', alignItems: 'center' },
      logo(),
      h(
        'div',
        { padding: '14px 26px', borderRadius: 999, background: 'rgba(255,255,255,0.16)', border: '2px solid rgba(255,255,255,0.35)', color: C.white, fontSize: 30, fontWeight: 700 },
        input.dateLabel,
      ),
    ),
    // Sarlavha
    h(
      'div',
      { flexDirection: 'column', marginTop: 30 },
      h('div', { fontSize: 62, fontWeight: 800, color: C.white, lineHeight: 1.08, letterSpacing: -1 }, input.title.toUpperCase()),
      h('div', { fontSize: 62, fontWeight: 800, color: C.amber, lineHeight: 1.08, letterSpacing: -1, marginTop: 6 }, input.accent.toUpperCase()),
    ),
    // Kartochkalar — soniga qarab joylashadi (gridFor)
    h(
      'div',
      { flexWrap: 'wrap', justifyContent: 'center', rowGap: GAP, columnGap: GAP, marginTop: 32, height: GRID_H },
      ...items.map((p) => productCard(p, slot)),
    ),
    // Pastki qator
    h(
      'div',
      {
        marginTop: 'auto',
        height: 86,
        padding: '0 34px',
        borderRadius: 28,
        background: C.white,
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 14px 30px rgba(5,12,40,0.25)',
      },
      h('div', { fontSize: 36, fontWeight: 800, color: C.ink }, input.footer),
      h('div', { fontSize: 28, fontWeight: 800, color: C.blue }, input.footerNote),
    ),
  )
}

let fontCache: { name: string; data: Buffer; weight: 400 | 600 | 700 | 800; style: 'normal' }[] | null = null

/** PNG rasm. */
export async function renderCard(input: CardInput): Promise<Buffer> {
  const [{ default: satori }, { Resvg }] = await Promise.all([import('satori'), import('@resvg/resvg-js')])
  fontCache ??= FONTS.map((f) => ({ name: f.name, weight: f.weight, style: 'normal' as const, data: Buffer.from(f.data, 'base64') }))
  const svg = await satori(cardTree(input) as never, { width: CARD_WIDTH, height: CARD_HEIGHT, fonts: fontCache })
  return new Resvg(svg, { fitTo: { mode: 'width', value: CARD_WIDTH } }).render().asPng()
}

/** Rasm manzilini data: URI ga aylantiradi (satori tashqi rasmni o‘zi yuklamaydi). */
export async function imageData(url: string | null | undefined, timeoutMs = 8000): Promise<string | null> {
  if (!url || !/^https:\/\//i.test(url)) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return null
    const type = (res.headers.get('content-type') || '').split(';')[0].trim()
    const buf = Buffer.from(await res.arrayBuffer())
    const mime = /^image\/(png|jpeg|webp|gif)$/.test(type) ? type : sniff(buf)
    return mime ? `data:${mime};base64,${buf.toString('base64')}` : null
  } catch {
    return null
  }
}

function sniff(buf: Buffer): string | null {
  if (buf.subarray(0, 4).toString('hex') === '89504e47') return 'image/png'
  if (buf.subarray(0, 3).toString('hex') === 'ffd8ff') return 'image/jpeg'
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp'
  return null
}
