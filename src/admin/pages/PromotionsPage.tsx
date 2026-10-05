import { CalendarClock, Flame, ImagePlus, Loader2, Megaphone, Pause, Pencil, Play, Plus, Search, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatPrice } from '../../data'
import { apiPost } from '../lib/api'
import { uploadBroadcastMedia } from '../lib/storage'
import { useCategories, useProducts, usePromotions, useSections } from '../lib/live'
import { ConfirmDialog, Modal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { bestPromotion, promoPrice, type Promotion } from '../../utils/promotions'

type Target = Promotion['target']

type Draft = {
  id?: string
  title: string
  percent: string
  target: Target
  targetIds: string[]
  startsAt: string
  endsAt: string
  active: boolean
  /** Boshlanganda e'lon: kanalga / mijozlarga, ixtiyoriy rasm bilan. */
  announceChannel: boolean
  announceCustomers: boolean
  announceImage: string | null
}

/** Mavjud aksiya → forma. */
const toDraft = (promo: Promotion, patch: Partial<Draft> = {}): Draft => ({
  id: promo.id,
  title: promo.title,
  percent: String(promo.percent),
  target: promo.target,
  targetIds: promo.targetIds,
  startsAt: toLocalInput(new Date(promo.startsAt)),
  endsAt: toLocalInput(new Date(promo.endsAt)),
  active: promo.active,
  announceChannel: Boolean(promo.announce?.channel),
  announceCustomers: Boolean(promo.announce?.customers),
  announceImage: promo.announce?.image ?? null,
  ...patch,
})

const TARGETS: { key: Target; label: string }[] = [
  { key: 'all', label: 'Barcha mahsulotlar' },
  { key: 'category', label: 'Kategoriya' },
  { key: 'section', label: 'Bo‘lim' },
  { key: 'products', label: 'Aniq mahsulotlar' },
]

/** `<input type="datetime-local">` qiymati — mahalliy vaqtda. */
const toLocalInput = (date: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`
}
const pretty = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

type State = { key: 'running' | 'scheduled' | 'ended' | 'paused'; label: string; color: string; bg: string }
function stateOf(promo: Promotion, now: number): State {
  if (!promo.active) return { key: 'paused', label: 'To‘xtatilgan', color: 'var(--muted)', bg: 'var(--surface-3)' }
  if (Date.parse(promo.endsAt) <= now) return { key: 'ended', label: 'Tugagan', color: 'var(--faint)', bg: 'var(--surface-2)' }
  if (Date.parse(promo.startsAt) > now) return { key: 'scheduled', label: 'Rejalashtirilgan', color: 'var(--info)', bg: 'var(--info-soft)' }
  return { key: 'running', label: 'Hozir ishlayapti', color: 'var(--brand-strong)', bg: 'var(--brand-soft)' }
}

function leftText(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  const d = Math.floor(minutes / 1440), h = Math.floor((minutes % 1440) / 60), m = minutes % 60
  if (d) return `${d} kun ${h} soat`
  if (h) return `${h} soat ${m} daqiqa`
  return `${m} daqiqa`
}

/**
 * Vaqtli aksiyalar: «Juma 18:00 dan yakshanba 23:59 gacha muzqaymoq −20%».
 *
 * Aksiya o'zi boshlanadi va o'zi tugaydi. Mijoz ilovasida narx chegirmali
 * bo'lib, eski narxi chizilgan holda ko'rinadi, bosh sahifada taymerli
 * banner chiqadi. Buyurtma narxini server hisoblaydi — aksiya tugagan
 * soniyadan boshlab chegirma qo'llanmaydi.
 */
export function PromotionsPage() {
  const { promotions, loading, error } = usePromotions()
  const { products } = useProducts()
  const { categories } = useCategories()
  const { sections } = useSections()
  const { show, node: toast } = useToast()

  const [draft, setDraft] = useState<Draft | null>(null)
  const [removing, setRemoving] = useState<Promotion | null>(null)
  const [busy, setBusy] = useState(false)
  const [now] = useState(() => Date.now())

  const affected = (promo: Pick<Promotion, 'target' | 'targetIds'>) =>
    products.filter((p) => bestPromotion(
      [{ ...promo, id: '', title: '', percent: 1, startsAt: '2000-01-01', endsAt: '2999-01-01', active: true }],
      { id: p.docId, category: p.category, sectionId: p.sectionId },
    ))

  const openNew = () => {
    const start = new Date(now)
    start.setMinutes(0, 0, 0)
    start.setHours(start.getHours() + 1)
    const end = new Date(start)
    end.setDate(end.getDate() + 3)
    setDraft({
      title: '', percent: '15', target: 'all', targetIds: [], startsAt: toLocalInput(start), endsAt: toLocalInput(end), active: true,
      announceChannel: false, announceCustomers: false, announceImage: null,
    })
  }

  const save = async (next: Draft) => {
    setBusy(true)
    try {
      await apiPost('action', {
        action: 'promotion.save',
        id: next.id,
        title: next.title,
        percent: Number(next.percent),
        target: next.target,
        targetIds: next.targetIds,
        // Mahalliy vaqt → ISO (server UTC da saqlaydi)
        startsAt: new Date(next.startsAt).toISOString(),
        endsAt: new Date(next.endsAt).toISOString(),
        active: next.active,
        announce: next.announceChannel || next.announceCustomers
          ? { channel: next.announceChannel, customers: next.announceCustomers, image: next.announceImage }
          : null,
      })
      show(next.id ? 'Aksiya yangilandi' : 'Aksiya yaratildi')
      setDraft(null)
    } catch (error) {
      show(error instanceof Error ? error.message : 'Saqlanmadi', 'error')
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = (promo: Promotion) =>
    save(toDraft(promo, { active: !promo.active }))

  const remove = async () => {
    if (!removing) return
    setBusy(true)
    try {
      await apiPost('action', { action: 'promotion.delete', id: removing.id })
      show('Aksiya o‘chirildi')
      setRemoving(null)
    } catch (error) {
      show(error instanceof Error ? error.message : 'O‘chirilmadi', 'error')
    } finally {
      setBusy(false)
    }
  }

  const targetLabel = (promo: Promotion) => {
    if (promo.target === 'all') return 'Barcha mahsulotlar'
    if (promo.target === 'category') return promo.targetIds.join(', ')
    if (promo.target === 'section') return promo.targetIds.map((id) => sections.find((s) => s.id === id)?.name ?? '—').join(', ')
    return `${promo.targetIds.length} ta mahsulot`
  }

  return (
    <>
      <div className="adm-page-head">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Aksiya belgilangan vaqtda o‘zi boshlanadi va o‘zi tugaydi.
        </p>
        <div className="adm-page-head__actions">
          <button className="adm-btn adm-btn--primary" onClick={openNew}>
            <Plus size={17} /> Aksiya yaratish
          </button>
        </div>
      </div>

      {error && (
        <div className="adm-card mb-4 p-4" style={{ borderColor: 'var(--danger)', background: 'var(--danger-soft)' }}>
          <p className="text-sm font-extrabold" style={{ color: 'var(--danger)' }}>
            Aksiyalar saqlanyapti, lekin ko‘rinmayapti
          </p>
          <p className="mt-1 text-sm">
            {error === 'rules'
              ? 'Firestore qoidalarida «promotions» uchun ruxsat yo‘q. Firebase Console → Firestore → Rules ga loyihadagi firestore.rules faylini to‘liq qo‘yib, Publish bosing. Shu paytgacha mijoz ilovasi ham chegirmani ko‘rsatmaydi.'
              : 'Aksiyalarni o‘qib bo‘lmadi. Internetni tekshirib, sahifani yangilang.'}
          </p>
        </div>
      )}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="adm-skeleton h-36" />)}
        </div>
      ) : promotions.length === 0 ? (
        error ? null : <div className="adm-card adm-empty">
          <Flame size={30} />
          <p className="text-sm font-semibold">Hali aksiya yo‘q</p>
          <p className="max-w-sm text-xs">Masalan: «Hafta oxiri — muzqaymoqlar −20%», juma 18:00 dan yakshanba 23:59 gacha.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {promotions.map((promo) => {
            const state = stateOf(promo, now)
            const count = affected(promo).length
            return (
              <article key={promo.id} className={'adm-card adm-promo ' + (state.key === 'running' ? 'is-running' : '')}>
                <div className="flex items-start justify-between gap-3">
                  <span className="adm-promo__pct">−{promo.percent}%</span>
                  <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ color: state.color, background: state.bg }}>
                    {state.label}
                  </span>
                </div>
                <h3 className="mt-3 text-base font-extrabold">{promo.title}</h3>
                <p className="mt-1 truncate text-xs" style={{ color: 'var(--muted)' }}>
                  {targetLabel(promo)} · {count} ta mahsulot
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
                  <CalendarClock size={14} /> {pretty(promo.startsAt)} → {pretty(promo.endsAt)}
                </p>
                {state.key === 'running' && (
                  <p className="mt-1 text-xs font-bold" style={{ color: 'var(--brand-strong)' }}>
                    Tugashiga {leftText(Date.parse(promo.endsAt) - now)}
                  </p>
                )}
                {state.key === 'scheduled' && (
                  <p className="mt-1 text-xs font-bold" style={{ color: 'var(--info)' }}>
                    Boshlanishiga {leftText(Date.parse(promo.startsAt) - now)}
                  </p>
                )}
                {(promo.announce?.channel || promo.announce?.customers) && (
                  <p className="mt-1 flex items-center gap-1 text-xs font-bold" style={{ color: promo.announcedAt ? 'var(--muted)' : 'var(--brand)' }}>
                    <Megaphone size={12} />
                    {promo.announcedAt ? 'E’lon qilindi' : 'Boshlanganda e’lon qilinadi'}
                    {' — '}{[promo.announce.channel && 'kanal', promo.announce.customers && 'mijozlar'].filter(Boolean).join(' + ')}
                  </p>
                )}
                <div className="mt-3 flex gap-1.5">
                  <button className="adm-btn adm-btn--ghost flex-1" onClick={() => toggleActive(promo)} disabled={busy}>
                    {promo.active ? <><Pause size={15} /> To‘xtatish</> : <><Play size={15} /> Yoqish</>}
                  </button>
                  <button
                    className="grid size-9 place-items-center rounded-lg"
                    style={{ background: 'var(--surface-2)' }}
                    onClick={() => setDraft(toDraft(promo))}
                    aria-label="Tahrirlash"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="grid size-9 place-items-center rounded-lg"
                    style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
                    onClick={() => setRemoving(promo)}
                    aria-label="O‘chirish"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {draft && (
        <PromotionForm
          draft={draft}
          busy={busy}
          categories={categories.map((c) => c.name)}
          sections={sections}
          products={products}
          affected={affected}
          onChange={setDraft}
          onSave={() => save(draft)}
          onClose={() => setDraft(null)}
        />
      )}

      {removing && (
        <ConfirmDialog
          title="Aksiyani o‘chirish"
          message={`«${removing.title}» o‘chiriladi. Mahsulot narxlari darhol odatiy holiga qaytadi.`}
          confirmLabel="O‘chirish"
          busy={busy}
          onConfirm={remove}
          onClose={() => setRemoving(null)}
        />
      )}
      {toast}
    </>
  )
}

function PromotionForm({
  draft, busy, categories, sections, products, affected, onChange, onSave, onClose,
}: {
  draft: Draft
  busy: boolean
  categories: string[]
  sections: { id: string; name: string; category: string }[]
  products: ReturnType<typeof useProducts>['products']
  affected: (promo: Pick<Promotion, 'target' | 'targetIds'>) => ReturnType<typeof useProducts>['products']
  onChange: (draft: Draft) => void
  onSave: () => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch })
  const toggle = (id: string) =>
    set({ targetIds: draft.targetIds.includes(id) ? draft.targetIds.filter((x) => x !== id) : [...draft.targetIds, id] })

  const percent = Math.min(90, Math.max(0, Number(draft.percent) || 0))
  const hit = useMemo(() => affected(draft), [affected, draft])
  const sample = hit.slice(0, 4)

  const options: { id: string; label: string; hint?: string }[] =
    draft.target === 'category' ? categories.map((c) => ({ id: c, label: c }))
      : draft.target === 'section' ? sections.map((s) => ({ id: s.id, label: s.name, hint: s.category }))
        : draft.target === 'products'
          ? products
            .filter((p) => !query.trim() || p.name.toLowerCase().includes(query.trim().toLowerCase()))
            .slice(0, 80)
            .map((p) => ({ id: p.docId, label: p.name, hint: formatPrice(p.price) }))
          : []

  return (
    <Modal
      wide
      title={draft.id ? 'Aksiyani tahrirlash' : 'Yangi aksiya'}
      onClose={onClose}
      footer={
        <>
          <button className="adm-btn adm-btn--ghost flex-1" onClick={onClose} disabled={busy}>Bekor qilish</button>
          <button className="adm-btn adm-btn--primary flex-1" onClick={onSave} disabled={busy || !draft.title.trim() || !hit.length}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : null} Saqlash
          </button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
        <div>
          <label className="adm-label" htmlFor="promo-title">Aksiya nomi — mijoz shuni ko‘radi</label>
          <input id="promo-title" className="adm-input" value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="Hafta oxiri — muzqaymoqlar arzon" maxLength={80} />
        </div>
        <div>
          <label className="adm-label" htmlFor="promo-percent">Chegirma, %</label>
          {/*
            Ilgari qiymat 2 belgiga kesilardi: «15» turganda «50» yozilsa «155» → «15»
            bo'lib qolardi va aksiya nomida 50% bo'lsa ham 15% saqlanardi.
            Endi bosilganda matn belgilanadi (yozilgan son o'rnini bosadi), 90 dan
            kattasi 90 ga tushadi.
          */}
          <input
            id="promo-percent"
            className="adm-input"
            inputMode="numeric"
            value={draft.percent}
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '')
              set({ percent: digits ? String(Math.min(90, Number(digits))) : '' })
            }}
          />
          <div className="mt-1.5 flex flex-wrap gap-1">
            {[10, 15, 20, 30, 50].map((n) => (
              <button key={n} type="button" className={'adm-chip ' + (Number(draft.percent) === n ? 'active' : '')} style={{ padding: '2px 8px' }} onClick={() => set({ percent: String(n) })}>
                {n}%
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="adm-label" htmlFor="promo-start">Boshlanadi</label>
          <input id="promo-start" type="datetime-local" className="adm-input" value={draft.startsAt} onChange={(e) => set({ startsAt: e.target.value })} />
        </div>
        <div className="sm:col-span-1">
          <label className="adm-label" htmlFor="promo-end">Tugaydi</label>
          <input id="promo-end" type="datetime-local" className="adm-input" value={draft.endsAt} onChange={(e) => set({ endsAt: e.target.value })} />
        </div>
      </div>

      <p className="adm-label mt-4">Qaysi mahsulotlarga</p>
      <div className="flex flex-wrap gap-2">
        {TARGETS.map((t) => (
          <button key={t.key} type="button" className={'adm-chip ' + (draft.target === t.key ? 'active' : '')} onClick={() => set({ target: t.key, targetIds: [] })}>
            {t.label}
          </button>
        ))}
      </div>

      {draft.target === 'products' && (
        <div className="relative mt-3">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--faint)' }} />
          <input className="adm-input icon-left" placeholder="Mahsulot qidirish..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      )}
      {options.length > 0 && (
        <div className="adm-picklist">
          {options.map((o) => (
            <label key={o.id}>
              <input type="checkbox" checked={draft.targetIds.includes(o.id)} onChange={() => toggle(o.id)} />
              <span className="truncate">{o.label}</span>
              {o.hint && <small>{o.hint}</small>}
            </label>
          ))}
        </div>
      )}

      <label className="mt-4 flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={draft.active} onChange={(e) => set({ active: e.target.checked })} style={{ accentColor: 'var(--brand)' }} />
        Yoqilgan (vaqti kelganda o‘zi boshlanadi)
      </label>

      <AnnounceFields draft={draft} set={set} />

      <div className="adm-preview">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
          {hit.length} ta mahsulotga ta’sir qiladi
        </p>
        {sample.length ? (
          <ul className="grid gap-1.5 text-sm">
            {sample.map((p) => (
              <li key={p.docId} className="flex items-center justify-between gap-3">
                <span className="truncate">{p.name}</span>
                <span className="shrink-0">
                  <del className="mr-2 text-xs" style={{ color: 'var(--faint)' }}>{formatPrice(p.price)}</del>
                  <b style={{ color: 'var(--danger)' }}>{formatPrice(promoPrice(p.price, percent))}</b>
                </span>
              </li>
            ))}
            {hit.length > sample.length && <li className="text-xs" style={{ color: 'var(--muted)' }}>… va yana {hit.length - sample.length} ta</li>}
          </ul>
        ) : (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Mahsulot tanlanmagan.</p>
        )}
      </div>
    </Modal>
  )
}

/**
 * Aksiya boshlanganda avtomatik e'lon: kanalga va/yoki botda barcha
 * mijozlarga. Matn va «Aksiyadagi mahsulotlar» tugmasi o'zi tuziladi
 * (api/_lib/actions/scheduler.ts → promotionPost); rasm ixtiyoriy.
 */
function AnnounceFields({ draft, set }: { draft: Draft; set: (patch: Partial<Draft>) => void }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const on = draft.announceChannel || draft.announceCustomers

  const pick = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const media = await uploadBroadcastMedia(file)
      if (media.type !== 'image') throw new Error('Faqat rasm')
      set({ announceImage: media.url })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yuklab bo‘lmadi')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="adm-announce">
      <p className="flex items-center gap-2 text-sm font-extrabold"><Megaphone size={15} /> Boshlanganda e’lon qilish</p>
      <div className="mt-2 flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2 font-semibold">
          <input type="checkbox" checked={draft.announceChannel} onChange={(e) => set({ announceChannel: e.target.checked })} style={{ accentColor: 'var(--brand)' }} />
          Telegram kanalga
        </label>
        <label className="flex items-center gap-2 font-semibold">
          <input type="checkbox" checked={draft.announceCustomers} onChange={(e) => set({ announceCustomers: e.target.checked })} style={{ accentColor: 'var(--brand)' }} />
          Botda barcha mijozlarga
        </label>
      </div>
      {on && (
        <>
          <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
            Aksiya boshlangan daqiqada «🔥 {draft.title || 'Aksiya nomi'} — −{draft.percent || 0}% chegirma … gacha» matni va
            «🛒 Aksiyadagi mahsulotlar» tugmasi bilan yuboriladi (o‘zbekcha va ruscha). Bir marta.
          </p>
          <div className="mt-2 flex items-center gap-3">
            {draft.announceImage ? (
              <span className="adm-announce__img">
                <img src={draft.announceImage} alt="" />
                <button type="button" onClick={() => set({ announceImage: null })} aria-label="Rasmni olib tashlash"><X size={13} /></button>
              </span>
            ) : (
              <label className="adm-btn adm-btn--ghost cursor-pointer">
                {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />} Rasm qo‘shish (ixtiyoriy)
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }} disabled={uploading} />
              </label>
            )}
            {error && <span className="text-xs" style={{ color: 'var(--danger)' }}>{error}</span>}
          </div>
        </>
      )}
    </div>
  )
}
