import { Eye, ExternalLink, ImagePlus, Loader2, Plus, Smartphone, Trash2, X } from 'lucide-react'
import { useMemo, useState, type ChangeEvent } from 'react'
import { uploadBroadcastMedia, type UploadedAdMedia } from '../lib/storage'
import { useCategories, useProducts, useSections } from '../lib/live'
import {
  COLORS, MAX_BUTTONS, NEW_BUTTON, TARGETS, buttonError, type ButtonDraft,
} from '../lib/post-draft'

/**
 * Xabar muharririning umumiy qismlari — «Ommaviy xabar» (botda mijozlarga)
 * va «Kanal» (Telegram kanaliga e'lon) sahifalari birga ishlatadi:
 * rasm/video, inline tugmalar (havola yoki ilovaning kerakli joyi, rangi)
 * va Telegram'dagidek ko'rinish.
 */

// ─── Rasm yoki video ──────────────────────────────────────────

export function MediaField({
  media, onChange, disabled, onError, onBusy,
}: {
  media: UploadedAdMedia | null
  onChange: (media: UploadedAdMedia | null) => void
  disabled?: boolean
  onError: (message: string) => void
  /** Yuklash davomida yuborish tugmasi o'chib tursin. */
  onBusy?: (busy: boolean) => void
}) {
  const [uploading, setUploadingState] = useState(false)
  const setUploading = (busy: boolean) => {
    setUploadingState(busy)
    onBusy?.(busy)
  }

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      onChange(await uploadBroadcastMedia(file))
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Yuklab bo‘lmadi')
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <p className="adm-label">Rasm yoki video <span style={{ color: 'var(--faint)' }}>(ixtiyoriy)</span></p>
      {media ? (
        <div className="adm-bc-media">
          {media.type === 'image'
            ? <img src={media.url} alt="" />
            : <video src={media.url} controls playsInline preload="metadata" />}
          <button
            type="button"
            className="adm-bc-media__remove"
            onClick={() => onChange(null)}
            disabled={disabled}
            aria-label="Olib tashlash"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <label className={'adm-bc-add ' + (uploading ? 'is-busy' : '')}>
          {uploading ? <Loader2 size={20} className="animate-spin" /> : <ImagePlus size={20} />}
          <span className="text-sm font-bold">{uploading ? 'Yuklanmoqda…' : 'Rasm yoki video yuklash'}</span>
          <span className="text-xs" style={{ color: 'var(--muted)' }}>Rasm: JPG/PNG · Video: MP4, 20 MB gacha</span>
          <input
            type="file"
            accept="image/*,video/mp4,video/webm,video/quicktime"
            className="sr-only"
            onChange={pick}
            disabled={uploading || disabled}
          />
        </label>
      )}
    </>
  )
}

// ─── Tugmalar ─────────────────────────────────────────────────

