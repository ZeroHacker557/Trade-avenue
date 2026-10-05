/**
 * Excel (.xlsx) fayllarini yozish va o'qish — tashqi kutubxonasiz.
 *
 * Nega o'zimiz? Loyihada npm ishlamaydi, bizga esa .xlsx ning kichik
 * qismi kerak: bir necha varaq, sarlavha qatori, son formati. .xlsx —
 * bu ichida XML fayllar bor oddiy ZIP arxiv.
 *
 * Yozish: ZIP «saqlash» usulida (siqilmagan) — Excel, Google Sheets va
 * LibreOffice bemalol ochadi, siqish kodi esa kerak bo'lmaydi.
 * O'qish: Excel saqlagan fayl siqilgan bo'ladi — brauzerning o'z
 * `DecompressionStream('deflate-raw')` i bilan ochiladi.
 */

// ── Yozish ────────────────────────────────────────────────

export type Cell = string | number | null | undefined
export type CellStyle = 'text' | 'money' | 'number' | 'percent' | 'bold' | 'money-bold'

export type SheetSpec = {
  name: string
  /** Sarlavha qatori — yashil fonda, qalin, muzlatilgan. */
  headers: string[]
  rows: Cell[][]
  /** Ustun kengligi (belgi soni). Berilmasa mazmunidan hisoblanadi. */
  widths?: number[]
  /** Ustun turi: pul «1 234 500», son, foiz. */
  styles?: CellStyle[]
  /** Oxirgi qator — «Jami» — qalin bo'lib chiqsinmi. */
  totalRow?: boolean
  /** Sarlavha ustidagi izoh qatorlari (hisobot nomi, davr). */
  title?: string[]
}

