import {
  BookmarkPlus, CalendarClock, ChevronDown, Loader2, MousePointerClick, Package, Search, ShoppingBag, Trash2, Wallet, Zap,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { apiPost } from '../lib/api'
import { useProducts, usePromotions } from '../lib/live'
import { productDraft, toButtonDraft, type ButtonDraft } from '../lib/post-draft'
import type { UploadedAdMedia } from '../lib/storage'
import { bestPromotion, isRunning } from '../../utils/promotions'
import { Modal } from './Modal'
import { localInput } from '../lib/schedule'
import { shortDate } from '../lib/dates'

/**
 * Muharrir yordamchilari — Kanal va Ommaviy xabar sahifalari uchun:
 * shablonlar, mahsulotdan to'ldirish, yuborish vaqti, natija qatori.
 */

export type Draft = {
  text: string
  textRu: string
  bilingual?: boolean
  media: UploadedAdMedia | null
  buttons: ButtonDraft[]
}

type Template = Draft & { id: string; name: string; updatedAt?: string }

// ─── Shablonlar ───────────────────────────────────────────────

export function TemplatesBar({
  current, onLoad, onError, onDone, disabled,
}: {
  current: Draft
  onLoad: (draft: Draft) => void
  onError: (message: string) => void
  onDone: (message: string) => void
  disabled?: boolean
}) {
  const [templates, setTemplates] = useState<Template[] | null>(null)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [naming, setNaming] = useState(false)

  const load = () => {
    apiPost<{ templates: Template[] }>('action', { action: 'template.list' })
      .then((r) => setTemplates(r.templates))
      .catch((e: unknown) => onError(e instanceof Error ? e.message : 'Shablonlar yuklanmadi'))
  }

  const toggle = () => {
    if (!open && templates === null) load()
    setOpen(!open)
  }

  const save = async () => {
    setSaving(true)
    try {
      const r = await apiPost<{ templates: Template[] }>('action', { action: 'template.save', name, ...current })
      setTemplates(r.templates)
      setNaming(false)
      setName('')
      onDone('Shablon saqlandi')
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Saqlanmadi')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    try {
      const r = await apiPost<{ templates: Template[] }>('action', { action: 'template.delete', id })
      setTemplates(r.templates)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'O‘chirilmadi')
    }
  }

  const empty = !current.text.trim() && !current.textRu.trim() && !current.media

  return (
    <div className="adm-tools">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="adm-btn adm-btn--ghost" onClick={toggle} disabled={disabled} aria-expanded={open}>
          <BookmarkPlus size={15} /> Shablonlar <ChevronDown size={14} className={open ? 'rotate-180' : ''} />
        </button>
        <button type="button" className="adm-btn adm-btn--ghost" onClick={() => setNaming(true)} disabled={disabled || empty}>
          Shablon sifatida saqlash
        </button>
      </div>

      {naming && (
        <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void save() }}>
          <input
            className="adm-input flex-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Shablon nomi — masalan «Dam olish kunlari»"
            maxLength={60}
            autoFocus
          />
          <button type="submit" className="adm-btn adm-btn--primary" disabled={saving || !name.trim()}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : 'Saqlash'}
          </button>
          <button type="button" className="adm-btn adm-btn--ghost" onClick={() => setNaming(false)}>Bekor</button>
        </form>
      )}

      {open && (
        <div className="adm-tools__list">
          {templates === null ? (
            <p className="p-2 text-xs" style={{ color: 'var(--muted)' }}><Loader2 size={13} className="inline animate-spin" /> Yuklanmoqda…</p>
          ) : templates.length === 0 ? (
            <p className="p-2 text-xs" style={{ color: 'var(--muted)' }}>
              Hali shablon yo‘q. Xabarni yozib, «Shablon sifatida saqlash» ni bosing.
            </p>
          ) : (
            templates.map((t) => (
              <div key={t.id} className="adm-tools__item">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    onLoad({
                      text: t.text ?? '',
                      textRu: t.textRu ?? '',
                      bilingual: Boolean(t.bilingual),
                      media: t.media ?? null,
                      buttons: (t.buttons ?? []).map(toButtonDraft),
                    })
                    setOpen(false)
                    onDone(`«${t.name}» yuklandi`)
                  }}
                >
                  <b className="block truncate text-sm">{t.name}</b>
                  <span className="block truncate text-xs" style={{ color: 'var(--muted)' }}>
                    {(t.text || t.textRu || '').replace(/<[^>]+>/g, '').slice(0, 90) || (t.media ? 'Rasm/video' : '')}
                  </span>
                </button>
                <button
                  type="button"
                  className="adm-icon-btn adm-icon-btn--danger"
                  onClick={() => void remove(t.id)}
                  aria-label={`«${t.name}» shablonini o‘chirish`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── Mahsulotdan to'ldirish ───────────────────────────────────

export function ProductFillButton({ onFill, disabled }: { onFill: (draft: Draft) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="adm-btn adm-btn--ghost" onClick={() => setOpen(true)} disabled={disabled}>
        <Package size={15} /> Mahsulotdan e’lon
      </button>
      {open && <ProductPicker onClose={() => setOpen(false)} onPick={(d) => { onFill(d); setOpen(false) }} />}
    </>
  )
}

function ProductPicker({ onClose, onPick }: { onClose: () => void; onPick: (draft: Draft) => void }) {
  const { products } = useProducts()
  const { promotions } = usePromotions()
  const [search, setSearch] = useState('')
  // Aksiya narxi — sahifa ochilgan paytdagi holat bo'yicha
  const [now] = useState(() => Date.now())
  const running = useMemo(() => promotions.filter((p) => isRunning(p, now)), [promotions, now])

  const needle = search.trim().toLowerCase()
  const list = products
    .filter((p) => !needle || p.name.toLowerCase().includes(needle) || (p.nameRu ?? '').toLowerCase().includes(needle))
    .slice(0, 60)

  return (
    <Modal title="Qaysi mahsulot haqida?" onClose={onClose}>
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--faint)' }} />
        <input
          className="adm-input icon-left"
          placeholder="Mahsulot nomi…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>
      <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
        Rasm, nom, vazn, narx (aksiya bo‘lsa — chegirma bilan) va «Buyurtma berish» tugmasi tayyor bo‘lib tushadi. Keyin xohlagancha o‘zgartirasiz.
      </p>
      <div className="adm-pick-products">
        {list.map((p) => {
          const promo = bestPromotion(running, { id: p.docId, category: p.category, sectionId: p.sectionId })
          const image = p.thumbs?.[0] || p.images?.[0]
          return (
            <button
              key={p.docId}
              type="button"
              className="adm-pick-products__item"
              onClick={() => onPick(productDraft(p, promo))}
            >
              <span className="adm-pick-products__img">{image ? <img src={image} alt="" loading="lazy" /> : <Package size={18} />}</span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-sm">{p.name}</b>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  {p.price.toLocaleString('ru-RU')} so‘m{promo ? ` · 🔥 −${promo.percent}%` : ''}
                </span>
              </span>
            </button>
          )
        })}
        {list.length === 0 && <p className="p-3 text-sm" style={{ color: 'var(--muted)' }}>Topilmadi</p>}
      </div>
    </Modal>
  )
}

// ─── Yuborish vaqti ───────────────────────────────────────────

export function SchedulePicker({
  enabled, onEnabled, value, onChange, disabled,
}: {
  enabled: boolean
  onEnabled: (value: boolean) => void
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  // Eng erta vaqt — ochilgan paytdan 1 daqiqa keyin (render sof qolsin)
  const [min] = useState(() => localInput(Date.now() + 60_000))
  // Tez tanlovlar: bugun kechqurun, ertaga ertalab
  const [presets] = useState(() => {
    const now = new Date()
    const tonight = new Date(now); tonight.setHours(19, 0, 0, 0)
    if (tonight.getTime() < now.getTime() + 10 * 60_000) tonight.setDate(tonight.getDate() + 1)
    const morning = new Date(now); morning.setDate(morning.getDate() + 1); morning.setHours(9, 0, 0, 0)
    return [
      { label: '1 soatdan keyin', ms: now.getTime() + 60 * 60_000 },
      { label: tonight.getDate() === now.getDate() ? 'Bugun 19:00' : 'Ertaga 19:00', ms: tonight.getTime() },
      { label: 'Ertaga 09:00', ms: morning.getTime() },
    ]
  })
  return (
    <div className="adm-sched">
      <div className="adm-bc-kind">
        <button type="button" className={!enabled ? 'active' : ''} onClick={() => onEnabled(false)} disabled={disabled}>
          <Zap size={13} /> Hozir
        </button>
        <button type="button" className={enabled ? 'active' : ''} onClick={() => onEnabled(true)} disabled={disabled}>
          <CalendarClock size={13} /> Vaqtini belgilash
        </button>
      </div>
      {enabled && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="datetime-local"
            className="adm-input w-auto"
            value={value}
            min={min}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            aria-label="Yuborish vaqti"
          />
          {presets.map((p) => (
            <button key={p.label} type="button" className="adm-chip" onClick={() => onChange(localInput(p.ms))} disabled={disabled}>
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Natija qatori ────────────────────────────────────────────

export type CampaignStats = { clicks: number; opens: number; orders: number; revenue: number } | null

export function StatsLine({ stats, sent }: { stats: CampaignStats; sent?: number }) {
  if (!stats) return null
  const conversion = stats.clicks ? Math.round((stats.orders / stats.clicks) * 100) : 0
  return (
    <span className="adm-stats-line">
      {sent !== undefined && <span title="Yetkazildi">✉️ {sent}</span>}
      <span title="Tugmani bosganlar"><MousePointerClick size={11} /> {stats.clicks}</span>
      <span title={`Buyurtmalar (bosganlarning ${conversion}%)`}><ShoppingBag size={11} /> {stats.orders}</span>
      {stats.revenue > 0 && <span title="Shu e’londan kelgan tushum"><Wallet size={11} /> {stats.revenue.toLocaleString('ru-RU')}</span>}
    </span>
  )
}

// ─── Rejalashtirilganlar ro'yxati ─────────────────────────────

export type ScheduledRow = {
  id: string
  runAt: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled'
  channel: boolean
  customers: boolean
  audience?: string
  total?: number
  recipientsCount?: number | null
  origin?: string
  by?: string
  error?: string | null
  post?: { text?: string; textRu?: string; media?: { type: string; url: string } | null }
  progress?: { sent?: number; failed?: number; channelLink?: string | null; channelError?: string | null }
}

const STATUS: Record<ScheduledRow['status'], { label: string; tone: string }> = {
  pending: { label: 'Kutilmoqda', tone: 'var(--brand)' },
  running: { label: 'Yuborilmoqda', tone: '#2f80ed' },
  done: { label: 'Yuborildi', tone: 'var(--muted)' },
  failed: { label: 'Xato', tone: 'var(--danger)' },
  cancelled: { label: 'Bekor qilingan', tone: 'var(--faint)' },
}

export function ScheduledList({
  rows, filter, onCancel,
}: {
  rows: ScheduledRow[]
  /** Faqat shu turdagilar: kanal sahifasi — kanalga ketadiganlar va h.k. */
  filter: (row: ScheduledRow) => boolean
  onCancel: (row: ScheduledRow) => void
}) {
  const list = rows.filter(filter)
  if (!list.length) return null
  return (
    <div className="adm-card p-4">
      <h2 className="flex items-center gap-2 text-sm font-extrabold"><CalendarClock size={16} /> Rejalashtirilgan</h2>
      <ul className="mt-2 flex flex-col">
        {list.map((row) => {
          const s = STATUS[row.status]
          const text = (row.post?.text || row.post?.textRu || '').replace(/<[^>]+>/g, '').slice(0, 110)
          return (
            <li key={row.id} className="adm-ch-post">
              <span className="adm-ch-post__thumb">
                {row.post?.media?.type === 'image' ? <img src={row.post.media.url} alt="" loading="lazy" /> : <CalendarClock size={16} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="adm-ch-post__text">{text || 'Rasm/video'}</p>
                <p className="adm-ch-post__meta">
                  <b style={{ color: s.tone }}>{s.label}</b>
                  {' · '}{shortDate(row.runAt)}
                  {' · '}{[row.channel && 'kanal', row.customers && `${row.recipientsCount ?? 'hamma'} mijoz`].filter(Boolean).join(' + ')}
                  {row.origin === 'promotion' && ' · aksiya e’loni'}
                  {row.progress?.sent ? ` · ✉️ ${row.progress.sent}` : ''}
                  {row.error && <span style={{ color: 'var(--danger)' }}> · {row.error}</span>}
                  {row.progress?.channelError && <span style={{ color: 'var(--danger)' }}> · kanal: {row.progress.channelError}</span>}
                </p>
              </div>
              {row.status === 'pending' && (
                <button type="button" className="adm-icon-btn adm-icon-btn--danger" onClick={() => onCancel(row)} aria-label="Bekor qilish" title="Bekor qilish">
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
