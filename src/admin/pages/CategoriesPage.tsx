import { LayoutGrid, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { categoryIcon } from '../../utils/category-icons'
import { apiPost } from '../lib/api'
import { useCategories, useProducts } from '../lib/live'
import { ConfirmDialog, Modal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { moveItem, useOptimisticValue } from '../lib/sort'
import { SortableList } from '../components/SortableList'

type Draft = { id?: string; name: string; nameRu: string; icon: string }

/** Admin tanlashi mumkin bo'lgan ikonka kalitlari — category-icons.ts dagilar. */
const ICONS = [
  'chuchvara', 'manti', 'somsa', 'kotlet', 'tovuq', 'meat', 'fish',
  'muzqaymoq', 'eskimo', 'sirok', 'sut', 'xamir', 'frozen', 'set', 'box',
]

export function CategoriesPage() {
  const { categories, loading } = useCategories()
  const { products } = useProducts()
  const { show, node: toast } = useToast()

  const [draft, setDraft] = useState<Draft | null>(null)
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const countIn = (name: string) => products.filter((p) => p.category === name).length

  /*
   * Katalogdagi tartib shu yerda — sudrab belgilanadi (mini app `order`
   * bo'yicha saralaydi). Qo'yib yuborilgan zahoti ro'yxat yangi tartibda
   * turadi, serverga esa bitta so'rov ketadi.
   */
  const serverIds = useMemo(() => categories.map((c) => String(c.id)), [categories])
  const order = useOptimisticValue(
    serverIds,
    (ids) => ids.join('|'),
    async (ids) => {
      await apiPost('action', { action: 'order.sort', entity: 'category', ids })
    },
    (m) => show(m, 'error'),
  )
  const byId = new Map(categories.map((c) => [String(c.id), c]))
  const ordered = order.value.map((id) => byId.get(id)).filter((c) => c !== undefined)

  const save = async () => {
    if (!draft) return
    setBusy(true)
    try {
      await apiPost('action', {
        action: 'category.save',
        id: draft.id,
        name: draft.name,
        nameRu: draft.nameRu,
        icon: draft.icon,
      })
      show(draft.id ? 'Kategoriya yangilandi' : 'Kategoriya qo‘shildi')
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
      await apiPost('action', { action: 'category.delete', id: removing.id })
      show('Kategoriya o‘chirildi')
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
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Jami {categories.length} ta kategoriya
        </p>
        <div className="adm-page-head__actions">
          <button
            className="adm-btn adm-btn--primary"
            onClick={() => setDraft({ name: '', nameRu: '', icon: 'box' })}
          >
            <Plus size={17} /> Qo‘shish
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="adm-skeleton h-20" />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <div className="adm-card adm-empty">
          <LayoutGrid size={30} />
          <p className="text-sm font-semibold">Hali kategoriya yo‘q</p>
        </div>
      ) : (
        <div className="max-w-2xl">
          <p className="mb-2 text-xs" style={{ color: 'var(--faint)' }}>
            Tartibni o‘zgartirish uchun chapdagi ⋮⋮ tutqichdan ushlab suring — ilovada ham shu tartibda chiqadi.
          </p>
          <SortableList
            onMove={(from, to) => order.commit(moveItem(order.value, from, to))}
            rows={ordered.map((category) => {
              const Icon = categoryIcon(category.icon, category.name)
              const id = String(category.id)
              return {
                key: id,
                draggable: true,
                render: (handle) => (
                  <article className="adm-card flex items-center gap-2.5 p-2.5 sm:p-3">
                    {handle}
                    <span
                      className="grid size-10 shrink-0 place-items-center rounded-xl"
                      style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}
                    >
                      <Icon size={19} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-extrabold">{category.name}</p>
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>
                        {countIn(category.name)} ta mahsulot
                      </p>
                    </div>
                    <button
                      className="grid size-8 shrink-0 place-items-center rounded-lg transition active:scale-90"
                      style={{ background: 'var(--surface-2)' }}
                      onClick={() => setDraft({ id, name: category.name, nameRu: category.nameRu || '', icon: category.icon })}
                      aria-label="Tahrirlash"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="grid size-8 shrink-0 place-items-center rounded-lg transition active:scale-90"
                      style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
                      onClick={() => setRemoving({ id, name: category.name })}
                      aria-label="O‘chirish"
                    >
                      <Trash2 size={15} />
                    </button>
                  </article>
                ),
              }
            })}
          />
        </div>
      )}

      {draft && (
        <Modal
          title={draft.id ? 'Kategoriyani tahrirlash' : 'Yangi kategoriya'}
          onClose={() => setDraft(null)}
          footer={
            <>
              <button
                className="adm-btn adm-btn--ghost flex-1"
                onClick={() => setDraft(null)}
                disabled={busy}
              >
                Bekor qilish
              </button>
              <button className="adm-btn adm-btn--primary flex-1" onClick={save} disabled={busy}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : null}
                Saqlash
              </button>
            </>
          }
        >
          <label className="adm-label">Nomi</label>
          <input
            className="adm-input"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Chuchvara"
          />

          {/* Ruscha nom faqat ko'rinish uchun — mahsulotlar kategoriyaga
              o'zbekcha nom bilan bog'langan, shuning uchun filtr buzilmaydi */}
          <label className="adm-label mt-4">Nomi (ruscha)</label>
          <input
            className="adm-input"
            value={draft.nameRu}
            onChange={(e) => setDraft({ ...draft, nameRu: e.target.value })}
            placeholder="Пельмени"
          />
          <p className="mt-2 text-xs" style={{ color: 'var(--faint)' }}>
            Bo‘sh qoldirilsa ruscha tilda ham o‘zbekcha nomi ko‘rinadi.
          </p>

          <p className="adm-label mt-4">Ikonka</p>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-8">
            {ICONS.map((key) => {
              const Icon = categoryIcon(key, '')
              const active = draft.icon === key
              return (
                <button
                  key={key}
                  className="grid aspect-square place-items-center rounded-xl border transition active:scale-95"
                  style={{
                    borderColor: active ? 'var(--brand-line)' : 'var(--line)',
                    background: active ? 'var(--brand-soft)' : 'var(--surface-2)',
                    color: active ? 'var(--brand)' : 'var(--muted)',
                  }}
                  onClick={() => setDraft({ ...draft, icon: key })}
                  aria-label={key}
                  aria-pressed={active}
                >
                  <Icon size={19} />
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-xs" style={{ color: 'var(--faint)' }}>
            Ikonka tanlanmasa, nom bo‘yicha avtomatik topiladi.
          </p>
        </Modal>
      )}

      {removing && (
        <ConfirmDialog
          title="Kategoriyani o‘chirish"
          message={`«${removing.name}» o‘chiriladi. Ichida mahsulot bo‘lsa, avval ularni boshqa kategoriyaga ko‘chirish kerak.`}
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