const XML_ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
const escXml = (s: string) =>
  Array.from(s.replace(/[&<>"]/g, (ch) => XML_ESC[ch]))
    // XML'da ruxsat etilmagan boshqaruv belgilari (tab, yangi qator va CR dan tashqari)
    .filter((ch) => { const c = ch.charCodeAt(0); return c >= 32 || c === 9 || c === 10 || c === 13 })
    .join('')

function colName(index: number): string {
  let n = index + 1
  let name = ''
  while (n > 0) {
    const r = (n - 1) % 26
    name = String.fromCharCode(65 + r) + name
    n = Math.floor((n - 1) / 26)
  }
  return name
}

/*
 * Uslublar jadvali (styles.xml dagi cellXfs tartibi):
 *   0 oddiy · 1 sarlavha · 2 pul · 3 son · 4 foiz · 5 qalin · 6 qalin pul · 7 hisobot nomi · 8 izoh
 */
const STYLE_INDEX: Record<CellStyle, number> = { text: 0, money: 2, number: 3, percent: 4, bold: 5, 'money-bold': 6 }

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0"/><numFmt numFmtId="165" formatCode="0.0&quot;%&quot;"/></numFmts>
<fonts count="5">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="15"/><color rgb="FF0A7A3D"/><name val="Calibri"/></font>
<font><i/><sz val="10"/><color rgb="FF5F7268"/><name val="Calibri"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF0A7A3D"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE6F4EA"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top style="thin"><color rgb="FF0A7A3D"/></top><bottom/><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="center" wrapText="0"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center" horizontal="left"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
</styleSheet>`

function cellXml(ref: string, value: Cell, style: number): string {
  if (value === null || value === undefined || value === '') {
    return style ? `<c r="${ref}" s="${style}"/>` : ''
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}" s="${style}"><v>${value}</v></c>`
  }
  const text = escXml(String(value))
  const keep = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : ''
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t${keep}>${text}</t></is></c>`
}

function sheetXml(spec: SheetSpec): string {
  const title = spec.title || []
  const headerRow = title.length ? title.length + 2 : 1
  const lastCol = colName(Math.max(spec.headers.length, 1) - 1)

  const widths = spec.headers.map((h, i) => {
    if (spec.widths?.[i]) return spec.widths[i]
    const longest = spec.rows.reduce((max, row) => Math.max(max, String(row[i] ?? '').length), h.length)
    return Math.min(60, Math.max(8, longest + 2))
  })

  const rows: string[] = []
  title.forEach((line, i) => {
    rows.push(`<row r="${i + 1}"${i === 0 ? ' ht="22" customHeight="1"' : ''}>${cellXml(`A${i + 1}`, line, i === 0 ? 7 : 8)}</row>`)
  })
  rows.push(
    `<row r="${headerRow}" ht="20" customHeight="1">` +
      spec.headers.map((h, i) => cellXml(`${colName(i)}${headerRow}`, h, 1)).join('') +
      '</row>',
  )
  spec.rows.forEach((row, r) => {
    const rowNum = headerRow + 1 + r
    const isTotal = spec.totalRow && r === spec.rows.length - 1
    const cells = spec.headers.map((_, c) => {
      const kind = spec.styles?.[c] || 'text'
      let style = STYLE_INDEX[kind]
      if (isTotal) style = kind === 'money' || kind === 'number' ? STYLE_INDEX['money-bold'] : STYLE_INDEX.bold
      return cellXml(`${colName(c)}${rowNum}`, row[c], style)
    })
    rows.push(`<row r="${rowNum}">${cells.join('')}</row>`)
  })

  const lastRow = headerRow + spec.rows.length
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="16"/>
<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>
<sheetData>${rows.join('')}</sheetData>
${spec.rows.length ? `<autoFilter ref="A${headerRow}:${lastCol}${lastRow - (spec.totalRow ? 1 : 0)}"/>` : ''}
</worksheet>`
}

/** Excel varaq nomi: 31 belgigacha, taqiqlangan belgilarsiz, takrorlanmas. */
function sheetNames(specs: SheetSpec[]): string[] {
  const used = new Set<string>()
  return specs.map((s, i) => {
    let name = (s.name || `Varaq ${i + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || `Varaq ${i + 1}`
    let n = 2
    while (used.has(name.toLowerCase())) name = `${name.slice(0, 28)} ${n++}`
    used.add(name.toLowerCase())
    return name
  })
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()
function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Siqilmagan ZIP arxiv. */
function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const file of files) {
    const name = enc.encode(file.name)
    const crc = crc32(file.data)
    const size = file.data.length

    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, 0x0800, true) // UTF-8 nomlar
    lv.setUint16(8, 0, true) // saqlash usuli
    lv.setUint32(14, crc, true)
    lv.setUint32(18, size, true)
    lv.setUint32(22, size, true)
    lv.setUint16(26, name.length, true)
    local.set(name, 30)

    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, 0, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, size, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    central.set(name, 46)

    locals.push(local, file.data)
    centrals.push(central)
    offset += local.length + size
  }

  const centralSize = centrals.reduce((s, c) => s + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)

  const out = new Uint8Array(offset + centralSize + end.length)
  let pos = 0
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, pos)
    pos += part.length
  }
  return out
}

/** Bir necha varaqli .xlsx fayl baytlari. */
export function buildWorkbook(specs: SheetSpec[]): Uint8Array {
  const enc = new TextEncoder()
  const names = sheetNames(specs)
  const files: { name: string; data: Uint8Array }[] = [
    {
      name: '[Content_Types].xml',
      data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${specs.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`),
    },
    {
      name: '_rels/.rels',
      data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    },
    {
      name: 'xl/workbook.xml',
      data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${names.map((n, i) => `<sheet name="${escXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>`),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${specs.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${specs.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
    },
    { name: 'xl/styles.xml', data: enc.encode(STYLES_XML) },
    ...specs.map((spec, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(sheetXml(spec)) })),
  ]
  return zipStore(files)
}

/** Faylni kompyuterga yuklab beradi. */
export function downloadWorkbook(fileName: string, specs: SheetSpec[]) {
  const bytes = buildWorkbook(specs)
  const blob = new Blob([bytes as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── O'qish ────────────────────────────────────────────────

async function unzip(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)

  // Arxiv oxiridagi «markaziy katalog» yozuvi — izoh bo'lishi mumkin, orqadan qidiramiz
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break }
  }
  if (end < 0) throw new Error('Bu Excel (.xlsx) fayl emas')

  const count = view.getUint16(end + 10, true)
  let pos = view.getUint32(end + 16, true)
  const dec = new TextDecoder()
  const files = new Map<string, Uint8Array>()

  for (let i = 0; i < count; i++) {
    if (view.getUint32(pos, true) !== 0x02014b50) throw new Error('Fayl buzilgan')
    const method = view.getUint16(pos + 10, true)
    const compressed = view.getUint32(pos + 20, true)
    const nameLen = view.getUint16(pos + 28, true)
    const extraLen = view.getUint16(pos + 30, true)
    const commentLen = view.getUint16(pos + 32, true)
    const localOffset = view.getUint32(pos + 42, true)
    const name = dec.decode(bytes.subarray(pos + 46, pos + 46 + nameLen))
    pos += 46 + nameLen + extraLen + commentLen

    // Faqat kerakli XML'lar — rasm va boshqa narsalar ochilmaydi
    if (!/^(xl\/(workbook\.xml|sharedStrings\.xml|_rels\/workbook\.xml\.rels|worksheets\/[^/]+\.xml))$/i.test(name)) continue

    const localNameLen = view.getUint16(localOffset + 26, true)
    const localExtraLen = view.getUint16(localOffset + 28, true)
    const start = localOffset + 30 + localNameLen + localExtraLen
    const raw = bytes.subarray(start, start + compressed)

    if (method === 0) files.set(name, raw.slice())
    else if (method === 8) {
      const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      files.set(name, new Uint8Array(await new Response(stream).arrayBuffer()))
    } else {
      throw new Error('Faylning siqish usuli qo‘llanmaydi — Excel’da qayta saqlab ko‘ring')
    }
  }
  return files
}

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const unescXml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
    return ENTITY[e.toLowerCase()] ?? _
  })

/** <si> yoki <is> ichidagi barcha <t> matnlarini qo'shadi (formatlangan matn ham). */
const joinText = (xml: string) =>
  [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)].map((m) => unescXml(m[1] ?? '')).join('')

