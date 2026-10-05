import {
  ArrowUpDown, Boxes, CircleAlert, CircleCheck, Eye, EyeOff, ImagePlus, Link2, Loader2, Minus, Package, Pencil, Plus, Search, Star,
  Trash2, X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { formatPrice } from '../../data'
import { apiPost } from '../lib/api'
import { uploadProductImage } from '../lib/storage'
import {
  useCategories, useLinkoProducts, useProducts, useSections, type LinkoRow, type ProductRow,
} from '../lib/live'
import { Modal, ConfirmDialog } from '../components/Modal'
import { ProductExcel } from '../components/ProductExcel'
import { useToast } from '../components/Toast'
import type { Section } from '../../types/domain'
import { productThumb } from '../../utils/product-image'

type Draft = {
  id?: string
  /**
   * Faqat forma uchun: «Set qo'shish» dan ochilgan (yoki tarkibi bor)
   * mahsulot — set oynasi ko'rinadi. Serverga yuborilmaydi.
   */
  kind: 'product' | 'set'
  name: string
  nameRu: string
  nameEn: string
  price: string
  oldPrice: string
  category: string
  description: string
  descriptionRu: string
  descriptionEn: string
  discount: string
  stock: string
  /** O'ramda nechta dona (1 — oddiy, donalab). */
  pack: string
  /** Vazni — bitta qiymat, kartochkada nom tagida ko'rinadi («500 gr»). */
  sizes: string
  color: string
  /**
   * Linko pozitsiyalarining ID lari (vergul bilan). Saqlanganda mahsulot
   * shularga bog'lanadi va narx/qoldiq Linko'dan keladi.
   */
  linkoIds: string
  /** Bosh sahifadagi «Mashhur mahsulotlar» qatorida. */
  popular: boolean
  /**
   * Set tarkibi — bazadagi mahsulotlar va soni. Bo'sh bo'lsa oddiy
   * mahsulot. Narx setning o'z narxi (tarkib narxga ta'sir qilmaydi).
   */
  bundle: { productId: string; quantity: number }[]
  /** Bo'lim identifikatori; bo'sh — bo'limsiz. */
  sectionId: string
  /**
   * Uchala ro'yxat BIR XIL uzunlikda va tartibda: i-rasmning asl fayli,
   * kichik va o'rta nusxasi. Rasm olib tashlanganda uchalasidan ham
   * o'chiriladi. Siqilgan nusxa yo'q eski rasmlarda bo'sh satr turadi.
   */
  images: string[]
  thumbs: string[]
  optimized: string[]
}

/** Setlar kategoriyasi — «Set qo'shish» shunga qo'yadi, yo'q bo'lsa yaratadi. */
const SET_CATEGORY = 'Setlar'
/** Kategoriya filtri o'rnida: faqat mijozlardan yashirilganlar. */
const HIDDEN = '__hidden'

const EMPTY: Draft = {
  kind: 'product',
  name: '', nameRu: '', nameEn: '', price: '', oldPrice: '', category: '',
  description: '', descriptionRu: '', descriptionEn: '',
  discount: '', stock: '0', pack: '1', sizes: '', color: '', popular: false, sectionId: '',
  linkoIds: '',
  bundle: [],
  images: [], thumbs: [], optimized: [],
}

/** «4020, 4021» → [4020, 4021]. Takror va noto'g'ri qiymatlar tashlanadi. */
function parseLinkoIds(value: string): number[] {
  const ids = value
    .split(/[\s,;]+/)
    .map((part) => Number(part.replace(/\D/g, '')))
    .filter((id) => Number.isInteger(id) && id > 0)
  return [...new Set(ids)]
}

/** Mahsulotga bog'langan pozitsiyalar — narx olinadigani (asosiy) birinchi. */
function linkedTo(rows: LinkoRow[], productId: string): LinkoRow[] {
  return rows
    .filter((row) => row.productIds.includes(productId))
    .sort((a, b) => Number(b.primary === true) - Number(a.primary === true))
}

/**
 * Nusxalarni `images` bilan tekislaydi. Asl rasmi almashgan (eskirgan)
 * nusxa bo'sh satrga aylanadi — saqlanganda noto'g'ri rasm qotib qolmasin.
 */
function aligned(product: ProductRow, list: string[] | undefined): string[] {
  const images = product.images || []
  return images.map((url, i) => (product.variantSources?.[i] === url && list?.[i]) || '')
}

function toDraft(product: ProductRow, linko: LinkoRow[]): Draft {
  return {
    id: product.docId,
    kind: product.bundle?.length ? 'set' : 'product',
    name: product.name,
    nameRu: product.nameRu || '',
    nameEn: product.nameEn || '',
    price: String(product.price ?? ''),
    oldPrice: product.oldPrice ? String(product.oldPrice) : '',
    category: product.category || '',
    description: product.description || '',
    descriptionRu: product.descriptionRu || '',
    descriptionEn: product.descriptionEn || '',
    discount: product.discount || '',
    stock: String(product.stock ?? 0),
    pack: String(product.pack && product.pack > 1 ? product.pack : 1),
    sizes: (product.sizes || []).join(', '),
    color: product.color || '',
    popular: product.popular === true,
    sectionId: product.sectionId || '',
    linkoIds: linkedTo(linko, product.docId).map((row) => row.linkoId).join(', '),
    bundle: (product.bundle || []).map((b) => ({ productId: String(b.productId), quantity: b.quantity })),
    images: product.images || [],
    thumbs: aligned(product, product.thumbs),
    optimized: aligned(product, product.optimized),
  }
}

export function ProductsPage() {
  const { products, loading } = useProducts()
  const { categories } = useCategories()
  const { sections } = useSections()
  const { rows: linkoRows } = useLinkoProducts()
  const { show, node: toast } = useToast()
  const sectionName = (id?: string | null) => sections.find((x) => x.id === id)?.name

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [removing, setRemoving] = useState<ProductRow | null>(null)
  const [busy, setBusy] = useState(false)
  /** Yoqish/o'chirish so'rovi ketayotgan mahsulot. */
  const [toggling, setToggling] = useState<string | null>(null)

  const toggleActive = async (product: ProductRow) => {
    const active = product.active === false
    setToggling(product.docId)
    try {
      await apiPost('action', { action: 'product.active', id: product.docId, active })
      show(active ? `«${product.name}» yoqildi — mijozlarga ko‘rinadi` : `«${product.name}» o‘chirildi — mijozlarga ko‘rinmaydi`)
    } catch (error) {
      show(error instanceof Error ? error.message : 'Bajarilmadi', 'error')
    } finally {
      setToggling(null)
    }
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return products.filter((p) => {
      if (category === HIDDEN) {
        if (p.active !== false) return false
      } else if (category && p.category !== category) return false
      return !needle || p.name.toLowerCase().includes(needle)
    })
  }, [products, query, category])

  const save = async () => {
    if (!draft) return

    if (draft.kind === 'set' && !draft.bundle.length) {
      show('Setga kamida bitta mahsulot qo‘shing (pastdagi «Set tarkibi»)', 'error')
      return
    }

    // Mavjud bo'lmagan ID bilan mahsulot saqlanib, bog'lanish esa jim
    // o'tib ketmasin — avval tekshiramiz
    const wanted = parseLinkoIds(draft.linkoIds)
    const missing = wanted.filter((id) => !linkoRows.some((row) => row.linkoId === id))
    if (missing.length) {
      show(`Linko'da bunday ID yo‘q: ${missing.join(', ')}`, 'error')
      return
    }

    setBusy(true)
    try {
      // Birinchi set — «Setlar» kategoriyasi hali yo'q bo'lsa o'zi yaratiladi
      if (draft.kind === 'set' && !categories.some((c) => c.name === draft.category)) {
        await apiPost('action', { action: 'category.save', name: draft.category || SET_CATEGORY, icon: 'package' })
      }

      const { id: productId } = await apiPost<{ id: string }>('action', {
        action: 'product.save',
        id: draft.id,
        name: draft.name,
        nameRu: draft.nameRu,
        nameEn: draft.nameEn,
        price: Number(draft.price),
        oldPrice: Number(draft.oldPrice) || 0,
        category: draft.category,
        description: draft.description,
        descriptionRu: draft.descriptionRu,
        descriptionEn: draft.descriptionEn,
        discount: draft.discount,
        stock: Number(draft.stock),
        pack: draft.kind === 'set' ? 1 : Math.max(1, Number(draft.pack) || 1),
        // Bitta qiymat: «0,5 kg» dagi vergul endi bo'luvchi emas
        sizes: draft.sizes.trim() ? [draft.sizes.trim()] : [],
        color: draft.color,
        popular: draft.popular,
        sectionId: draft.sectionId || null,
        // Oddiy mahsulot formasida tarkib yo'q — bo'sh yuborilsa set emas bo'ladi
        bundle: draft.kind === 'set' ? draft.bundle : [],
        images: draft.images,
        thumbs: draft.thumbs,
        optimized: draft.optimized,
      })

      /*
       * Linko bog'lanishi — mahsulot saqlangandan KEYIN: server bog'langan
       * pozitsiyaning narx va qoldig'ini mahsulotga yozadi, formadagi
       * narx ustidan. Faqat o'zgargan pozitsiyalarga tegiladi.
       */
      const current = linkedTo(linkoRows, productId)
      for (const linkoId of wanted) {
        if (current.some((row) => row.linkoId === linkoId)) continue
        await apiPost('action', { action: 'linko.link', linkoId, productId })
      }
      for (const row of current) {
        if (wanted.includes(row.linkoId)) continue
        const rest = row.productIds.filter((id) => id !== productId)
        await apiPost(
          'action',
          rest.length
            ? { action: 'linko.link', linkoId: row.linkoId, productIds: rest }
            : { action: 'linko.link', linkoId: row.linkoId, unlink: true },
        )
      }

      show(draft.kind === 'set'
        ? draft.id ? 'Set yangilandi' : 'Set qo‘shildi'
        : draft.id ? 'Mahsulot yangilandi' : 'Mahsulot qo‘shildi')
      setDraft(null)
    } catch (error) {
      show(error instanceof Error ? error.message : 'Saqlanmadi', 'error')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!removing) return
    setBusy(true)
    try {
      await apiPost('action', {
        action: 'product.delete',
        id: removing.docId,
      })
      show('Mahsulot o‘chirildi')
      setRemoving(null)
    } catch (error) {
      show(error instanceof Error ? error.message : 'O‘chirilmadi', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="adm-page-head">
        <div className="relative min-w-[200px] flex-1">
          <Search
            size={17}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--faint)' }}
          />
          <input
            className="adm-input icon-left"
            placeholder="Mahsulot qidirish..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="adm-page-head__actions">
          <ProductExcel
            products={products}
            categories={categories}
            sections={sections}
            onToast={(message, kind) => show(message, kind)}
          />
          <button
            className="adm-btn adm-btn--set"
            onClick={() => setDraft({
              ...EMPTY,
              kind: 'set',
              category: categories.find((c) => c.name.toLowerCase() === SET_CATEGORY.toLowerCase())?.name ?? SET_CATEGORY,
            })}
          >
            <Package size={17} /> Set qo‘shish
          </button>
          <button
            className="adm-btn adm-btn--primary"
            onClick={() => setDraft({ ...EMPTY, category: categories.find((c) => c.name !== SET_CATEGORY)?.name || '' })}
          >
            <Plus size={17} /> Qo‘shish
          </button>
        </div>
      </div>

      {/* Tartib endi shu yerda emas — Bo'limlar sahifasida sudrab */}
      <a href="#/sections" className="adm-hint mb-3">
        <ArrowUpDown size={16} />
        <span>
          Mahsulotlar tartibi va bo‘limlari — <b>Bo‘limlar</b> sahifasida, sudrab joylashtiriladi
        </span>
      </a>

      <div className="scrollbar-none mb-4 flex gap-2 overflow-x-auto pb-1">
        {['', ...categories.map((c) => c.name)].map((name) => (
          <button
            key={name || 'all'}
            onClick={() => setCategory(name)}
            className="shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-bold transition active:scale-95"
            style={{
              borderColor: category === name ? 'var(--brand-line)' : 'var(--line)',
              background: category === name ? 'var(--brand-soft)' : 'var(--surface)',
              color: category === name ? 'var(--brand-strong)' : 'var(--muted)',
            }}
          >
            {name || 'Barchasi'}
          </button>
        ))}
        {/* Yashirilganlar bo'lsa — alohida tugma, topish oson bo'lsin */}
        {(category === HIDDEN || products.some((p) => p.active === false)) && [HIDDEN].map((name) => (
          <button
            key={name}
            onClick={() => setCategory(name)}
            className="flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-bold transition active:scale-95"
            style={{
              borderColor: category === name ? 'var(--danger)' : 'var(--line)',
              background: category === name ? 'var(--danger-soft)' : 'var(--surface)',
              color: category === name ? 'var(--danger)' : 'var(--muted)',
            }}
          >
            <EyeOff size={14} /> O‘chirilganlar · {products.filter((p) => p.active === false).length}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="adm-skeleton h-28" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="adm-card adm-empty">
          <Boxes size={30} />
          <p className="text-sm font-semibold">Mahsulot topilmadi</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((product) => (
            <article
              key={product.docId}
              className="adm-card flex gap-3 p-3"
              style={product.active === false ? { opacity: 0.6, borderStyle: 'dashed' } : undefined}
            >
              <div
                className="size-20 shrink-0 overflow-hidden rounded-xl"
                style={{ background: 'var(--surface-2)' }}
              >
                {product.images?.[0] ? (
                  <img
                    src={productThumb(product)}
                    alt=""
                    className="size-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="grid size-full place-items-center" style={{ color: 'var(--faint)' }}>
                    <Boxes size={22} />
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-extrabold">
                  <span className="truncate">{product.name}</span>
                  {!!product.bundle?.length && (
                    <span className="adm-set-badge">SET · {product.bundle.reduce((s, b) => s + b.quantity, 0)}</span>
                  )}
                  {product.popular && (
                    <Star size={13} className="shrink-0" fill="var(--warning)" style={{ color: 'var(--warning)' }} aria-label="Mashhur" />
                  )}
                </p>
                <p className="truncate text-xs" style={{ color: 'var(--muted)' }}>
                  {product.category}
                  {sectionName(product.sectionId) ? ` · ${sectionName(product.sectionId)}` : ''}
                </p>
                {product.active === false && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs font-bold" style={{ color: 'var(--danger)' }}>
                    <EyeOff size={12} /> Mijozlarga ko‘rinmaydi
                  </p>
                )}
                <p className="mt-1 text-sm font-bold">{formatPrice(product.price)}</p>
                <p
                  className="text-xs font-semibold"
                  style={{ color: (product.stock ?? 0) > 0 ? 'var(--brand)' : 'var(--danger)' }}
                >
                  {(product.stock ?? 0) > 0 ? `Omborda: ${product.stock}` : 'Tugagan'}
                  {product.pack && product.pack > 1 ? ` · ${product.pack} donadan` : ''}
                </p>
              </div>

              <div className="flex shrink-0 flex-col gap-1.5">
                <button
                  className="grid size-8 place-items-center rounded-lg transition active:scale-90"
                  style={product.active === false
                    ? { background: 'var(--surface-2)', color: 'var(--muted)' }
                    : { background: 'var(--brand-soft)', color: 'var(--brand-strong)' }}
                  onClick={() => void toggleActive(product)}
                  disabled={toggling === product.docId}
                  aria-label={product.active === false ? 'Yoqish — mijozlarga ko‘rsatish' : 'O‘chirish — mijozlardan yashirish'}
                  title={product.active === false ? 'Yoqish — mijozlarga ko‘rsatish' : 'O‘chirish — mijozlardan yashirish'}
                >
                  {toggling === product.docId ? <Loader2 size={15} className="animate-spin" /> : product.active === false ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
                <button
                  className="grid size-8 place-items-center rounded-lg transition active:scale-90"
                  style={{ background: 'var(--surface-2)' }}
                  onClick={() => setDraft(toDraft(product, linkoRows))}
                  aria-label="Tahrirlash"
                >
                  <Pencil size={15} />
                </button>
                <button
                  className="grid size-8 place-items-center rounded-lg transition active:scale-90"
                  style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
                  onClick={() => setRemoving(product)}
                  aria-label="O‘chirish"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {draft && (
        <ProductForm
          draft={draft}
          categories={categories.map((c) => c.name)}
          sections={sections}
          linkoRows={linkoRows}
          products={products}
          busy={busy}
          onChange={setDraft}
          onSave={save}
          onClose={() => setDraft(null)}
          onError={(message) => show(message, 'error')}
        />
      )}

      {removing && (
        <ConfirmDialog
          title="Mahsulotni o‘chirish"
          message={`«${removing.name}» butunlay o‘chiriladi. Bu amalni qaytarib bo‘lmaydi.`}
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

const LANGS = [
  { code: 'uz', label: 'O‘zbekcha', name: 'name', description: 'description',
    namePlaceholder: 'Chuchvara mol go‘shtli, 800 g', descriptionPlaceholder: 'Yangi go‘sht va xamirdan, shok muzlatilgan.' },
  { code: 'ru', label: 'Ruscha', name: 'nameRu', description: 'descriptionRu',
    namePlaceholder: 'Пельмени с говядиной, 800 г', descriptionPlaceholder: 'Из свежего мяса и теста, шоковая заморозка.' },
  { code: 'en', label: 'Inglizcha', name: 'nameEn', description: 'descriptionEn',
    namePlaceholder: 'Beef dumplings, 800 g', descriptionPlaceholder: 'Fresh meat and dough, blast frozen.' },
] as const

function ProductForm({
  draft, categories, sections, linkoRows, products, busy, onChange, onSave, onClose, onError,
}: {
  draft: Draft
  categories: string[]
  sections: Section[]
  linkoRows: LinkoRow[]
  products: ProductRow[]
  busy: boolean
  onChange: (draft: Draft) => void
  onSave: () => void
  onClose: () => void
  onError: (message: string) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [lang, setLang] = useState<(typeof LANGS)[number]['code']>('uz')
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch })
  const isSet = draft.kind === 'set'
  // Set kategoriyasi hali yaratilmagan bo'lsa ham ro'yxatda tursin (saqlashda yaratiladi)
  const categoryOptions = isSet && draft.category && !categories.includes(draft.category)
    ? [draft.category, ...categories]
    : categories

  /*
   * Yuklash bir necha soniya davom etadi — shu orada admin nomi yoki
   * narxini yozishda davom etishi mumkin. Yuklash tugagach eski `draft`
   * ga rasm qo'shilsa, o'sha orada yozilganlar o'chib ketardi. Shuning
   * uchun oxirgi holat ref orqali olinadi.
   */
  const latest = useRef({ draft, onChange, onError })
  useEffect(() => {
    latest.current = { draft, onChange, onError }
  })

  const uploadFiles = async (files: File[]) => {
    if (!files.length) return
    setUploading(true)
    try {
      const uploaded = []
      for (const file of files) uploaded.push(await uploadProductImage(file))
      const current = latest.current.draft
      latest.current.onChange({
        ...current,
        images: [...current.images, ...uploaded.map((u) => u.url)],
        thumbs: [...current.thumbs, ...uploaded.map((u) => u.thumb)],
        optimized: [...current.optimized, ...uploaded.map((u) => u.optimized)],
      })
    } catch (error) {
      latest.current.onError(error instanceof Error ? error.message : 'Rasm yuklanmadi')
    } finally {
      setUploading(false)
    }
  }

  const addImages = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files || [])]
    event.target.value = ''
    void uploadFiles(files)
  }

  /*
   * Ctrl+V — nusxalangan rasmni to'g'ridan-to'g'ri yuklash.
   *
   * Forma ochiq turganda butun sahifada tinglanadi: admin qaysi maydonda
   * turganidan qat'i nazar rasm qo'shiladi. Faqat buferda RASM bo'lsa
   * aralashamiz — oddiy matn nomi yoki tavsifga odatdagidek qo'yiladi.
   */
  const uploadRef = useRef(uploadFiles)
  useEffect(() => {
    uploadRef.current = uploadFiles
  })
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const images = [...(event.clipboardData?.files || [])].filter((file) =>
        file.type.startsWith('image/'),
      )
      if (!images.length) return
      event.preventDefault()
      // Skrinshotlar «image.png» nomi bilan keladi — farqlanishi uchun
      const named = images.map((file, i) =>
        file.name && file.name !== 'image.png'
          ? file
          : new File([file], `nusxa_${Date.now()}_${i}.${file.type.split('/')[1] || 'png'}`, {
              type: file.type,
            }),
      )
      void uploadRef.current(named)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])

  return (
    <Modal
      wide
      title={isSet
        ? draft.id ? 'Setni tahrirlash' : 'Yangi set'
        : draft.id ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot'}
      onClose={onClose}
      footer={
        <>
          <button className="adm-btn adm-btn--ghost flex-1" onClick={onClose} disabled={busy}>
            Bekor qilish
          </button>
          <button
            className="adm-btn adm-btn--primary flex-1"
            onClick={onSave}
            disabled={busy || uploading}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : null}
            Saqlash
          </button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Set — qanday to'ldirilishi, qadam-baqadam */}
        {isSet && (
          <ol className="adm-set-guide sm:col-span-2">
            <li><b>1</b> Set nomi va <b>set narxi</b> (masalan 199 000) — mijoz shu narxni to‘laydi</li>
            <li><b>2</b> <b>Linko ID</b> — setning Linko’dagi raqami (narx va qoldiq Linko’dan keladi)</li>
            <li><b>3</b> <b>Set tarkibi</b> — ichidagi mahsulotlar va soni. Narxga ta’sir qilmaydi</li>
          </ol>
        )}

        {/* Nom va tavsif — uch tilda. O'zbekcha majburiy, qolganlari bo'sh
            bo'lsa ilova o'zbekchasini ko'rsatadi. */}
        <div className="sm:col-span-2">
          <div className="adm-lang-tabs" role="tablist" aria-label="Til">
            {LANGS.map((l) => {
              const filled = Boolean(draft[l.name].trim())
              return (
                <button
                  key={l.code}
                  type="button"
                  role="tab"
                  aria-selected={lang === l.code}
                  className={'adm-lang-tab ' + (lang === l.code ? 'active' : '')}
                  onClick={() => setLang(l.code)}
                >
                  {l.label}
                  <i className={filled ? 'is-filled' : ''} aria-label={filled ? 'to‘ldirilgan' : 'bo‘sh'} />
                </button>
              )
            })}
          </div>
          {LANGS.filter((l) => l.code === lang).map((l) => (
            <div key={l.code} className="grid gap-3">
              <Field label={l.code === 'uz' ? 'Nomi' : `Nomi — ${l.label.toLowerCase()}`}>
                <input
                  className="adm-input"
                  value={draft[l.name]}
                  onChange={(e) => set({ [l.name]: e.target.value } as Partial<Draft>)}
                  placeholder={isSet ? (l.code === 'ru' ? 'Семейный набор' : l.code === 'en' ? 'Family set' : 'Oilaviy set') : l.namePlaceholder}
                />
              </Field>
              <Field label={l.code === 'uz' ? 'Tavsif' : `Tavsif — ${l.label.toLowerCase()}`}>
                <textarea
                  className="adm-input"
                  rows={3}
                  value={draft[l.description]}
                  onChange={(e) => set({ [l.description]: e.target.value } as Partial<Draft>)}
                  placeholder={isSet ? (l.code === 'ru' ? 'Выгодный набор на всю семью' : l.code === 'en' ? 'Great value set for the whole family' : 'Butun oila uchun foydali to‘plam') : l.descriptionPlaceholder}
                />
              </Field>
            </div>
          ))}
        </div>

        <Field label={isSet ? 'Set narxi (so‘m)' : 'Narxi (so‘m)'}>
          <input
            className="adm-input"
            inputMode="numeric"
            value={draft.price}
            onChange={(e) => set({ price: e.target.value.replace(/\D/g, '') })}
            placeholder={isSet ? '199000' : '45000'}
          />
        </Field>

        {/* Setda eski narx kerak emas — tejash tarkibdan o'zi hisoblanadi */}
        {!isSet && (
          <Field label="Eski narxi — chegirma ko‘rsatish uchun">
            <input
              className="adm-input"
              inputMode="numeric"
              value={draft.oldPrice}
              onChange={(e) => set({ oldPrice: e.target.value.replace(/\D/g, '') })}
              placeholder="50000"
            />
          </Field>
        )}

        {!isSet && (
          <Field label="O‘ramda nechta dona — masalan sirok qutisi 30 ta">
            <input
              className="adm-input"
              inputMode="numeric"
              value={draft.pack}
              onChange={(e) => set({ pack: e.target.value.replace(/\D/g, '').slice(0, 4) })}
              placeholder="1"
            />
            {Number(draft.pack) > 1 && (
              <small className="mt-1 block text-xs" style={{ color: 'var(--brand-strong)' }}>
                Mijoz ko‘radi: <b>{Number(draft.pack)} dona — {formatPrice((Number(draft.price) || 0) * Number(draft.pack))}</b>.
                {' '}1 ta buyurtmada ombordan {Number(draft.pack)} dona ayiriladi.
                {' '}Yuqoridagi narx — 1 donasining narxi.
              </small>
            )}
          </Field>
        )}

        {isSet && (
          <BundleField
            value={draft.bundle}
            products={products}
            selfId={draft.id}
            setPrice={Number(draft.price) || 0}
            onChange={(bundle) => set({ bundle })}
          />
        )}

        <Field label="Kategoriya">
          <select
            className="adm-input"
            value={draft.category}
            // Bo'lim kategoriyaga tegishli — kategoriya almashsa bo'lim ham tozalanadi
            onChange={(e) => set({ category: e.target.value, sectionId: '' })}
          >
            <option value="">Tanlang...</option>
            {categoryOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Bo‘lim">
          <select
            className="adm-input"
            value={draft.sectionId}
            onChange={(e) => set({ sectionId: e.target.value })}
            disabled={!draft.category}
          >
            <option value="">Bo‘limsiz</option>
            {sections
              .filter((section) => section.category === draft.category)
              .map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
          </select>
        </Field>

        <Field label={!isSet && Number(draft.pack) > 1 ? `Ombordagi qoldiq (dona) — ${Math.floor((Number(draft.stock) || 0) / Number(draft.pack))} quti` : 'Ombordagi qoldiq'}>
          <input
            className="adm-input"
            inputMode="numeric"
            value={draft.stock}
            onChange={(e) => set({ stock: e.target.value.replace(/\D/g, '') })}
          />
        </Field>

        {/* Setda vazn va tur yo'q — tarkibidan ko'rinadi */}
        {!isSet && (
          <>
            <Field label="Vazni — kartochkada nom tagida">
              <input
                className="adm-input"
                value={draft.sizes}
                onChange={(e) => set({ sizes: e.target.value })}
                placeholder="500 gr"
              />
            </Field>

            <Field label="Turi">
              <input
                className="adm-input"
                value={draft.color}
                onChange={(e) => set({ color: e.target.value })}
                placeholder="Mol go‘shti"
              />
            </Field>
          </>
        )}

        <LinkoField
          value={draft.linkoIds}
          rows={linkoRows}
          productId={draft.id}
          onChange={(linkoIds) => set({ linkoIds })}
        />

        {/* Bosh sahifa qatori — faqat shu belgilanganlar chiqadi */}
        <label
          className="sm:col-span-2 flex cursor-pointer items-center gap-3 rounded-xl border p-3"
          style={{
            borderColor: draft.popular ? 'var(--warning)' : 'var(--line)',
            background: draft.popular ? 'var(--warning-soft)' : 'var(--surface)',
          }}
        >
          <input
            type="checkbox"
            checked={draft.popular}
            onChange={(e) => set({ popular: e.target.checked })}
            style={{ width: 18, height: 18, accentColor: 'var(--warning)' }}
          />
          <Star size={18} fill={draft.popular ? 'var(--warning)' : 'none'} style={{ color: 'var(--warning)' }} />
          <span className="min-w-0">
            <b className="block text-sm">Mashhur mahsulot</b>
            <span className="block text-xs" style={{ color: 'var(--muted)' }}>
              Bosh sahifadagi «Mashhur mahsulotlar» qatorida ko‘rsatiladi
            </span>
          </span>
        </label>

        <Field label="Chegirma nishoni" className="sm:col-span-2">
          <input
            className="adm-input"
            value={draft.discount}
            onChange={(e) => set({ discount: e.target.value })}
            placeholder="-15%"
          />
        </Field>

        <div className="sm:col-span-2">
          <p className="adm-label">Rasmlar</p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {draft.images.map((url, i) => (
              <div key={url + i} className="adm-thumb">
                <img src={draft.thumbs[i] || url} alt="" />
                <button
                  className="adm-thumb__remove"
                  onClick={() =>
                    set({
                      images: draft.images.filter((_, j) => j !== i),
                      thumbs: draft.thumbs.filter((_, j) => j !== i),
                      optimized: draft.optimized.filter((_, j) => j !== i),
                    })
                  }
                  aria-label="Rasmni olib tashlash"
                >
                  <X size={13} />
                </button>
              </div>
            ))}

            <label
              className="adm-thumb grid cursor-pointer place-items-center"
              style={{ color: 'var(--muted)' }}
            >
              {uploading ? <Loader2 size={20} className="animate-spin" /> : <ImagePlus size={20} />}
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={addImages}
                disabled={uploading}
              />
            </label>
          </div>
          <p className="mt-1.5 text-xs" style={{ color: 'var(--faint)' }}>
            Birinchi rasm katalogda ko‘rinadi. 5 MB gacha — ilova uchun avtomatik siqiladi. Nusxalangan rasmni{' '}
            <kbd className="adm-kbd">Ctrl</kbd>+<kbd className="adm-kbd">V</kbd> bilan qo‘yish mumkin.
          </p>
        </div>
      </div>
    </Modal>
  )
}

/**
 * Linko ID — pozitsiyani raqami bilan bog'lash. Yozilgan har bir ID
 * darrov katalog nusxasidan qidiriladi: admin saqlashdan oldin to'g'ri
 * pozitsiyani tanlaganini (nomi, narxi, qoldig'i) ko'radi.
 */
function LinkoField({
  value, rows, productId, onChange,
}: {
  value: string
  rows: LinkoRow[]
  productId?: string
  onChange: (value: string) => void
}) {
  const ids = parseLinkoIds(value)
  const found = ids.map((id) => rows.find((r) => r.linkoId === id)).filter((r) => r !== undefined)
  // Narx olinadigan pozitsiya: allaqachon asosiy bo'lgani, bo'lmasa server
  // birinchi bog'langanini asosiy qiladi
  const primaryId = (
    found.find((r) => r.primary && productId && r.productIds.includes(productId)) ?? found[0]
  )?.linkoId

  return (
    <div className="sm:col-span-2">
      <label className="adm-label">Linko ID — bir nechta bo‘lsa vergul bilan</label>
      <div className="relative">
        <Link2
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--faint)' }}
        />
        <input
          className="adm-input"
          style={{ paddingLeft: 36 }}
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d,\s]/g, ''))}
          placeholder="4020"
        />
      </div>

      {ids.length > 0 && (
        <ul className="mt-2 grid gap-1.5">
          {ids.map((id) => {
            const row = rows.find((r) => r.linkoId === id)
            if (!row) {
              return (
                <li
                  key={id}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
                  style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
                >
                  <CircleAlert size={14} className="shrink-0" />
                  <span>
                    <b>{id}</b> — Linko'da bunday pozitsiya topilmadi
                  </span>
                </li>
              )
            }
            // Boshqa mahsulotlarga ham bog'langan bo'lishi mumkin (ta'mlar) — bu xato emas
            const others = row.productIds.filter((pid) => pid !== productId).length
            return (
              <li
                key={id}
                className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
                style={{ background: 'var(--brand-soft)', color: 'var(--ink)' }}
              >
                <CircleCheck size={14} className="mt-px shrink-0" style={{ color: 'var(--brand)' }} />
                <span className="min-w-0">
                  <b className="block">
                    {row.name}
                    {found.length > 1 && id === primaryId && (
                      <span style={{ color: 'var(--muted)', fontWeight: 500 }}> · narx shundan</span>
                    )}
                  </b>
                  <span style={{ color: 'var(--muted)' }}>
                    {row.price ? formatPrice(row.price) : 'narx yo‘q'} · qoldiq {row.stock}
                    {others > 0 && ` · yana ${others} ta mahsulotga bog‘langan`}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      )}

      <p className="mt-1.5 text-xs" style={{ color: 'var(--faint)' }}>
        Bog‘langan mahsulotning narxi va qoldig‘i Linko'dan olinadi — yuqoridagi narx saqlashdan keyin almashadi.
        Bo‘shatib saqlansa bog‘lanish uziladi.
      </p>
    </div>
  )
}

/**
 * Set tarkibi. Mahsulot qidirib qo'shiladi, soni «−/+» bilan. Pastda —
 * tarkibni alohida olganda qancha bo'lishi va mijoz qancha tejashi.
 * Set ichiga boshqa set qo'shilmaydi (server ham tekshiradi).
 */
function BundleField({
  value, products, selfId, setPrice, onChange,
}: {
  value: { productId: string; quantity: number }[]
  products: ProductRow[]
  selfId?: string
  setPrice: number
  onChange: (value: { productId: string; quantity: number }[]) => void
}) {
  const [query, setQuery] = useState('')
  const byId = useMemo(() => new Map(products.map((p) => [p.docId, p])), [products])
  const needle = query.trim().toLowerCase()
  const options = needle
    ? products
        .filter((p) => p.docId !== selfId && !p.bundle?.length && !value.some((v) => v.productId === p.docId))
        .filter((p) => p.name.toLowerCase().includes(needle))
        .slice(0, 8)
    : []
  const separately = value.reduce((sum, v) => sum + (byId.get(v.productId)?.price ?? 0) * v.quantity, 0)
  const change = (productId: string, delta: number) =>
    onChange(value.map((v) => (v.productId === productId ? { ...v, quantity: Math.min(99, Math.max(1, v.quantity + delta)) } : v)))

  return (
    <div className="adm-bundle sm:col-span-2">
      <p className="adm-label flex items-center gap-1.5"><Package size={14} /> Set tarkibi — ichidagi mahsulotlar</p>
      {value.length > 0 && (
        <ul className="adm-bundle__list">
          {value.map((v) => {
            const p = byId.get(v.productId)
            return (
              <li key={v.productId}>
                {p && productThumb(p) ? <img src={productThumb(p)} alt="" /> : <span className="adm-bundle__noimg"><Boxes size={16} /></span>}
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm">{p?.name ?? 'O‘chirilgan mahsulot'}</b>
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>{p ? formatPrice(p.price) : '—'}</span>
                </span>
                <span className="adm-bundle__qty">
                  <button type="button" onClick={() => change(v.productId, -1)} aria-label="Kamaytirish"><Minus size={13} /></button>
                  <b>{v.quantity}</b>
                  <button type="button" onClick={() => change(v.productId, 1)} aria-label="Ko‘paytirish"><Plus size={13} /></button>
                </span>
                <button
                  type="button"
                  className="adm-icon-btn adm-icon-btn--danger"
                  onClick={() => onChange(value.filter((x) => x.productId !== v.productId))}
                  aria-label="Olib tashlash"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="relative mt-2">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--faint)' }} />
        <input
          className="adm-input icon-left"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Setga mahsulot qo‘shish — nomini yozing"
        />
        {options.length > 0 && (
          <ul className="adm-bundle__options">
            {options.map((p) => (
              <li key={p.docId}>
                <button
                  type="button"
                  onClick={() => {
                    onChange([...value, { productId: p.docId, quantity: 1 }])
                    setQuery('')
                  }}
                >
                  {productThumb(p) ? <img src={productThumb(p)} alt="" /> : <span className="adm-bundle__noimg"><Boxes size={16} /></span>}
                  <span className="min-w-0 flex-1 truncate text-left">{p.name}</span>
                  <span className="shrink-0 text-xs" style={{ color: 'var(--muted)' }}>{formatPrice(p.price)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {value.length > 0 && (
        <p className="adm-bundle__sum">
          Alohida olsa: <b>{formatPrice(separately)}</b> · Set narxi: <b>{formatPrice(setPrice)}</b>
          {separately > setPrice && setPrice > 0 && (
            <> · Mijoz tejaydi: <b style={{ color: 'var(--brand)' }}>{formatPrice(separately - setPrice)}</b></>
          )}
          {setPrice > separately && (
            <span style={{ color: 'var(--warning)' }}> — set narxi tarkibdan qimmat</span>
          )}
        </p>
      )}
    </div>
  )
}

function Field({
  label, children, className = '',
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label className="adm-label">{label}</label>
      {children}
    </div>
  )
}
