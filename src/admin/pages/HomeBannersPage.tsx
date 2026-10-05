import { ArrowDown, ArrowUp, ImagePlus, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { apiPost } from '../lib/api'
import { uploadAdMedia } from '../lib/storage'
import { useCategories, useHomeBanners, useProducts, useSections } from '../lib/live'
import { ConfirmDialog, Modal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { HeroSlide } from '../../components/home/HeroSlide'
import { BANNER_THEMES, type BannerLayout, type BannerTarget, type BannerTheme, type HomeBanner } from '../../config/banners'

/**
 * Bosh sahifa bannerlari.
 *
 * Ilovadagi asosiy banner («Uydagidek ta'm — bir necha daqiqada») doim
 * birinchi turadi. Bu yerda qo'shilgan faol bannerlar undan keyin
 * karuselda almashadi — har 5 soniyada o'ngga suriladi.
 * Server: api/_lib/actions/home.ts (`home.banners`).
 */

const TARGETS: { key: BannerTarget; label: string }[] = [
  { key: 'catalog', label: 'Katalog' },
  { key: 'category', label: 'Kategoriya' },
  { key: 'section', label: 'Bo‘lim' },
  { key: 'product', label: 'Mahsulot' },
  { key: 'url', label: 'Havola' },
  { key: 'none', label: 'Hech narsa' },
]

const EMPTY: HomeBanner = {
  id: '', active: true, layout: 'side', theme: 'yellow', image: '',
  badge: '', badgeRu: '', title: '', titleRu: '', subtitle: '', subtitleRu: '', cta: '', ctaRu: '',
  target: 'catalog', value: '', url: '',
}

function problem(b: HomeBanner): string {
  if (b.layout === 'full' && !b.image) return '«To‘liq rasm» uchun rasm yuklang'
  if (!b.title.trim() && !b.image) return 'Sarlavha yoki rasm kerak'
  if (['category', 'section', 'product'].includes(b.target) && !b.value) return 'Bosilganda nima ochilishini tanlang'
  if (b.target === 'url' && !/^https?:\/\/\S+$/i.test(b.url.trim())) return 'Havola https:// bilan boshlansin'
  return ''
}

export function HomeBannersPage() {
  const { banners, loading } = useHomeBanners()
  const { show, node: toast } = useToast()
  const [editing, setEditing] = useState<{ index: number; draft: HomeBanner } | null>(null)
  const [removing, setRemoving] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async (next: HomeBanner[], message: string) => {
    setBusy(true)
    try {
      await apiPost('action', { action: 'home.banners', banners: next })
      show(message)
      return true
    } catch (error) {
      show(error instanceof Error ? error.message : 'Saqlanmadi', 'error')
      return false
    } finally {
      setBusy(false)
    }
  }

  const move = (i: number, dir: -1 | 1) => {
    const next = [...banners]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    void save(next, 'Tartib saqlandi')
  }

  const toggle = (i: number) => {
    const next = banners.map((b, k) => (k === i ? { ...b, active: !b.active } : b))
    void save(next, next[i].active ? 'Banner yoqildi' : 'Banner o‘chirildi (ilovada ko‘rinmaydi)')
  }

  const submit = async () => {
    if (!editing) return
    const { index, draft } = editing
    const next = index < 0 ? [...banners, draft] : banners.map((b, k) => (k === index ? draft : b))
    if (await save(next, index < 0 ? 'Banner qo‘shildi' : 'Banner saqlandi')) setEditing(null)
  }

  const remove = async () => {
    if (removing === null) return
    const next = banners.filter((_, k) => k !== removing)
    setRemoving(null)
    await save(next, 'Banner o‘chirildi')
  }

  const activeCount = banners.filter((b) => b.active).length

  return (
    <>
      <section className="adm-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-extrabold">Bosh sahifa bannerlari</h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
              Asosiy banner («Uydagidek ta’m — bir necha daqiqada») doim birinchi turadi. Qo‘shilgan faol bannerlar undan
              keyin karuselda chiqadi va har 5 soniyada o‘ngga suriladi.
            </p>
          </div>
          <button className="adm-btn adm-btn--primary" onClick={() => setEditing({ index: -1, draft: { ...EMPTY } })} disabled={busy || banners.length >= 10}>
            <Plus size={16} /> Yangi banner
          </button>
        </div>
        <p className="mt-3 text-xs font-bold" style={{ color: 'var(--brand)' }}>
          Ilovada hozir: asosiy banner{activeCount ? ` + ${activeCount} ta qo‘shimcha (karusel)` : ' (yakka, karuselsiz)'}
        </p>
      </section>

      {loading ? (
        <p className="mt-4 text-sm" style={{ color: 'var(--muted)' }}><Loader2 size={15} className="inline animate-spin" /> Yuklanmoqda…</p>
      ) : banners.length === 0 ? (
        <div className="adm-card adm-empty mt-4">
          <ImagePlus size={28} />
          <p>Hali qo‘shimcha banner yo‘q. «Yangi banner» ni bosing — aksiya, yangi mahsulot yoki set haqida.</p>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {banners.map((b, i) => (
            <div key={b.id} className="adm-card p-3" style={{ opacity: b.active ? 1 : 0.55 }}>
              <div className="adm-banner-preview">
                <HeroSlide banner={b} lang="uz" />
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className="adm-badge" style={{ background: b.active ? 'var(--brand-soft)' : 'var(--surface-2)', color: b.active ? 'var(--brand-strong)' : 'var(--muted)' }}>
                  {i + 2}-o‘rin · {b.active ? 'Faol' : 'O‘chiq'}
                </span>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>{TARGETS.find((t) => t.key === b.target)?.label}</span>
                <div className="ml-auto flex gap-1">
                  <button className="adm-icon-btn" onClick={() => move(i, -1)} disabled={busy || i === 0} aria-label="Yuqoriga"><ArrowUp size={14} /></button>
                  <button className="adm-icon-btn" onClick={() => move(i, 1)} disabled={busy || i === banners.length - 1} aria-label="Pastga"><ArrowDown size={14} /></button>
                  <label className="adm-icon-btn" title={b.active ? 'O‘chirish' : 'Yoqish'} style={{ cursor: 'pointer' }}>
                    <input type="checkbox" className="adm-ch-switch" checked={b.active} onChange={() => toggle(i)} disabled={busy} aria-label="Faol" />
                  </label>
                  <button className="adm-icon-btn" onClick={() => setEditing({ index: i, draft: { ...b } })} disabled={busy} aria-label="Tahrirlash"><Pencil size={14} /></button>
                  <button className="adm-icon-btn adm-icon-btn--danger" onClick={() => setRemoving(i)} disabled={busy} aria-label="O‘chirish"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <BannerEditor
          draft={editing.draft}
          isNew={editing.index < 0}
          busy={busy}
          onChange={(draft) => setEditing({ ...editing, draft })}
          onClose={() => setEditing(null)}
          onSave={() => void submit()}
          onError={(m) => show(m, 'error')}
        />
      )}
      {removing !== null && (
        <ConfirmDialog
          title="Banner o‘chirilsinmi?"
          message="Banner ilovadan olib tashlanadi. Keyin qayta qo‘shish mumkin."
          confirmLabel="Ha, o‘chirilsin"
          onConfirm={() => void remove()}
          onClose={() => setRemoving(null)}
        />
      )}
      {toast}
    </>
  )
}

// ─── Muharrir ─────────────────────────────────────────────────

function BannerEditor({
  draft, isNew, busy, onChange, onClose, onSave, onError,
}: {
  draft: HomeBanner
  isNew: boolean
  busy: boolean
  onChange: (d: HomeBanner) => void
  onClose: () => void
  onSave: () => void
  onError: (m: string) => void
}) {
  const { categories } = useCategories()
  const { sections } = useSections()
  const { products } = useProducts()
  const sortedProducts = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name)), [products])
  const [uploading, setUploading] = useState(false)
  const [lang, setLang] = useState<'uz' | 'ru'>('uz')
  const set = (patch: Partial<HomeBanner>) => onChange({ ...draft, ...patch })
  const error = problem(draft)

  const pick = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { onError('Faqat rasm'); return }
    setUploading(true)
    try {
      const media = await uploadAdMedia(file)
      set({ image: media.url })
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Yuklab bo‘lmadi')
    } finally {
      setUploading(false)
    }
  }

  const pair = (label: string, uz: keyof HomeBanner, ru: keyof HomeBanner, max: number, placeholder: string, placeholderRu: string) => (
    <div className="sm:col-span-2">
      <label className="adm-label">{label}</label>
      <div className="grid gap-2 sm:grid-cols-2">
        <input className="adm-input" value={String(draft[uz])} onChange={(e) => set({ [uz]: e.target.value } as Partial<HomeBanner>)} maxLength={max} placeholder={placeholder} />
        <input className="adm-input" value={String(draft[ru])} onChange={(e) => set({ [ru]: e.target.value } as Partial<HomeBanner>)} maxLength={max} placeholder={`${placeholderRu} (ruscha)`} />
      </div>
    </div>
  )

  return (
    <Modal
      wide
      title={isNew ? 'Yangi banner' : 'Bannerni tahrirlash'}
      onClose={onClose}
      footer={
        <>
          <button className="adm-btn adm-btn--ghost flex-1" onClick={onClose} disabled={busy}>Bekor qilish</button>
          <button className="adm-btn adm-btn--primary flex-1" onClick={onSave} disabled={busy || uploading || Boolean(error)}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : null} Saqlash
          </button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="grid content-start gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="adm-label">Ko‘rinishi</label>
            <div className="adm-bc-kind">
              {([['side', 'Matn + rasm o‘ngda'], ['full', 'To‘liq rasm']] as [BannerLayout, string][]).map(([k, l]) => (
                <button key={k} type="button" className={draft.layout === k ? 'active' : ''} onClick={() => set({ layout: k })}>{l}</button>
              ))}
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="adm-label">Rasm {draft.layout === 'side' && <span style={{ color: 'var(--faint)' }}>(shaffof fonli PNG eng chiroyli chiqadi)</span>}</label>
            {draft.image ? (
              <div className="flex items-center gap-3">
                <img src={draft.image} alt="" style={{ width: 120, height: 80, objectFit: 'contain', borderRadius: 12, background: 'var(--surface-2)' }} />
                <button type="button" className="adm-btn adm-btn--ghost" onClick={() => set({ image: '' })}><X size={15} /> Olib tashlash</button>
              </div>
            ) : (
              <label className={'adm-bc-add ' + (uploading ? 'is-busy' : '')}>
                {uploading ? <Loader2 size={20} className="animate-spin" /> : <ImagePlus size={20} />}
                <span className="text-sm font-bold">{uploading ? 'Yuklanmoqda…' : 'Rasm yuklash'}</span>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  {draft.layout === 'full' ? 'Tavsiya: 1600×900 (16:9)' : 'Mahsulot yoki set fotosi — o‘ng tomonda turadi'}
                </span>
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }} disabled={uploading} />
              </label>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className="adm-label">Fon rangi</label>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(BANNER_THEMES) as BannerTheme[]).map((k) => (
                <button key={k} type="button" className={'adm-chip inline-flex items-center gap-1.5 ' + (draft.theme === k ? 'active' : '')} onClick={() => set({ theme: k })}>
                  <span className="adm-bc-swatch" style={{ background: BANNER_THEMES[k].bg }} /> {BANNER_THEMES[k].label}
                </button>
              ))}
            </div>
          </div>

          {pair('Kichik yorliq', 'badge', 'badgeRu', 40, 'Masalan: Yangi', 'Новинка')}
          {pair('Sarlavha', 'title', 'titleRu', 90, 'Masalan: Setlarda 36 000 so‘mgacha tejang', 'Экономьте до 36 000 сум')}
          {pair('Qisqa matn', 'subtitle', 'subtitleRu', 140, 'Masalan: 3 xil tayyor set — bitta qutida', '3 готовых набора в одной коробке')}
          {pair('Tugma matni', 'cta', 'ctaRu', 30, 'Masalan: Ko‘rish', 'Смотреть')}

          <div className="sm:col-span-2">
            <label className="adm-label">Bosilganda nima ochilsin</label>
            <div className="flex flex-wrap gap-1.5">
              {TARGETS.map((t) => (
                <button key={t.key} type="button" className={'adm-chip ' + (draft.target === t.key ? 'active' : '')} onClick={() => set({ target: t.key, value: '' })}>{t.label}</button>
              ))}
            </div>
            {draft.target === 'category' && (
              <select className="adm-input mt-2" value={draft.value} onChange={(e) => set({ value: e.target.value })}>
                <option value="">Kategoriyani tanlang…</option>
                {categories.map((c) => <option key={String(c.id)} value={c.name}>{c.name}</option>)}
              </select>
            )}
            {draft.target === 'section' && (
              <select className="adm-input mt-2" value={draft.value} onChange={(e) => set({ value: e.target.value })}>
                <option value="">Bo‘limni tanlang…</option>
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
            {draft.target === 'product' && (
              <select className="adm-input mt-2" value={draft.value} onChange={(e) => set({ value: e.target.value })}>
                <option value="">Mahsulotni tanlang…</option>
                {sortedProducts.map((p) => <option key={p.docId} value={String(p.id)}>{p.name}</option>)}
              </select>
            )}
            {draft.target === 'url' && (
              <input className="adm-input mt-2" value={draft.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://instagram.com/…" inputMode="url" />
            )}
          </div>

          <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
            <input type="checkbox" checked={draft.active} onChange={(e) => set({ active: e.target.checked })} style={{ accentColor: 'var(--brand)' }} />
            Faol (ilovada ko‘rinadi)
          </label>
          {error && <p className="text-xs sm:col-span-2" style={{ color: 'var(--danger)' }}>{error}</p>}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="adm-label" style={{ margin: 0 }}>Ilovada ko‘rinishi</span>
            <div className="adm-bc-kind">
              <button type="button" className={lang === 'uz' ? 'active' : ''} onClick={() => setLang('uz')}>UZ</button>
              <button type="button" className={lang === 'ru' ? 'active' : ''} onClick={() => setLang('ru')}>RU</button>
            </div>
          </div>
          <div className="adm-banner-preview">
            <HeroSlide banner={draft} lang={lang} />
          </div>
          <p className="mt-2 text-xs" style={{ color: 'var(--faint)' }}>Telefon kengligida (≈380 px). Katta ekranda banner balandroq bo‘ladi.</p>
        </div>
      </div>
    </Modal>
  )
}
