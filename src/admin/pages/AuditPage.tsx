import { AlertTriangle, Bike, Bot, ChevronDown, History, Loader2, Monitor, RefreshCw, Settings2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { apiPost } from '../lib/api'
import { useStaff } from '../lib/live'
import { useToast } from '../components/Toast'
import { shortDate } from '../lib/dates'

/**
 * Harakatlar jurnali (faqat ega) — kim, qachon, nimani o'zgartirdi.
 *
 * Admin panel, bot tugmalari va kuryer ilovasidagi har bir yozuv amali
 * shu yerda: muvaffaqiyatli ham, xato bilan tugagani ham. Tahrirlarda
 * «avval → keyin» farqi ko'rinadi. Server: api/_lib/audit.ts.
 */

type Row = {
  id: string
  at: string
  actor: { uid: string; name: string; role: string }
  source: 'panel' | 'bot' | 'courier' | 'system'
  action: string
  label: string
  target: { id: string | null; name: string | null }
  changes: { field: string; from: unknown; to: unknown }[]
  details: Record<string, unknown>
  ok: boolean
  error: string | null
}

const GROUPS = [
  { key: '', label: 'Hammasi' },
  { key: 'orders', label: 'Buyurtmalar va kuryerlar' },
  { key: 'catalog', label: 'Katalog va aksiyalar' },
  { key: 'messages', label: 'Xabarlar va kanal' },
  { key: 'staff', label: 'Xodimlar va kirishlar' },
  { key: 'system', label: 'Sozlamalar va tizim' },
]

const PERIODS = [
  { key: 'today', label: 'Bugun', days: 1 },
  { key: 'week', label: '7 kun', days: 7 },
  { key: 'month', label: '30 kun', days: 30 },
  { key: 'all', label: 'Hammasi', days: 0 },
]

/** Farqdagi maydon nomlari — o'zbekcha. */
const FIELDS: Record<string, string> = {
  name: 'Nomi', nameRu: 'Nomi (ru)', price: 'Narx', oldPrice: 'Eski narx', stock: 'Qoldiq', category: 'Kategoriya',
  description: 'Tavsif', status: 'Holat', courierId: 'Kuryer', active: 'Faol', percent: 'Chegirma %', title: 'Sarlavha',
  role: 'Rol', phone: 'Telefon', email: 'Email', sizes: 'Vazn', sectionId: 'Bo‘lim', popular: 'Ommabop', startsAt: 'Boshlanishi',
  endsAt: 'Tugashi', code: 'Kod', discount: 'Chegirma', minOrder: 'Minimal summa', limit: 'Limit', order: 'Tartib',
}

const ROLE: Record<string, string> = { owner: 'Ega', admin: 'Admin', courier: 'Kuryer' }

function since(days: number): string {
  if (!days) return ''
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - (days - 1))
  return d.toISOString()
}

const show = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'ha' : 'yo‘q'
  if (typeof v === 'number') return v.toLocaleString('ru-RU')
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}

