import {
  ArrowDown, ArrowUp, Check, Inbox, Layers, Loader2, Pencil, Plus, Search, Trash2,
} from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { formatPrice } from '../../data'
import { apiPost } from '../lib/api'
import { useCategories, useProducts, useSections, type ProductRow } from '../lib/live'
import { byOrder, moveItem, useOptimisticValue } from '../lib/sort'
import { ConfirmDialog, Modal } from '../components/Modal'
import { SortableList, type SortableRow } from '../components/SortableList'
import { useToast } from '../components/Toast'
import type { Section } from '../../types/domain'
import { productThumb } from '../../utils/product-image'

/**
 * Kategoriya ichidagi joylashuv — bitta tekis ro'yxat:
 *
 *   [Musa]          ← sarlavha (bo'lim)
 *     mahsulot
 *     mahsulot
 *   [Future Fruit]
 *     mahsulot
 *   [Bo'limsiz]     ← doim oxirida
 *     mahsulot
 *
 * Mahsulotni sudrab qaysi sarlavha ostiga qo'ysangiz, o'sha bo'limga
 * o'tadi. Tekis ro'yxat bo'lgani uchun bitta sudrash ham tartibni, ham
 * bo'limni birdaniga o'zgartiradi — alohida «ko'chirish» oynasi shart emas.
 */
type Row =
  | { kind: 'section'; id: string }
  | { kind: 'rest' }
  | { kind: 'product'; id: string }

const rowKey = (row: Row) => (row.kind === 'product' ? `p:${row.id}` : row.kind === 'section' ? `s:${row.id}` : 'rest')

/** Ro'yxatdan serverga yuboriladigan shakl: bo'limlar tartibi va har mahsulotning bo'limi. */
function toPayload(rows: Row[]) {
  const sections: string[] = []
  const items: { id: string; sectionId: string | null }[] = []
  let current: string | null = null
  for (const row of rows) {
    if (row.kind === 'section') {
      sections.push(row.id)
      current = row.id
    } else if (row.kind === 'rest') {
      current = null
    } else {
      items.push({ id: row.id, sectionId: current })
    }
  }
  return { sections, items }
}

/** Bo'limlar tartibi + har bo'limning mahsulotlaridan tekis ro'yxat yasaydi. */
function build(sectionIds: string[], productsOf: (sectionId: string | null) => string[]): Row[] {
  const rows: Row[] = []
  for (const id of sectionIds) {
    rows.push({ kind: 'section', id })
    for (const p of productsOf(id)) rows.push({ kind: 'product', id: p })
  }
  rows.push({ kind: 'rest' })
  for (const p of productsOf(null)) rows.push({ kind: 'product', id: p })
  return rows
}