function colIndex(ref: string): number {
  const letters = ref.replace(/[^A-Z]/gi, '').toUpperCase()
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

export type ReadSheet = { name: string; rows: string[][] }

/**
 * .xlsx faylning varaqlarini matn jadvali sifatida o'qiydi.
 * Sonlar ham matn bo'lib qaytadi — tekshirish chaqiruvchida.
 */
export async function readWorkbook(buffer: ArrayBuffer): Promise<ReadSheet[]> {
  const files = await unzip(buffer)
  const dec = new TextDecoder()
  const text = (name: string) => {
    const hit = [...files.keys()].find((k) => k.toLowerCase() === name.toLowerCase())
    return hit ? dec.decode(files.get(hit)) : ''
  }

  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => joinText(m[1]))

  const rels = new Map(
    [...text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)].map((m) => {
      const id = /Id="([^"]+)"/.exec(m[0])?.[1] ?? ''
      const target = /Target="([^"]+)"/.exec(m[0])?.[1] ?? ''
      return [id, target.replace(/^\/?(xl\/)?/, 'xl/')]
    }),
  )

  const sheets = [...text('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)].map((m) => ({
    name: unescXml(/name="([^"]*)"/.exec(m[0])?.[1] ?? ''),
    path: rels.get(/r:id="([^"]+)"/.exec(m[0])?.[1] ?? '') ?? '',
  }))

  return sheets.map(({ name, path }) => {
    const xml = text(path)
    const rows: string[][] = []
    for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g)) {
      const attrs = rowMatch[1] ?? rowMatch[3] ?? ''
      const rowNum = Number(/\br="(\d+)"/.exec(attrs)?.[1] ?? rows.length + 1)
      const cells: string[] = []
      let next = 0
      for (const cell of (rowMatch[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const cAttrs = cell[1]
        const ref = /\br="([A-Z]+\d+)"/i.exec(cAttrs)?.[1]
        const col = ref ? colIndex(ref) : next
        next = col + 1
        const type = /\bt="([^"]+)"/.exec(cAttrs)?.[1] ?? 'n'
        const body = cell[2] ?? ''
        const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]
        let value: string
        if (type === 's') value = shared[Number(v)] ?? ''
        else if (type === 'inlineStr') value = joinText(/<is>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? '')
        else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE'
        else value = v !== undefined ? unescXml(v) : ''
        cells[col] = value
      }
      rows[rowNum - 1] = Array.from(cells, (c) => c ?? '')
    }
    return { name, rows: Array.from(rows, (r) => r ?? []) }
  })
}
