import type { Category, Section } from '../../types/domain'
import type { ProductRow } from './live'
import type { SheetSpec } from './xlsx'

/**
 * Mahsulotlarni Excel orqali tahrirlash.
 *
 * Yuklab olingan faylda har mahsulot bitta qator. Admin kerakli
 * kataklarni o'zgartirib qayta yuklaydi — ID bo'yicha solishtiriladi va
 * FAQAT o'zgargan maydonlar yuboriladi. Rasmlar faylda yo'q va hech
 * qachon o'zgarmaydi.
 *
 * Ustunlar sarlavhasi bo'yicha topiladi, tartibi emas: admin ustunlarni
 * surib qo'ysa ham fayl to'g'ri o'qiladi.
 */

export type Field =
  | 'name' | 'nameRu' | 'nameEn'
  | 'description' | 'descriptionRu' | 'descriptionEn'
  | 'price' | 'oldPrice' | 'category' | 'section' | 'stock' | 'sizes' | 'color' | 'discount' | 'popular'

type Column = { key: Field | 'id' | 'images'; header: string; width: number; kind: 'text' | 'money' | 'number' }

export const COLUMNS: Column[] = [
  { key: 'id', header: 'ID', width: 10, kind: 'text' },
  { key: 'name', header: 'Nomi (o‘zbekcha)', width: 34, kind: 'text' },
  { key: 'nameRu', header: 'Nomi (ruscha)', width: 30, kind: 'text' },
  { key: 'nameEn', header: 'Nomi (inglizcha)', width: 30, kind: 'text' },
  { key: 'price', header: 'Narxi (so‘m)', width: 13, kind: 'money' },
  { key: 'oldPrice', header: 'Eski narxi (so‘m)', width: 15, kind: 'money' },
  { key: 'category', header: 'Kategoriya', width: 24, kind: 'text' },
  { key: 'section', header: 'Bo‘lim', width: 22, kind: 'text' },
  { key: 'stock', header: 'Qoldiq', width: 9, kind: 'number' },
  { key: 'sizes', header: 'Vazni', width: 16, kind: 'text' },
  { key: 'color', header: 'Turi', width: 16, kind: 'text' },
  { key: 'discount', header: 'Chegirma nishoni', width: 15, kind: 'text' },
  { key: 'popular', header: 'Mashhur (ha / yo‘q)', width: 16, kind: 'text' },
  { key: 'description', header: 'Tavsif (o‘zbekcha)', width: 48, kind: 'text' },
  { key: 'descriptionRu', header: 'Tavsif (ruscha)', width: 48, kind: 'text' },
  { key: 'descriptionEn', header: 'Tavsif (inglizcha)', width: 48, kind: 'text' },
  { key: 'images', header: 'Rasmlar soni (o‘zgarmaydi)', width: 16, kind: 'number' },
]

export const FIELD_LABEL: Record<Field, string> = Object.fromEntries(
  COLUMNS.filter((c) => c.key !== 'id' && c.key !== 'images').map((c) => [c.key, c.header]),
) as Record<Field, string>

