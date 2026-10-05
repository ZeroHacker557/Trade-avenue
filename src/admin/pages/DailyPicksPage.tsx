import { CalendarClock, Eye, Loader2, Package, Plus, Radio, Search, Send, Shuffle, Smartphone, Sparkles, TriangleAlert, Users, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiPost } from '../lib/api'
import { useProducts, type ProductRow } from '../lib/live'
import { formatPrice } from '../../data'
import { productThumb } from '../../utils/product-image'
import { ConfirmDialog, Modal } from '../components/Modal'
import { useToast } from '../components/Toast'

/**
 * Kunlik e’lon: har kuni belgilangan soatda 1–6 ta (odatda 4) mahsulot
 * bir xil shablondagi rasmda bot foydalanuvchilariga va/yoki kanalga.
 * Server: api/_lib/actions/daily.ts (rasm — api/_lib/daily/card.ts).
 */

type Settings = {
  enabled: boolean
  time: string
  customers: boolean
  channel: boolean
  title: string
  accent: string
  text: string
  textRu: string
  button: string
  buttonRu: string
  count: number
  chosen: string[]
}
type State = Settings & {
  lastDay: string | null
  lastImage: string | null
  lastRunAt: string | null
  lastError: string | null
}
type Job = {
  status: string
  runAt: string
  sent: number
  failed: number
  channelLink: string | null
  channelError: string | null
  error: string | null
}
type Info = { settings: State; job: Job | null; today: string; now: string }
type Preview = { image: string; text: string; textRu: string }

const JOB_STATUS: Record<string, string> = {
  pending: 'navbatda',
  running: 'yuborilmoqda',
  done: 'yuborildi',
  failed: 'xato',
  cancelled: 'bekor qilindi',
}

const pickSettings = (s: State): Settings => ({
  enabled: s.enabled, time: s.time, customers: s.customers, channel: s.channel,
  title: s.title, accent: s.accent, text: s.text, textRu: s.textRu, button: s.button, buttonRu: s.buttonRu,
  count: s.count ?? 4,
  chosen: s.chosen ?? [],
})

/** «2026-10-01» → «01.10.2026». */
const day = (value: string | null) => (value ? `${value.slice(8, 10)}.${value.slice(5, 7)}.${value.slice(0, 4)}` : '—')