export function AuditPage() {
  const { staff } = useStaff(true)
  const { show: toastShow, node: toast } = useToast()
  const [group, setGroup] = useState('')
  const [period, setPeriod] = useState('week')
  const [actor, setActor] = useState('')
  const [errors, setErrors] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [next, setNext] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const filters = () => ({
    group,
    actor,
    errors,
    from: since(PERIODS.find((p) => p.key === period)?.days ?? 0),
  })

  // Filtr o'zgarsa — boshidan; javob kelganda holat yoziladi
  useEffect(() => {
    let alive = true
    apiPost<{ rows: Row[]; next: string | null }>('action', { action: 'audit.list', limit: 50, ...filters() })
      .then((r) => {
        if (!alive) return
        setRows(r.rows)
        setNext(r.next)
      })
      .catch((e: unknown) => { if (alive) toastShow(e instanceof Error ? e.message : 'Jurnal yuklanmadi', 'error') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filtrlar o'zgarganda qayta yuklaymiz
  }, [group, period, actor, errors, reloadKey, toastShow])

  const refetch = () => { setLoading(true); setReloadKey((k) => k + 1) }

  const more = async () => {
    if (!next) return
    setLoading(true)
    try {
      const r = await apiPost<{ rows: Row[]; next: string | null }>('action', { action: 'audit.list', limit: 50, before: next, ...filters() })
      setRows([...rows, ...r.rows])
      setNext(r.next)
    } catch (e) {
      toastShow(e instanceof Error ? e.message : 'Yuklanmadi', 'error')
    } finally {
      setLoading(false)
    }
  }

  const pick = (fn: () => void) => { setLoading(true); fn() }

  return (
    <>
      <section className="adm-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="adm-view-toggle" role="tablist" aria-label="Davr">
            {PERIODS.map((p) => (
              <button key={p.key} role="tab" aria-selected={period === p.key} className={period === p.key ? 'is-on' : ''} onClick={() => pick(() => setPeriod(p.key))}>
                {p.label}
              </button>
            ))}
          </div>
          <select className="adm-input w-auto" value={actor} onChange={(e) => pick(() => setActor(e.target.value))} aria-label="Xodim">
            <option value="">Barcha xodimlar</option>
            {staff.map((s) => <option key={s.uid} value={s.uid}>{s.name || s.email} ({ROLE[s.role] ?? s.role})</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={errors} onChange={(e) => pick(() => setErrors(e.target.checked))} style={{ accentColor: 'var(--danger)' }} />
            Faqat xatolar
          </label>
          <button type="button" className="adm-btn adm-btn--ghost ml-auto" onClick={refetch} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Yangilash
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {GROUPS.map((g) => (
            <button key={g.key} type="button" className={'adm-chip ' + (group === g.key ? 'active' : '')} onClick={() => pick(() => setGroup(g.key))}>
              {g.label}
            </button>
          ))}
        </div>
      </section>

      <section className="adm-card mt-4 p-2 sm:p-3">
        {rows.length === 0 && !loading ? (
          <div className="adm-empty">
            <History size={28} />
            <p>Bu davrda harakat yo‘q.</p>
          </div>
        ) : (
          <ul className="adm-audit">
            {rows.map((row) => {
              const expanded = open === row.id
              return (
                <li key={row.id} className={'adm-audit__row' + (row.ok ? '' : ' is-error')}>
                  <button type="button" className="adm-audit__head" onClick={() => setOpen(expanded ? null : row.id)} aria-expanded={expanded}>
                    <span className="adm-audit__src" title={row.source}>
                      {row.source === 'courier' ? <Bike size={15} /> : row.source === 'bot' ? <Bot size={15} /> : row.source === 'system' ? <Settings2 size={15} /> : <Monitor size={15} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="adm-audit__line">
                        <b>{row.actor?.name || '—'}</b>
                        <span className="adm-audit__role">{ROLE[row.actor?.role] ?? row.actor?.role}</span>
                        <span>{row.label}</span>
                        {(row.target?.name || row.target?.id) && <span className="adm-audit__target">{row.target.name || `#${row.target.id}`}</span>}
                      </span>
                      {row.changes?.length > 0 && (
                        <span className="adm-audit__changes">
                          {row.changes.slice(0, 3).map((c) => (
                            <span key={c.field}>{FIELDS[c.field] ?? c.field}: <s>{show(c.from)}</s> → <b>{show(c.to)}</b></span>
                          ))}
                          {row.changes.length > 3 && <span>+{row.changes.length - 3}</span>}
                        </span>
                      )}
                      {!row.ok && <span className="adm-audit__error"><AlertTriangle size={12} /> {row.error}</span>}
                    </span>
                    <span className="adm-audit__time">
                      {shortDate(row.at)}
                    </span>
                    <ChevronDown size={15} className={'shrink-0 transition ' + (expanded ? 'rotate-180' : '')} style={{ color: 'var(--faint)' }} />
                  </button>
                  {expanded && (
                    <div className="adm-audit__body">
                      {row.changes?.length > 0 && (
                        <table>
                          <tbody>
                            {row.changes.map((c) => (
                              <tr key={c.field}><th>{FIELDS[c.field] ?? c.field}</th><td><s>{show(c.from)}</s></td><td><b>{show(c.to)}</b></td></tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>
                        Amal: <code>{row.action}</code> · Manba: {row.source} · {new Date(row.at).toLocaleString('ru-RU')}
                      </p>
                      <pre>{JSON.stringify(row.details, null, 2)}</pre>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {loading && <p className="p-3 text-center text-sm" style={{ color: 'var(--muted)' }}><Loader2 size={15} className="inline animate-spin" /> Yuklanmoqda…</p>}
        {next && !loading && (
          <button type="button" className="adm-btn adm-btn--ghost mt-2 w-full" onClick={() => void more()}>Ko‘proq ko‘rsatish</button>
        )}
      </section>
      {toast}
    </>
  )
}
