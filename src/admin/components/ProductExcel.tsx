import { CheckCircle2, Download, FileSpreadsheet, Loader2, TriangleAlert, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { apiPost } from '../lib/api'
import type { ProductRow } from '../lib/live'
import { exportSheets, FIELD_LABEL, planImport, type ImportPlan } from '../lib/product-excel'
import { downloadWorkbook, readWorkbook } from '../lib/xlsx'
import { Modal } from './Modal'
import type { Category, Section } from '../../types/domain'

type Props = {
  products: ProductRow[]
  categories: Category[]
  sections: Section[]
  onToast: (message: string, kind?: 'error') => void
}

type Result = { updated: { id: string; name: string; fields: string[] }[]; failed: { id: string; error: string }[] }

const CHUNK = 400
const short = (s: string) => (s.length > 60 ? `${s.slice(0, 57)}…` : s || '—')

/**
 * «Excel yuklab olish» va «Excel yuklash» tugmalari.
 *
 * Yuklashda hech narsa darhol yozilmaydi: avval fayl o'qiladi va
 * «qaysi mahsulotda nima o'zgaradi» ro'yxati ko'rsatiladi. Admin
 * tasdiqlagandan keyingina server o'zgarishlarni qo'llaydi va natijada
 * nechta mahsulot o'zgargani ID lari bilan chiqadi.
 */
export function ProductExcel({ products, categories, sections, onToast }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [reading, setReading] = useState(false)
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [fileName, setFileName] = useState('')
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  const download = () => {
    const stamp = new Date().toISOString().slice(0, 10)
    downloadWorkbook(`MUSA-mahsulotlar-${stamp}.xlsx`, exportSheets(products, sections, categories))
    onToast(`${products.length} ta mahsulot Excel faylga yuklab olindi`)
  }

  const pick = async (file: File | undefined) => {
    if (!file) return
    setReading(true)
    try {
      const sheets = await readWorkbook(await file.arrayBuffer())
      const sheet = sheets.find((s) => s.name.toLowerCase().startsWith('mahsulot')) ?? sheets[0]
      if (!sheet) throw new Error('Faylda varaq topilmadi')
      setFileName(file.name)
      setPlan(planImport(sheet.rows, products, categories, sections))
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Faylni o‘qib bo‘lmadi', 'error')
    } finally {
      setReading(false)
      if (input.current) input.current.value = ''
    }
  }

  const apply = async () => {
    if (!plan) return
    setApplying(true)
    const outcome: Result = { updated: [], failed: [] }
    const byId = new Map(plan.changes.map((c) => [c.id, c]))
    try {
      for (let i = 0; i < plan.changes.length; i += CHUNK) {
        const part = plan.changes.slice(i, i + CHUNK)
        const res = await apiPost<{ updated: string[]; failed: { id: string; error: string }[] }>('action', {
          action: 'product.bulkUpdate',
          items: part.map((c) => ({ id: c.id, patch: c.patch })),
        })
        for (const id of res.updated) {
          const change = byId.get(id)
          outcome.updated.push({ id, name: change?.name ?? '', fields: change?.fields.map((f) => FIELD_LABEL[f.field]) ?? [] })
        }
        outcome.failed.push(...res.failed)
      }
      setPlan(null)
      setResult(outcome)
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'O‘zgarishlar saqlanmadi', 'error')
    } finally {
      setApplying(false)
    }
  }

  return (
    <>
      <button className="adm-btn adm-btn--ghost" onClick={download} disabled={!products.length}>
        <Download size={16} /> Excel yuklab olish
      </button>
      <button className="adm-btn adm-btn--ghost" onClick={() => input.current?.click()} disabled={reading}>
        {reading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Excel yuklash
      </button>
      <input
        ref={input}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        hidden
        onChange={(e) => void pick(e.target.files?.[0])}
      />

      {plan && (
        <Modal
          wide
          title="Excel’dan o‘zgarishlar"
          onClose={() => !applying && setPlan(null)}
          footer={
            <>
              <button className="adm-btn adm-btn--ghost flex-1" onClick={() => setPlan(null)} disabled={applying}>
                Bekor qilish
              </button>
              <button className="adm-btn adm-btn--primary flex-1" onClick={apply} disabled={applying || !plan.changes.length}>
                {applying ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {plan.changes.length ? `${plan.changes.length} ta mahsulotni yangilash` : 'O‘zgarish yo‘q'}
              </button>
            </>
          }
        >
          <p className="flex items-center gap-2 text-sm" style={{ color: 'var(--muted)' }}>
            <FileSpreadsheet size={16} /> {fileName}
          </p>

          <div className="adm-excel-stats">
            <div><b style={{ color: 'var(--brand)' }}>{plan.changes.length}</b><span>o‘zgaradi</span></div>
            <div><b>{plan.unchanged}</b><span>o‘zgarishsiz</span></div>
            <div><b style={{ color: plan.issues.length ? 'var(--danger)' : undefined }}>{plan.issues.length}</b><span>xato</span></div>
            {plan.skipped > 0 && <div><b>{plan.skipped}</b><span>ID siz qator</span></div>}
          </div>

          {plan.issues.length > 0 && (
            <section className="adm-excel-issues">
              <p className="flex items-center gap-2 text-sm font-extrabold" style={{ color: 'var(--danger)' }}>
                <TriangleAlert size={16} /> Bu qatorlar o‘tkazib yuboriladi
              </p>
              <ul>
                {plan.issues.slice(0, 50).map((issue) => (
                  <li key={`${issue.row}-${issue.id}`}>
                    <span className="adm-excel-tag">{issue.row}-qator</span>
                    <span className="adm-excel-tag">ID {issue.id}</span>
                    {issue.message}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {plan.changes.length > 0 && (
            <div className="adm-excel-changes">
              {plan.changes.map((change) => (
                <details key={change.id} open={plan.changes.length <= 5}>
                  <summary>
                    <span className="adm-excel-tag">ID {change.id}</span>
                    <b className="truncate">{change.name}</b>
                    <span className="ml-auto shrink-0 text-xs" style={{ color: 'var(--muted)' }}>
                      {change.fields.length} ta maydon
                    </span>
                  </summary>
                  <table>
                    <tbody>
                      {change.fields.map((f) => (
                        <tr key={f.field}>
                          <th>{FIELD_LABEL[f.field]}</th>
                          <td className="is-old">{short(f.from)}</td>
                          <td aria-hidden="true">→</td>
                          <td className="is-new">{short(f.to)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              ))}
            </div>
          )}
        </Modal>
      )}

      {result && (
        <Modal
          title={result.updated.length ? `${result.updated.length} ta mahsulot yangilandi` : 'Hech narsa yangilanmadi'}
          onClose={() => setResult(null)}
          footer={
            <button className="adm-btn adm-btn--primary flex-1" onClick={() => setResult(null)}>
              Yopish
            </button>
          }
        >
          {result.updated.length > 0 && (
            <ul className="adm-excel-result">
              {result.updated.map((item) => (
                <li key={item.id}>
                  <CheckCircle2 size={15} style={{ color: 'var(--brand)' }} />
                  <span className="adm-excel-tag">ID {item.id}</span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate">{item.name}</b>
                    <span className="block text-xs" style={{ color: 'var(--muted)' }}>{item.fields.join(', ')}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {result.failed.length > 0 && (
            <section className="adm-excel-issues mt-3">
              <p className="text-sm font-extrabold" style={{ color: 'var(--danger)' }}>Saqlanmadi</p>
              <ul>
                {result.failed.map((f) => (
                  <li key={f.id}><span className="adm-excel-tag">ID {f.id}</span>{f.error}</li>
                ))}
              </ul>
            </section>
          )}
        </Modal>
      )}
    </>
  )
}