export function SectionsPage() {
  const { categories, loading: catLoading } = useCategories()
  const { sections, loading: secLoading } = useSections()
  const { products, loading: prodLoading } = useProducts()
  const { show, node: toast } = useToast()

  const [picked, setPicked] = useState('')
  const category = picked || categories[0]?.name || ''

  const [editing, setEditing] = useState<{ id?: string; name: string; nameRu?: string } | null>(null)
  const [removing, setRemoving] = useState<Section | null>(null)
  const [attaching, setAttaching] = useState<Section | null>(null)
  const [busy, setBusy] = useState(false)

  const own = useMemo(() => sections.filter((s) => s.category === category), [sections, category])
  const productById = useMemo(() => new Map(products.map((p) => [p.docId, p])), [products])
  const sectionById = useMemo(() => new Map(own.map((s) => [s.id, s])), [own])

  // Firestore'dagi joriy joylashuv
  const serverRows = useMemo(() => {
    const ownIds = new Set(own.map((s) => s.id))
    const inCategory = products.filter((p) => p.category === category).sort(byOrder)
    return build(
      own.map((s) => s.id),
      (sectionId) =>
        inCategory
          .filter((p) =>
            sectionId ? p.sectionId === sectionId : !p.sectionId || !ownIds.has(p.sectionId),
          )
          .map((p) => p.docId),
    )
  }, [own, products, category])

  const signature = useCallback((rows: Row[]) => rows.map(rowKey).join(','), [])
  const persist = useCallback(
    async (rows: Row[]) => {
      await apiPost('action', { action: 'catalog.layout', category, ...toPayload(rows) })
    },
    [category],
  )
  const onError = useCallback((m: string) => show(m, 'error'), [show])
  const layout = useOptimisticValue(serverRows, signature, persist, onError, category)
  const rows = layout.value

  /** Bir bo'limni yuqoriga/pastga — ichidagi mahsulotlari bilan birga. */
  const moveSection = (id: string, step: -1 | 1) => {
    const { sections: order } = toPayload(rows)
    const index = order.indexOf(id)
    const target = index + step
    if (index < 0 || target < 0 || target >= order.length) return
    const grouped = groupOf(rows)
    layout.commit(build(moveItem(order, index, target), (sid) => grouped.get(sid) || []))
  }

  const countIn = (sectionId: string | null) => groupOf(rows).get(sectionId)?.length ?? 0

  const saveSection = async () => {
    if (!editing) return
    setBusy(true)
    try {
      await apiPost('action', {
        action: 'section.save',
        id: editing.id,
        name: editing.name,
        nameRu: editing.nameRu ?? '',
        category,
      })
      show(editing.id ? 'Bo‘lim nomi o‘zgardi' : 'Bo‘lim qo‘shildi')
      setEditing(null)
    } catch (error) {
      show(error instanceof Error ? error.message : 'Saqlanmadi', 'error')
    } finally {
      setBusy(false)
    }
  }

  const removeSection = async () => {
    if (!removing) return
    setBusy(true)
    try {
      await apiPost('action', { action: 'section.delete', id: removing.id })
      show('Bo‘lim o‘chirildi — mahsulotlari «Bo‘limsiz» ga o‘tdi')
      setRemoving(null)
    } catch (error) {
      show(error instanceof Error ? error.message : 'O‘chirilmadi', 'error')
    } finally {
      setBusy(false)
    }
  }

  /** Tanlangan mahsulotlarni bo'limga biriktiradi, olib tashlanganlarini bo'limsizga chiqaradi. */
  const attach = (section: Section, selected: Set<string>) => {
    const grouped = groupOf(rows)
    const { sections: order } = toPayload(rows)
    const before = grouped.get(section.id) || []

    const next = new Map<string | null, string[]>()
    for (const [sid, list] of grouped) {
      next.set(sid, sid === section.id ? [] : list.filter((id) => !selected.has(id)))
    }
    // Avval bo'limda bo'lganlar o'z tartibida, yangilari oxirida
    const kept = before.filter((id) => selected.has(id))
    const added = [...selected].filter((id) => !before.includes(id))
    next.set(section.id, [...kept, ...added])
    // Bo'limdan olib tashlanganlar — «Bo'limsiz» boshiga
    const released = before.filter((id) => !selected.has(id))
    next.set(null, [...released, ...(next.get(null) || [])])

    layout.commit(build(order, (sid) => next.get(sid) || []))
    setAttaching(null)
  }

  const loading = catLoading || secLoading || prodLoading
  const productCount = rows.filter((r) => r.kind === 'product').length

  const sortableRows: SortableRow[] = rows.map((row) => {
    if (row.kind === 'product') {
      const product = productById.get(row.id)
      return {
        key: rowKey(row),
        draggable: true,
        render: (handle) => <ProductLine product={product} handle={handle} />,
      }
    }

    if (row.kind === 'rest') {
      return {
        key: 'rest',
        draggable: false,
        render: () => (
          <div className="adm-sec-head adm-sec-head--rest">
            <span className="adm-sec-head__icon"><Inbox size={16} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold">Bo‘limsiz</p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                {countIn(null)} ta · ilovada «Boshqa mahsulotlar» sarlavhasi ostida, oxirida
              </p>
            </div>
          </div>
        ),
      }
    }

    const section = sectionById.get(row.id)
    const { sections: order } = toPayload(rows)
    const index = order.indexOf(row.id)
    const count = countIn(row.id)
    return {
      key: rowKey(row),
      draggable: false,
      render: () => (
        <div className="adm-sec-head">
          <span className="adm-sec-head__icon"><Layers size={16} /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold">{section?.name ?? '…'}</p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              {count ? `${count} ta mahsulot` : 'Bo‘sh — mahsulotni shu yerga suring yoki biriktiring'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button className="adm-icon-btn" onClick={() => moveSection(row.id, -1)} disabled={index <= 0} aria-label="Bo‘limni yuqoriga">
              <ArrowUp size={15} />
            </button>
            <button className="adm-icon-btn" onClick={() => moveSection(row.id, 1)} disabled={index >= order.length - 1} aria-label="Bo‘limni pastga">
              <ArrowDown size={15} />
            </button>
            <button className="adm-icon-btn adm-icon-btn--brand" onClick={() => section && setAttaching(section)} aria-label="Mahsulot biriktirish">
              <Plus size={15} />
            </button>
            <button className="adm-icon-btn" onClick={() => section && setEditing({ id: section.id, name: section.name, nameRu: section.nameRu || '' })} aria-label="Nomini o‘zgartirish">
              <Pencil size={14} />
            </button>
            <button className="adm-icon-btn adm-icon-btn--danger" onClick={() => section && setRemoving(section)} aria-label="Bo‘limni o‘chirish">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ),
    }
  })

  return (
    <>
      <div className="adm-page-head">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Bo‘lim — kategoriya ichidagi guruh. Ilovada sarlavha bo‘lib chiqadi, ostida mahsulotlari.
        </p>
        <div className="adm-page-head__actions">
          <button
            className="adm-btn adm-btn--primary"
            onClick={() => setEditing({ name: '', nameRu: '' })}
            disabled={!category}
          >
            <Plus size={17} /> Bo‘lim qo‘shish
          </button>
        </div>
      </div>

      <div className="scrollbar-none mb-4 flex gap-2 overflow-x-auto pb-1">
        {categories.map((c) => (
          <button
            key={String(c.id)}
            onClick={() => setPicked(c.name)}
            className="shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-bold transition active:scale-95"
            style={{
              borderColor: category === c.name ? 'var(--brand-line)' : 'var(--line)',
              background: category === c.name ? 'var(--brand-soft)' : 'var(--surface)',
              color: category === c.name ? 'var(--brand-strong)' : 'var(--muted)',
            }}
          >
            {c.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid max-w-3xl gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="adm-skeleton h-16" />
          ))}
        </div>
      ) : !category ? (
        <div className="adm-card adm-empty">
          <Layers size={30} />
          <p className="text-sm font-semibold">Avval kategoriya qo‘shing</p>
        </div>
      ) : (
        <div className="max-w-3xl">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs" style={{ color: 'var(--faint)' }}>
            <span>⋮⋮ tutqichdan ushlab suring: sarlavha ostiga qo‘yilgan mahsulot o‘sha bo‘limga o‘tadi.</span>
            <span className="flex shrink-0 items-center gap-1.5">
              {layout.saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {layout.saving ? 'Saqlanmoqda' : `${productCount} ta mahsulot`}
            </span>
          </div>
          <SortableList
            rows={sortableRows}
            // Birinchi qator doim sarlavha — mahsulot uning ustiga chiqmaydi
            minIndex={1}
            onMove={(from, to) => layout.commit(moveItem(rows, from, to))}
          />
        </div>
      )}

      {editing && (
        <Modal
          title={editing.id ? 'Bo‘lim nomini o‘zgartirish' : `Yangi bo‘lim — ${category}`}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="adm-btn adm-btn--ghost flex-1" onClick={() => setEditing(null)} disabled={busy}>
                Bekor qilish
              </button>
              <button className="adm-btn adm-btn--primary flex-1" onClick={saveSection} disabled={busy || !editing.name.trim()}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : null}
                Saqlash
              </button>
            </>
          }
        >
          <label className="adm-label">Nomi</label>
          <input
            className="adm-input"
            autoFocus
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') void saveSection() }}
            placeholder="Musa, Future Fruit, BissGo..."
          />

          <label className="adm-label mt-4">Nomi (ruscha)</label>
          <input
            className="adm-input"
            value={editing.nameRu ?? ''}
            onChange={(e) => setEditing({ ...editing, nameRu: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') void saveSection() }}
            placeholder="Bo‘sh qoldirsangiz o‘zbekchasi ko‘rinadi"
          />
          <p className="mt-2 text-xs" style={{ color: 'var(--faint)' }}>
            Qo‘shilgach «+» tugmasi bilan mahsulot biriktiring yoki mahsulotni sarlavha ostiga suring.
          </p>
        </Modal>
      )}

      {attaching && (
        <AttachDialog
          section={attaching}
          products={products.filter((p) => p.category === category)}
          sectionName={(id) => (id ? sectionById.get(id)?.name : undefined)}
          current={new Set(groupOf(rows).get(attaching.id) || [])}
          onSave={(selected) => attach(attaching, selected)}
          onClose={() => setAttaching(null)}
        />
      )}

      {removing && (
        <ConfirmDialog
          title="Bo‘limni o‘chirish"
          message={`«${removing.name}» o‘chiriladi. Mahsulotlar o‘chmaydi — «Bo‘limsiz» ga o‘tadi.`}
          confirmLabel="O‘chirish"
          busy={busy}
          onConfirm={removeSection}
          onClose={() => setRemoving(null)}
        />
      )}

      {toast}
    </>
  )
}

/** Bo'lim → mahsulot identifikatorlari (tartibi bilan). null — bo'limsiz. */
function groupOf(rows: Row[]): Map<string | null, string[]> {
  const map = new Map<string | null, string[]>()
  let current: string | null = null
  for (const row of rows) {
    if (row.kind === 'section') {
      current = row.id
      map.set(current, [])
    } else if (row.kind === 'rest') {
      current = null
      map.set(null, [])
    } else {
      map.get(current)?.push(row.id)
    }
  }
  return map
}

function ProductLine({ product, handle }: { product?: ProductRow; handle: React.ReactNode }) {
  const thumb = product ? productThumb(product) : ''
  return (
    <div className="adm-sec-item">
      {handle}
      <span className="adm-sec-item__thumb">
        {thumb ? <img src={thumb} alt="" loading="lazy" /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{product?.name ?? '…'}</p>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          {product ? formatPrice(product.price) : ''}
          {product && (product.stock ?? 0) <= 0 ? ' · tugagan' : ''}
        </p>
      </div>
    </div>
  )
}

function AttachDialog({
  section, products, current, sectionName, onSave, onClose,
}: {
  section: Section
  products: ProductRow[]
  current: Set<string>
  sectionName: (id?: string | null) => string | undefined
  onSave: (selected: Set<string>) => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState(() => new Set(current))
  const [query, setQuery] = useState('')

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return [...products]
      .sort(byOrder)
      .filter((p) => !needle || p.name.toLowerCase().includes(needle))
  }, [products, query])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Modal
      wide
      title={`«${section.name}» ga mahsulot biriktirish`}
      onClose={onClose}
      footer={
        <>
          <button className="adm-btn adm-btn--ghost flex-1" onClick={onClose}>
            Bekor qilish
          </button>
          <button className="adm-btn adm-btn--primary flex-1" onClick={() => onSave(selected)}>
            Saqlash · {selected.size} ta
          </button>
        </>
      }
    >
      <div className="relative mb-3">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--faint)' }} />
        <input
          className="adm-input icon-left"
          placeholder="Mahsulot qidirish..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="grid gap-1.5 sm:grid-cols-2">
        {shown.map((product) => {
          const on = selected.has(product.docId)
          const elsewhere = !on && product.sectionId && product.sectionId !== section.id
            ? sectionName(product.sectionId)
            : undefined
          const thumb = productThumb(product)
          return (
            <button
              key={product.docId}
              type="button"
              onClick={() => toggle(product.docId)}
              className={'adm-pick ' + (on ? 'is-on' : '')}
              aria-pressed={on}
            >
              <span className="adm-pick__box">{on ? <Check size={13} strokeWidth={3} /> : null}</span>
              <span className="adm-sec-item__thumb">{thumb ? <img src={thumb} alt="" loading="lazy" /> : null}</span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-bold">{product.name}</span>
                <span className="block truncate text-xs" style={{ color: 'var(--muted)' }}>
                  {elsewhere ? `Hozir: ${elsewhere} — tanlansa shu yerga ko‘chadi` : formatPrice(product.price)}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