/** Excel'dan kelgan sarlavhani solishtirish uchun: apostrof, bo'shliq va registrsiz. */
const normalize = (s: string) => s.toLowerCase().replace(/[‘’ʻʼ`'"]/g, '').replace(/\s+/g, ' ').trim()

export function exportSheets(products: ProductRow[], sections: Section[], categories: Category[]): SheetSpec[] {
  const sectionName = new Map(sections.map((s) => [s.id, s.name]))
  const rows = [...products]
    .sort((a, b) => a.category.localeCompare(b.category) || (a.order ?? 1e9) - (b.order ?? 1e9))
    .map((p) =>
      COLUMNS.map((col) => {
        switch (col.key) {
          case 'id': return p.docId
          case 'price': return Number(p.price) || 0
          case 'oldPrice': return p.oldPrice ? Number(p.oldPrice) : ''
          case 'stock': return typeof p.stock === 'number' ? p.stock : ''
          case 'section': return p.sectionId ? sectionName.get(p.sectionId) ?? '' : ''
          case 'sizes': return (p.sizes || []).join(', ')
          case 'images': return (p.images || []).length
          case 'popular': return p.popular ? 'ha' : 'yo‘q'
          default: return String((p as Record<string, unknown>)[col.key] ?? '')
        }
      }),
    )

  const today = new Date().toLocaleDateString('ru-RU')
  return [
    {
      name: 'Mahsulotlar',
      headers: COLUMNS.map((c) => c.header),
      widths: COLUMNS.map((c) => c.width),
      styles: COLUMNS.map((c) => (c.kind === 'money' ? 'money' : c.kind === 'number' ? 'number' : 'text')),
      rows,
    },
    {
      name: 'Qo‘llanma',
      headers: ['Qanday ishlatiladi'],
      widths: [100],
      title: ['MUSA — mahsulotlarni Excel orqali tahrirlash', `Yuklab olingan sana: ${today}`],
      rows: [
        ['1. «Mahsulotlar» varag‘ida kerakli kataklarni o‘zgartiring: narx, nom, tarjima, qoldiq, bo‘lim…'],
        ['2. «ID» ustuniga TEGMANG — mahsulot shu raqam bo‘yicha topiladi.'],
        ['3. Faylni saqlang va admin panel → Mahsulotlar → «Excel yuklash» tugmasi bilan yuklang.'],
        ['4. Yuklashdan oldin qaysi mahsulotda nima o‘zgarishi ko‘rsatiladi — tasdiqlasangiz qo‘llanadi.'],
        [''],
        ['Qoidalar:'],
        ['• Narx — noldan katta son. «45 000» yoki «45000» ko‘rinishida yozish mumkin.'],
        ['• Eski narx bo‘sh qolsa — chegirma ko‘rsatilmaydi. U joriy narxdan katta bo‘lishi kerak.'],
        [`• Kategoriya — mavjudlaridan biri: ${categories.map((c) => c.name).join(', ') || '—'}.`],
        ['• Bo‘lim — shu kategoriyadagi bo‘lim nomi. Bo‘sh qoldirilsa mahsulot bo‘limsiz bo‘ladi.'],
        ['• Vazni — bitta qiymat, masalan «500 gr» yoki «0,5 kg». Kartochkada nom tagida ko‘rinadi.'],
        ['• Mashhur — «ha» yozilsa bosh sahifadagi «Mashhur mahsulotlar» qatorida chiqadi, «yo‘q» yoki bo‘sh bo‘lsa chiqmaydi.'],
        ['• Rasmlar Excel orqali o‘zgarmaydi — ularni mahsulot oynasida almashtiring.'],
        ['• Yangi mahsulot Excel orqali qo‘shilmaydi (rasm kerak) — ID si yo‘q qatorlar o‘tkazib yuboriladi.'],
      ],
    },
  ]
}

export type Change = {
  id: string
  name: string
  patch: Record<string, unknown>
  fields: { field: Field; from: string; to: string }[]
}
export type ImportIssue = { row: number; id: string; message: string }
export type ImportPlan = { changes: Change[]; issues: ImportIssue[]; unchanged: number; skipped: number }

const money = (raw: string): number | null => {
  const cleaned = raw.replace(/\s|so[‘’'`]?m/gi, '').replace(/,(\d{3})/g, '$1').replace(',', '.')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? Math.round(n) : NaN
}

/**
 * Yuklangan varaqni joriy mahsulotlar bilan solishtiradi.
 *
 * Hech narsa yozmaydi — faqat reja: nima o'zgaradi, qaysi qatorda xato bor.
 * Admin tasdiqlagandan keyin `changes` serverga yuboriladi.
 */