export function ButtonsEditor({
  buttons, onChange, disabled, channel,
}: {
  buttons: ButtonDraft[]
  onChange: (buttons: ButtonDraft[]) => void
  disabled?: boolean
  /** Kanal uchun: ruscha yorliq kerak emas (kanalda bitta matn). */
  channel?: boolean
}) {
  const { products } = useProducts()
  const { categories } = useCategories()
  const { sections } = useSections()
  const sortedProducts = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name)), [products])
  const edit = (index: number, patch: Partial<ButtonDraft>) =>
    onChange(buttons.map((b, i) => (i === index ? { ...b, ...patch } : b)))

  return (
    <>
      <p className="adm-label mt-4">
        Tugmalar <span style={{ color: 'var(--faint)' }}>(ixtiyoriy, {MAX_BUTTONS} tagacha)</span>
      </p>
      <div className="flex flex-col gap-2">
        {buttons.map((b, index) => {
          const error = buttonError(b)
          return (
            <div key={index} className="adm-bc-btn">
              <div className="flex items-center gap-2">
                <div className="adm-bc-kind">
                  <button type="button" className={b.kind === 'app' ? 'active' : ''} onClick={() => edit(index, { kind: 'app' })}>
                    <Smartphone size={13} /> Ilovada ochish
                  </button>
                  <button type="button" className={b.kind === 'url' ? 'active' : ''} onClick={() => edit(index, { kind: 'url' })}>
                    <ExternalLink size={13} /> Havola
                  </button>
                </div>
                <button
                  type="button"
                  className="adm-icon-btn adm-icon-btn--danger ml-auto"
                  onClick={() => onChange(buttons.filter((_, i) => i !== index))}
                  aria-label="Tugmani o‘chirish"
                  disabled={disabled}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className={'mt-2 grid gap-2 ' + (channel ? '' : 'sm:grid-cols-2')}>
                <input
                  className="adm-input"
                  value={b.text}
                  onChange={(e) => edit(index, { text: e.target.value })}
                  placeholder="Tugma matni — 🛒 Buyurtma berish"
                  maxLength={64}
                  disabled={disabled}
                />
                {!channel && (
                  <input
                    className="adm-input"
                    value={b.textRu}
                    onChange={(e) => edit(index, { textRu: e.target.value })}
                    placeholder="Ruscha (ixtiyoriy) — 🛒 Заказать"
                    maxLength={64}
                    disabled={disabled}
                  />
                )}
                {b.kind === 'url' && (
                  <input
                    className={'adm-input ' + (channel ? '' : 'sm:col-span-2')}
                    value={b.url}
                    onChange={(e) => edit(index, { url: e.target.value })}
                    placeholder="https://instagram.com/…"
                    inputMode="url"
                    disabled={disabled}
                  />
                )}
              </div>

              {/* Mini ilovada qayer ochilsin */}
              {b.kind === 'app' && (
                <>
                  <p className="adm-bc-sub">Bosilganda ochiladi:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {TARGETS.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        className={'adm-chip ' + (b.target === t.key ? 'active' : '')}
                        onClick={() => edit(index, { target: t.key, value: '' })}
                        disabled={disabled}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  {b.target === 'category' && (
                    <select className="adm-input mt-2" value={b.value} onChange={(e) => edit(index, { value: e.target.value })}>
                      <option value="">Kategoriyani tanlang…</option>
                      {categories.map((c) => <option key={String(c.id)} value={c.name}>{c.name}</option>)}
                    </select>
                  )}
                  {b.target === 'section' && (
                    <select className="adm-input mt-2" value={b.value} onChange={(e) => edit(index, { value: e.target.value })}>
                      <option value="">Bo‘limni tanlang…</option>
                      {/* Kategoriya bo'yicha guruhlangan — bir xil nomli bo'limlar adashmasin */}
                      {categories.map((c) => {
                        const list = sections.filter((s) => s.category === c.name)
                        return list.length ? (
                          <optgroup key={String(c.id)} label={c.name}>
                            {list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </optgroup>
                        ) : null
                      })}
                    </select>
                  )}
                  {b.target === 'product' && (
                    <select className="adm-input mt-2" value={b.value} onChange={(e) => edit(index, { value: e.target.value })}>
                      <option value="">Mahsulotni tanlang…</option>
                      {sortedProducts.map((p) => <option key={p.docId} value={String(p.id)}>{p.name}</option>)}
                    </select>
                  )}
                </>
              )}

              {/* Tugma rangi — Telegram'ning o'zi shu uch rangni beradi */}
              <p className="adm-bc-sub">Rangi:</p>
              <div className="flex flex-wrap gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c.key || 'default'}
                    type="button"
                    className={'adm-chip inline-flex items-center gap-1.5 ' + (b.style === c.key ? 'active' : '')}
                    onClick={() => edit(index, { style: c.key })}
                    disabled={disabled}
                  >
                    <span className="adm-bc-swatch" style={{ background: c.swatch }} /> {c.label}
                  </button>
                ))}
              </div>

              {error && (b.text || b.url || b.target !== 'home') && (
                <p className="mt-1.5 text-xs" style={{ color: 'var(--danger)' }}>{error}</p>
              )}
            </div>
          )
        })}
        {buttons.length < MAX_BUTTONS && (
          <button
            type="button"
            className="adm-btn adm-btn--ghost self-start"
            onClick={() => onChange([...buttons, { ...NEW_BUTTON }])}
            disabled={disabled}
          >
            <Plus size={16} /> Tugma qo‘shish
          </button>
        )}
      </div>
    </>
  )
}

// ─── Ko'rinish ────────────────────────────────────────────────

export function PostPreview({
  media, text, buttons, channel,
}: {
  media: UploadedAdMedia | null
  text: string
  buttons: ButtonDraft[]
  /** Kanal posti: tepada kanal nomi, pastda ko'rishlar belgisi. */
  channel?: { title: string } | null
}) {
  const body = text.trim()
  return (
    <div className={'adm-bc-preview' + (channel ? ' is-channel' : '')}>
      <div className="adm-bc-preview__bubble">
        {channel && <span className="adm-bc-preview__from">{channel.title || 'Kanal'}</span>}
        {media && (media.type === 'image'
          ? <img src={media.url} alt="" />
          : <video src={media.url} muted playsInline preload="metadata" />)}
        {(body || !media) && <p>{body || 'Xabar matni shu yerda ko‘rinadi...'}</p>}
        {channel && (
          <span className="adm-bc-preview__meta">
            <Eye size={11} /> 1 · {new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
      {buttons.map((b, i) => (
        <span key={i} className={'adm-bc-preview__btn' + (b.style ? ` is-${b.style}` : '')}>
          {b.text.trim() || 'Tugma'}
          {b.kind === 'url' ? <ExternalLink size={11} /> : <Smartphone size={11} />}
        </span>
      ))}
    </div>
  )
}
