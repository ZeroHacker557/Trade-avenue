import { Check, Copy, Link2, Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { apiPost } from '../lib/api'
import { useToast } from '../components/Toast'
import { formatPrice } from '../../data'

/**
 * Trafik manbalari — reklama havolasidan (t.me/musauz_bot?start=meta_ig)
 * botga nechta odam kelgani, ulardan nechtasi buyurtma bergani va qancha
 * summaga. Server: api/_lib/actions/sources.ts, bot: bot/source_tracking.py.
 */

type Row = {
  source: string
  starts: number
  newUsers: number
  buyers: number
  orders: number
  revenue: number
  conversion: number | null
}

const BOT = 'musauz_bot'
const PERIODS = [
  { days: 1, label: 'Bugun' },
  { days: 7, label: '7 kun' },
  { days: 30, label: '30 kun' },
  { days: 90, label: '90 kun' },
]
const PRESETS = ['meta_ig', 'meta_fb', 'meta_aksiya', 'instagram_bio', 'tiktok', 'kanal']

const label = (source: string) =>
  source === 'organic' ? 'Organik (havolasiz kirgan)'
    : source === '—' ? 'Manbasiz (eski mijozlar)'
      : source === 'channel' ? 'Kanal tugmasi'
        : source

export function SourcesPage() {
  const { show, node: toast } = useToast()
  const [days, setDays] = useState(7)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [name, setName] = useState('meta_ig')
  const [copied, setCopied] = useState(false)

  // Davr o'zgarsa — qayta yuklanadi; javob kelganda holat yoziladi
  useEffect(() => {
    let alive = true
    apiPost<{ rows: Row[] }>('action', { action: 'sources.stats', days })
      .then((r) => { if (alive) setRows(r.rows) })
      .catch((e: unknown) => { if (alive) show(e instanceof Error ? e.message : 'Yuklanmadi', 'error') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [days, reload, show])

  const pick = (d: number) => { setLoading(true); setDays(d) }
  const clean = name.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64)
  const link = `https://t.me/${BOT}?start=${clean}`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      show('Nusxalab bo‘lmadi — havolani qo‘lda belgilang', 'error')
    }
  }

  const total = (rows ?? []).reduce(
    (t, r) => ({ starts: t.starts + r.starts, newUsers: t.newUsers + r.newUsers, orders: t.orders + r.orders, revenue: t.revenue + r.revenue }),
    { starts: 0, newUsers: 0, orders: 0, revenue: 0 },
  )

  return (
    <>
      <section className="adm-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="adm-view-toggle" role="tablist" aria-label="Davr">
            {PERIODS.map((p) => (
              <button key={p.days} role="tab" aria-selected={days === p.days} className={days === p.days ? 'is-on' : ''} onClick={() => pick(p.days)}>
                {p.label}
              </button>
            ))}
          </div>
          <button type="button" className="adm-btn adm-btn--ghost ml-auto" onClick={() => { setLoading(true); setReload((k) => k + 1) }} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Yangilash
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ['Start bosganlar', total.starts.toLocaleString('ru-RU')],
            ['Yangi foydalanuvchilar', total.newUsers.toLocaleString('ru-RU')],
            ['Buyurtmalar', total.orders.toLocaleString('ru-RU')],
            ['Tushum', formatPrice(total.revenue)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl p-3" style={{ background: 'var(--surface-2)' }}>
              <p className="text-xs font-bold" style={{ color: 'var(--muted)' }}>{k}</p>
              <p className="mt-1 text-lg font-extrabold">{v}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="adm-card mt-4 overflow-x-auto p-0">
        {loading && !rows ? (
          <p className="p-4 text-sm" style={{ color: 'var(--muted)' }}><Loader2 size={15} className="inline animate-spin" /> Yuklanmoqda…</p>
        ) : !rows?.length ? (
          <p className="p-4 text-sm" style={{ color: 'var(--muted)' }}>Bu davrda ma’lumot yo‘q. Reklama havolasini pastda yasab, e’loningizga qo‘ying.</p>
        ) : (
          <table className="adm-table">
            <thead>
              <tr>
                <th>Manba</th>
                <th className="text-right">Start</th>
                <th className="text-right">Yangi</th>
                <th className="text-right">Xaridor</th>
                <th className="text-right">Buyurtma</th>
                <th className="text-right">Summa</th>
                <th className="text-right">Konversiya</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.source}>
                  <td className="font-bold">{label(r.source)}</td>
                  <td className="text-right">{r.starts}</td>
                  <td className="text-right">{r.newUsers}</td>
                  <td className="text-right">{r.buyers}</td>
                  <td className="text-right">{r.orders}</td>
                  <td className="text-right whitespace-nowrap">{formatPrice(r.revenue)}</td>
                  <td className="text-right font-bold" style={{ color: r.conversion ? 'var(--brand)' : 'var(--faint)' }}>
                    {r.conversion === null ? '—' : `${r.conversion}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="px-4 pb-3 pt-2 text-xs" style={{ color: 'var(--faint)' }}>
          Konversiya = buyurtma bergan / yangi foydalanuvchi. Buyurtma mijozning buyurtma paytidagi oxirgi manbasiga yoziladi;
          bekor qilingan va to‘lanmaganlar hisobga olinmaydi.
        </p>
      </section>

      <section className="adm-card mt-4 p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-sm font-extrabold"><Link2 size={16} /> Reklama havolasi yasash</h2>
        <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
          Har reklama uchun alohida nom bering — statistikada shu nom bilan chiqadi. Faqat lotin harflari, raqam, «_» va «-».
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button key={p} type="button" className={'adm-chip ' + (clean === p ? 'active' : '')} onClick={() => setName(p)}>{p}</button>
          ))}
        </div>
        <input className="adm-input mt-3" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} placeholder="meta_ig" aria-label="Manba nomi" />
        <div className="mt-3 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-xl px-3 py-2.5 text-sm" style={{ background: 'var(--surface-2)' }}>{link}</code>
          <button type="button" className="adm-btn adm-btn--primary shrink-0" onClick={() => void copy()} disabled={!clean}>
            {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Nusxalandi' : 'Nusxalash'}
          </button>
        </div>
      </section>
      {toast}
    </>
  )
}