export function planImport(rows: string[][], products: ProductRow[], categories: Category[], sections: Section[]): ImportPlan {
  const headerIndex = rows.findIndex((row) => row.some((cell) => normalize(cell) === 'id'))
  if (headerIndex < 0) throw new Error('Faylda «ID» ustuni topilmadi. Admin paneldan yuklab olingan fayldan foydalaning.')

  const header = rows[headerIndex].map(normalize)
  const position = new Map<string, number>()
  for (const col of COLUMNS) {
    const i = header.indexOf(normalize(col.header))
    if (i >= 0) position.set(col.key, i)
  }
  // Oldin yuklab olingan fayllarda vazn ustuni boshqacha atalgan
  if (!position.has('sizes')) {
    const i = header.indexOf(normalize('Vaznlar (vergul bilan)'))
    if (i >= 0) position.set('sizes', i)
  }
  if (!position.has('name') && !position.has('price')) {
    throw new Error('Ustun sarlavhalari tanilmadi. Sarlavha qatorini o‘zgartirmang.')
  }

  const byId = new Map(products.map((p) => [p.docId, p]))
  const categoryNames = new Set(categories.map((c) => c.name))
  const sectionByName = (category: string, name: string) =>
    sections.find((s) => s.category === category && s.name.trim().toLowerCase() === name.trim().toLowerCase())

  const plan: ImportPlan = { changes: [], issues: [], unchanged: 0, skipped: 0 }
  const seen = new Set<string>()

  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const rowNumber = headerIndex + offset + 2
    const cell = (key: string) => {
      const i = position.get(key)
      return i === undefined ? undefined : String(row[i] ?? '').trim()
    }
    if (!row.some((c) => String(c ?? '').trim())) return

    const id = (cell('id') || '').replace(/\.0+$/, '')
    if (!id) { plan.skipped++; return }
    const issue = (message: string) => plan.issues.push({ row: rowNumber, id, message })

    const product = byId.get(id)
    if (!product) return issue('Bunday ID li mahsulot yo‘q')
    if (seen.has(id)) return issue('Bu ID faylda ikki marta uchradi — faqat birinchisi olinadi')
    seen.add(id)

    const patch: Record<string, unknown> = {}
    const fields: Change['fields'] = []
    const record = (field: Field, from: unknown, to: unknown, value: unknown) => {
      const a = from === null || from === undefined ? '' : String(from)
      const b = to === null || to === undefined ? '' : String(to)
      if (a === b) return
      fields.push({ field, from: a, to: b })
      patch[field === 'section' ? 'sectionId' : field] = value
    }

    try {
      for (const field of ['name', 'nameRu', 'nameEn', 'description', 'descriptionRu', 'descriptionEn', 'color', 'discount'] as const) {
        const value = cell(field)
        if (value === undefined) continue
        if (field === 'name' && !value) throw new Error('«Nomi (o‘zbekcha)» bo‘sh bo‘lmasin')
        record(field, String((product as Record<string, unknown>)[field] ?? '').trim(), value, value)
      }

      const priceCell = cell('price')
      // Bo'sh narx — «tegilmasin» degani. Narx yig'ish faylida (rasm +
      // nom + bo'sh narx) hamma qator ham to'ldirilmasligi mumkin:
      // to'ldirilmagani xato emas, shunchaki o'zgarmaydi.
      if (priceCell !== undefined && priceCell !== '') {
        const price = money(priceCell)
        if (price === null || Number.isNaN(price) || price <= 0) throw new Error('Narx noldan katta son bo‘lishi kerak')
        record('price', Number(product.price) || 0, price, price)
      }

      const oldCell = cell('oldPrice')
      if (oldCell !== undefined) {
        const old = money(oldCell)
        if (Number.isNaN(old)) throw new Error('Eski narx son bo‘lishi kerak')
        const current = product.oldPrice ? Number(product.oldPrice) : null
        const next = old && old > 0 ? old : null
        record('oldPrice', current ?? '', next ?? '', next ?? 0)
      }

      const stockCell = cell('stock')
      if (stockCell !== undefined && stockCell !== '') {
        const stock = Number(stockCell.replace(/\s/g, ''))
        if (!Number.isInteger(stock) || stock < 0) throw new Error('Qoldiq 0 yoki undan katta butun son bo‘lsin')
        record('stock', typeof product.stock === 'number' ? product.stock : '', stock, stock)
      }

      const popularCell = cell('popular')
      if (popularCell !== undefined) {
        const v = popularCell.trim().toLowerCase().replace(/[‘’ʻʼ`']/g, '')
        let next: boolean
        if (['ha', 'yes', 'да', '1', 'true', '+'].includes(v)) next = true
        else if (['', 'yoq', 'no', 'нет', '0', 'false', '-'].includes(v)) next = false
        else throw new Error('«Mashhur» ustuniga «ha» yoki «yo‘q» yozing')
        record('popular', product.popular ? 'ha' : 'yo‘q', next ? 'ha' : 'yo‘q', next)
      }

      const sizesCell = cell('sizes')
      if (sizesCell !== undefined) {
        // Bitta qiymat — «0,5 kg» dagi vergul bo'luvchi emas
        const value = sizesCell.trim()
        record('sizes', (product.sizes || []).join(', '), value, value ? [value] : [])
      }

      let category = product.category
      const categoryCell = cell('category')
      if (categoryCell !== undefined && categoryCell !== product.category) {
        if (!categoryNames.has(categoryCell)) throw new Error(`«${categoryCell}» kategoriyasi yo‘q`)
        category = categoryCell
        record('category', product.category, categoryCell, categoryCell)
      }

      const sectionCell = cell('section')
      const currentSection = product.sectionId ? sections.find((s) => s.id === product.sectionId) : undefined
      if (sectionCell !== undefined) {
        if (sectionCell) {
          const section = sectionByName(category, sectionCell)
          if (!section) throw new Error(`«${category}» kategoriyasida «${sectionCell}» bo‘limi yo‘q`)
          record('section', currentSection?.name ?? '', section.name, section.id)
        } else {
          record('section', currentSection?.name ?? '', '', null)
        }
      } else if (category !== product.category && currentSection) {
        // Kategoriya almashdi, bo'lim ustuni yo'q — eski bo'lim endi mos emas
        record('section', currentSection.name, '', null)
      }

      // Eski narx joriy narxdan katta bo'lishi kerak — aks holda chegirma ma'nosiz
      const finalPrice = Number(patch.price ?? product.price)
      const finalOld = 'oldPrice' in patch ? Number(patch.oldPrice) : Number(product.oldPrice || 0)
      if (finalOld > 0 && finalOld <= finalPrice) throw new Error('Eski narx joriy narxdan katta bo‘lishi kerak (yoki bo‘sh qoldiring)')
    } catch (error) {
      return issue(error instanceof Error ? error.message : 'Qatorda xato')
    }

    if (fields.length) plan.changes.push({ id, name: product.name, patch, fields })
    else plan.unchanged++
  })

  return plan
}