export function DailyPicksPage() {
  const { show, node: toast } = useToast()
  const [info, setInfo] = useState<Info | null>(null)
  const [draft, setDraft] = useState<Settings | null>(null)
  const [busy, setBusy] = useState<'' | 'save' | 'preview' | 'test' | 'send'>('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [confirmSend, setConfirmSend] = useState(false)
  const [picking, setPicking] = useState(false)
  const { products } = useProducts()
  const byDocId = useMemo(() => new Map(products.map((p) => [p.docId, p])), [products])

  const load = useCallback(async () => {
    try {
      const next = await apiPost<Info>('action', { action: 'daily.get' })
      setInfo(next)
      setDraft((d) => d ?? pickSettings(next.settings))
    } catch (error) {
      show(error instanceof Error ? error.message : 'Yuklanmadi', 'error')
    }
  }, [show])

  useEffect(() => {
    let alive = true
    apiPost<Info>('action', { action: 'daily.get' })
      .then((next) => {
        if (!alive) return
        setInfo(next)
        setDraft(pickSettings(next.settings))
      })
      .catch((e: unknown) => { if (alive) show(e instanceof Error ? e.message : 'Yuklanmadi', 'error') })
    return () => { alive = false }
  }, [show])

  if (!info || !draft) {
    return (
      <div className="grid gap-3">
        <div className="adm-skeleton h-32" />
        <div className="adm-skeleton h-72" />
        {toast}
      </div>
    )
  }

  const set = (patch: Partial<Settings>) => setDraft({ ...draft, ...patch })
  const saved = pickSettings(info.settings)
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft)

  const run = async <T,>(kind: typeof busy, action: string, done: (r: T) => void) => {
    setBusy(kind)
    try {
      done(await apiPost<T>('action', { action, settings: draft }))
    } catch (error) {
      show(error instanceof Error ? error.message : 'Bajarilmadi', 'error')
    } finally {
      setBusy('')
    }
  }

  const save = () =>
    run<Info>('save', 'daily.save', (next) => {
      setInfo(next)
      setDraft(pickSettings(next.settings))
      show(next.settings.enabled ? `Saqlandi — har kuni ${next.settings.time} da yuboriladi` : 'Saqlandi (o‘chiq)')
    })

  const job = info.job
  const sentToday = info.settings.lastDay === info.today

  return (
    <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid min-w-0 content-start gap-4">
        {/* ── Holat va vaqt ── */}
        <section className="adm-card grid gap-3 p-4">
          <Toggle
            icon={<CalendarClock size={18} />}
            label={draft.enabled ? 'Kunlik e’lon yoqilgan' : 'Kunlik e’lonni yoqish'}
            hint={draft.enabled ? `Har kuni ${draft.time} da avtomatik yuboriladi` : 'Yoqilmaguncha hech narsa yuborilmaydi'}
            checked={draft.enabled}
            onChange={(enabled) => set({ enabled })}
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="adm-label m-0" htmlFor="daily-time">Yuborish vaqti</label>
            <input
              id="daily-time"
              type="time"
              className="adm-input"
              style={{ width: 130 }}
              value={draft.time}
              onChange={(e) => set({ time: e.target.value })}
            />
            <span className="text-xs" style={{ color: 'var(--muted)' }}>Toshkent vaqti · hozir {info.now}</span>
          </div>
          <p className="adm-label m-0 mt-1">Kimga yuborilsin</p>
          <Toggle
            icon={<Users size={18} />}
            label="Bot foydalanuvchilari"
            hint="Botni ishga tushirgan barcha mijozlarga shaxsiy xabar"
            checked={draft.customers}
            onChange={(customers) => set({ customers })}
          />
          <Toggle
            icon={<Radio size={18} />}
            label="Telegram kanal"
            hint="«Telegram kanal» bo‘limida ulangan kanalga post"
            checked={draft.channel}
            onChange={(channel) => set({ channel })}
          />
        </section>

        {/* ── Mahsulotlar ── */}
        <section className="adm-card grid gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="flex items-center gap-2 text-sm font-extrabold"><Package size={16} /> Mahsulotlar</h3>
            {draft.chosen.length > 0 && (
              <button className="adm-btn adm-btn--ghost ml-auto" onClick={() => set({ chosen: [] })}>
                <Shuffle size={15} /> Tasodifiyga qaytarish
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="adm-label m-0">Rasmda nechta mahsulot</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  type="button"
                  className="grid size-9 place-items-center rounded-lg border text-sm font-extrabold"
                  style={{
                    borderColor: draft.count === n ? 'var(--brand)' : 'var(--line)',
                    background: draft.count === n ? 'var(--brand)' : 'var(--surface)',
                    color: draft.count === n ? 'var(--brand-ink)' : 'var(--ink)',
                  }}
                  aria-pressed={draft.count === n}
                  onClick={() => set({ count: n, chosen: draft.chosen.slice(0, n) })}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <p className="-mt-1 text-xs" style={{ color: 'var(--muted)' }}>
            {draft.chosen.length
              ? `${draft.chosen.length} ta tanlandi${draft.chosen.length < draft.count ? ` — qolgan ${draft.count - draft.chosen.length} tasi tasodifiy` : ''}. Tanlov keyingi bitta yuborishda ishlatiladi, keyin yana tasodifiy.`
              : `Har kuni ${draft.count} tasi tasodifiy tanlanadi. Xohlasangiz o‘zingiz tanlang — keyingi yuborishda shular chiqadi.`}
          </p>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
            {Array.from({ length: draft.count }, (_, i) => i).map((i) => {
              const id = draft.chosen[i]
              const p = id ? byDocId.get(id) : undefined
              if (!id) {
                return (
                  <button
                    key={i}
                    type="button"
                    className="grid min-h-36 place-items-center rounded-xl border-2 border-dashed p-2 text-xs font-bold"
                    style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
                    onClick={() => setPicking(true)}
                  >
                    <span className="grid place-items-center gap-1"><Plus size={18} /> {draft.chosen.length ? 'Qo‘shish' : 'Tasodifiy'}</span>
                  </button>
                )
              }
              return (
                <div key={id} className="relative grid gap-1 rounded-xl border p-2" style={{ borderColor: 'var(--brand)', background: 'var(--brand-soft)' }}>
                  <button
                    type="button"
                    aria-label="Olib tashlash"
                    className="absolute right-1 top-1 grid size-6 place-items-center rounded-full"
                    style={{ background: 'var(--surface)', color: 'var(--muted)' }}
                    onClick={() => set({ chosen: draft.chosen.filter((x) => x !== id) })}
                  >
                    <X size={14} />
                  </button>
                  <span className="grid h-20 place-items-center overflow-hidden rounded-lg" style={{ background: '#fff' }}>
                    {p && productThumb(p) ? <img src={productThumb(p)} alt="" className="size-full object-contain" /> : <Package size={20} style={{ color: 'var(--faint)' }} />}
                  </span>
                  <span className="line-clamp-2 text-xs font-bold">{p?.name ?? 'O‘chirilgan mahsulot'}</span>
                  {p && <span className="text-xs font-extrabold" style={{ color: 'var(--brand-strong)' }}>{formatPrice(p.price * (p.pack && p.pack > 1 ? p.pack : 1))}{p.pack && p.pack > 1 ? ` · ${p.pack} dona` : ''}</span>}
                </div>
              )
            })}
          </div>
        </section>

        {/* ── Matnlar ── */}
        <section className="adm-card grid gap-3 p-4">
          <h3 className="flex items-center gap-2 text-sm font-extrabold"><Sparkles size={16} /> Rasmdagi sarlavha</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Oq qator" value={draft.title} max={40} onChange={(title) => set({ title })} />
            <Field label="Sariq qator" value={draft.accent} max={40} onChange={(accent) => set({ accent })} />
          </div>
          <h3 className="mt-2 text-sm font-extrabold">Xabar matni</h3>
          <p className="-mt-2 text-xs" style={{ color: 'var(--muted)' }}>
            Ostiga {draft.count} ta mahsulot nomi va narxi avtomatik qo‘shiladi. HTML: &lt;b&gt;qalin&lt;/b&gt;, &lt;i&gt;qiya&lt;/i&gt;.
          </p>
          <Area label="O‘zbekcha" value={draft.text} onChange={(text) => set({ text })} />
          <Area label="Ruscha (ixtiyoriy — rus tilini tanlaganlarga)" value={draft.textRu} onChange={(textRu) => set({ textRu })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tugma (o‘zbekcha)" value={draft.button} max={40} onChange={(button) => set({ button })} />
            <Field label="Tugma (ruscha)" value={draft.buttonRu} max={40} onChange={(buttonRu) => set({ buttonRu })} />
          </div>
        </section>

        <div className="flex flex-wrap gap-2">
          <button className="adm-btn adm-btn--primary" onClick={() => void save()} disabled={!!busy || !dirty}>
            {busy === 'save' ? <Loader2 size={16} className="animate-spin" /> : null} Saqlash
          </button>
          <button className="adm-btn adm-btn--ghost" onClick={() => void run<Preview>('preview', 'daily.preview', setPreview)} disabled={!!busy}>
            {busy === 'preview' ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />} Namunani ko‘rish
          </button>
          <button className="adm-btn adm-btn--ghost" onClick={() => void run<{ sent: number }>('test', 'daily.test', () => show('Telegram’ingizga yuborildi'))} disabled={!!busy}>
            {busy === 'test' ? <Loader2 size={16} className="animate-spin" /> : <Smartphone size={16} />} Menga sinab yuborish
          </button>
          <button className="adm-btn adm-btn--ghost" onClick={() => setConfirmSend(true)} disabled={!!busy}>
            {busy === 'send' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Hozir hammaga
          </button>
        </div>
        {dirty && <p className="text-xs font-bold" style={{ color: 'var(--warning)' }}>O‘zgarishlar hali saqlanmagan.</p>}
      </div>

      {/* ── Oxirgi yuborish ── */}
      <aside className="adm-card grid content-start gap-3 p-4">
        <h3 className="text-sm font-extrabold">Oxirgi yuborish</h3>
        {info.settings.lastImage ? (
          <a href={info.settings.lastImage} target="_blank" rel="noreferrer">
            <img src={info.settings.lastImage} alt="" className="w-full rounded-xl" />
          </a>
        ) : (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Hali yuborilmagan.</p>
        )}
        <dl className="grid gap-1.5 text-sm">
          <Row label="Sana" value={day(info.settings.lastDay)} />
          <Row label="Bugun" value={sentToday ? 'yuborilgan' : info.settings.enabled ? `${info.settings.time} da yuboriladi` : 'o‘chiq'} />
          {job && <Row label="Holati" value={JOB_STATUS[job.status] ?? job.status} />}
          {job && <Row label="Mijozlarga" value={`${job.sent} ta${job.failed ? ` · ${job.failed} ta yetmadi` : ''}`} />}
          {job?.channelLink && (
            <Row label="Kanal" value={<a href={job.channelLink} target="_blank" rel="noreferrer" style={{ color: 'var(--brand)' }}>postni ochish</a>} />
          )}
        </dl>
        {[info.settings.lastError, job?.error, job?.channelError].filter(Boolean).map((e) => (
          <p key={String(e)} className="flex gap-2 rounded-xl p-2.5 text-xs font-semibold" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
            <TriangleAlert size={14} className="shrink-0" /> {e}
          </p>
        ))}
        <button className="adm-btn adm-btn--ghost" onClick={() => void load()}>Yangilash</button>
      </aside>

      {preview && (
        <Modal title="Namuna" onClose={() => setPreview(null)} wide>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <img src={preview.image} alt="" className="w-full rounded-xl" />
            <div className="grid content-start gap-3">
              <div className="whitespace-pre-wrap rounded-xl p-3 text-sm" style={{ background: 'var(--surface-2)' }} dangerouslySetInnerHTML={{ __html: preview.text }} />
              {preview.textRu && (
                <div className="whitespace-pre-wrap rounded-xl p-3 text-sm" style={{ background: 'var(--surface-2)' }} dangerouslySetInnerHTML={{ __html: preview.textRu }} />
              )}
              <span className="rounded-xl p-2.5 text-center text-sm font-bold" style={{ background: 'var(--brand)', color: 'var(--brand-ink)' }}>{draft.button}</span>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Mahsulotlar har safar tasodifiy tanlanadi — haqiqiy e’londa boshqalari chiqadi.</p>
            </div>
          </div>
        </Modal>
      )}

      {picking && (
        <ProductPicker
          products={products}
          chosen={draft.chosen}
          max={draft.count}
          onPick={(id) => {
            const chosen = draft.chosen.includes(id) ? draft.chosen.filter((x) => x !== id) : [...draft.chosen, id].slice(0, draft.count)
            set({ chosen })
            if (chosen.length >= draft.count) setPicking(false)
          }}
          onClose={() => setPicking(false)}
        />
      )}

      {confirmSend && (
        <ConfirmDialog
          title="Hozir hammaga yuborilsinmi?"
          message={`${[draft.customers && 'bot foydalanuvchilariga', draft.channel && 'kanalga'].filter(Boolean).join(' va ') || 'hech qayerga'} hozir yuboriladi. Bugungi avtomatik yuborish shu bilan almashadi.`}
          confirmLabel="Yuborish"
          onClose={() => setConfirmSend(false)}
          onConfirm={() => {
            setConfirmSend(false)
            void run<Info & { queued: string }>('send', 'daily.send', (next) => {
              setInfo(next)
              // Tanlov bir martalik — server tozaladi
              setDraft((d) => (d ? { ...d, chosen: [] } : d))
              show('Navbatga qo‘yildi — bir daqiqa ichida yuboriladi')
            })
          }}
        />
      )}
      {toast}
    </div>
  )
}

/** Rasm chizgich WebP ni o'qimaydi — asosiy rasmi PNG/JPG bo'lmagan mahsulot yaroqsiz. */
function unusable(p: ProductRow): string {
  if (p.active === false) return 'o‘chirilgan (mijozlarga ko‘rinmaydi)'
  if (!(p.price > 0)) return 'narxi yo‘q'
  if (typeof p.stock === 'number' && p.stock < (p.pack && p.pack > 1 ? p.pack : 1)) return 'omborda yo‘q'
  const url = p.images?.[0] || ''
  if (!url) return 'rasmi yo‘q'
  if (!/\.(png|jpe?g|jfif)$/i.test(decodeURIComponent(url.split('?')[0]))) return 'rasmi PNG/JPG emas'
  return ''
}

function ProductPicker({ products, chosen, max, onPick, onClose }: {
  products: ProductRow[]
  chosen: string[]
  max: number
  onPick: (docId: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return products.filter((p) => !needle || p.name.toLowerCase().includes(needle) || String(p.id).includes(needle))
  }, [products, query])
  const full = chosen.length >= max

  return (
    <Modal title={`Mahsulot tanlash · ${chosen.length}/${max}`} onClose={onClose} wide>
      <div className="relative mb-3">
        <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--faint)' }} />
        <input autoFocus className="adm-input icon-left" placeholder="Nomi yoki ID bo‘yicha qidirish..." value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <ul className="grid max-h-[60vh] gap-1.5 overflow-y-auto">
        {visible.map((p) => {
          const on = chosen.includes(p.docId)
          const why = unusable(p)
          const disabled = !on && (Boolean(why) || full)
          return (
            <li key={p.docId}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(p.docId)}
                className="flex w-full items-center gap-3 rounded-xl border p-2 text-left"
                style={{
                  borderColor: on ? 'var(--brand)' : 'var(--line)',
                  background: on ? 'var(--brand-soft)' : 'var(--surface)',
                  opacity: disabled ? 0.5 : 1,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                }}
              >
                <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg" style={{ background: '#fff' }}>
                  {productThumb(p) ? <img src={productThumb(p)} alt="" className="size-full object-contain" /> : <Package size={18} style={{ color: 'var(--faint)' }} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{p.name}</span>
                  <span className="block text-xs" style={{ color: why ? 'var(--danger)' : 'var(--muted)' }}>
                    {formatPrice(p.price * (p.pack && p.pack > 1 ? p.pack : 1))}{p.pack && p.pack > 1 ? ` · ${p.pack} dona` : ''}{why ? ` · ${why}` : typeof p.stock === 'number' ? ` · omborda ${p.stock}` : ''}
                  </span>
                </span>
                {on && <b className="shrink-0 text-xs" style={{ color: 'var(--brand-strong)' }}>✓ {chosen.indexOf(p.docId) + 1}</b>}
              </button>
            </li>
          )
        })}
        {visible.length === 0 && <li className="p-4 text-center text-sm" style={{ color: 'var(--muted)' }}>Topilmadi</li>}
      </ul>
      <button className="adm-btn adm-btn--primary mt-3 w-full" onClick={onClose}>Tayyor</button>
    </Modal>
  )
}

function Toggle({ icon, label, hint, checked, onChange }: { icon: React.ReactNode; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="adm-ch-toggle">
      <span className="adm-ch-toggle__icon">{icon}</span>
      <span className="min-w-0 flex-1">
        <b>{label}</b>
        <span>{hint}</span>
      </span>
      <input type="checkbox" className="adm-ch-switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

function Field({ label, value, max, onChange }: { label: string; value: string; max: number; onChange: (v: string) => void }) {
  return (
    <label className="grid gap-1">
      <span className="adm-label m-0">{label}</span>
      <input className="adm-input" value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

function Area({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="grid gap-1">
      <span className="adm-label m-0">{label}</span>
      <textarea className="adm-input" rows={4} maxLength={700} value={value} onChange={(e) => onChange(e.target.value)} style={{ resize: 'vertical' }} />
    </label>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt style={{ color: 'var(--muted)' }}>{label}</dt>
      <dd className="text-right font-bold">{value}</dd>
    </div>
  )
}
