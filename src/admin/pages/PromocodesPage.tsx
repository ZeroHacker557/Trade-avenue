import { Loader2, Pencil, Plus, Tag, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { apiPost } from '../lib/api'
import { usePromocodes, type PromoRow } from '../lib/live'
import { ConfirmDialog, Modal } from '../components/Modal'
import { useToast } from '../components/Toast'

type Draft = {
  id?: string
  code: string
  discountPercent: string
  maxUses: string
  expiresAt: string
  active: boolean
}

const EMPTY: Draft = { code: '', discountPercent: '10', maxUses: '0', expiresAt: '', active: true }

function expired(promo: PromoRow): boolean {
  if (!promo.expiresAt) return false
  const time = Date.parse(promo.expiresAt)
  return Number.isFinite(time) && time < Date.now()
}

function exhausted(promo: PromoRow): boolean {
  const max = Number(promo.maxUses || 0)
  return max > 0 && Number(promo.usageCount || 0) >= max
}

export function PromocodesPage() {
  const { promocodes, loading } = usePromocodes()
  const { show, node: toast } = useToast()

  const [draft, setDraft] = useState<Draft | null>(null)
  const [removing, setRemoving] = useState<PromoRow | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!draft) return
    setBusy(true)
    try {
      await apiPost('action', {
        action: 'promo.save',
        id: draft.id,
        code: draft.code,
        discountPercent: Number(draft.discountPercent),
        maxUses: Number(draft.maxUses) || 0,
        expiresAt: draft.expiresAt || '',
        active: draft.active,
      })
      show(draft.id ? 'Promokod yangilandi' : 'Promokod qo‘shildi')
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
      await apiPost('action', { action: 'promo.delete', id: removing.id })
      show('Promokod o‘chirildi')
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
          Jami {promocodes.length} ta promokod
        </p>
        <div className="adm-page-head__actions">
          <button className="adm-btn adm-btn--primary" onClick={() => setDraft({ ...EMPTY })}>
            <Plus size={17} /> Qo‘shish
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="adm-skeleton h-20" />
          ))}
        </div>
      ) : promocodes.length === 0 ? (
        <div className="adm-card adm-empty">
          <Tag size={30} />
          <p className="text-sm font-semibold">Hali promokod yo‘q</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {promocodes.map((promo) => {
            const dead = !promo.active || expired(promo) || exhausted(promo)
            return (
              <article key={promo.id} className="adm-card p-3.5">
                <div className="flex items-center gap-2">
                  <span
                    className="rounded-lg px-2.5 py-1 font-mono text-sm font-extrabold"
                    style={{
                      background: dead ? 'var(--surface-3)' : 'var(--brand-soft)',
                      color: dead ? 'var(--muted)' : 'var(--brand-strong)',
                    }}
                  >
                    {promo.code}
                  </span>
                  <span className="text-lg font-extrabold">−{promo.discountPercent}%</span>

                  <div className="ml-auto flex gap-1.5">
                    <button
                      className="grid size-8 place-items-center rounded-lg transition active:scale-90"
                      style={{ background: 'var(--surface-2)' }}
                      onClick={() =>
                        setDraft({
                          id: promo.id,
                          code: promo.code,
                          discountPercent: String(promo.discountPercent),
                          maxUses: String(promo.maxUses ?? 0),
                          expiresAt: (promo.expiresAt || '').slice(0, 10),
                          active: promo.active !== false,
                        })
                      }
                      aria-label="Tahrirlash"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="grid size-8 place-items-center rounded-lg transition active:scale-90"
                      style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
                      onClick={() => setRemoving(promo)}
                      aria-label="O‘chirish"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
                  Ishlatilgan: <b>{promo.usageCount ?? 0}</b>
                  {Number(promo.maxUses) > 0 ? ` / ${promo.maxUses}` : ' (cheksiz)'}
                </p>
                {promo.expiresAt && (
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    Amal qiladi: {promo.expiresAt.slice(0, 10)} gacha
                  </p>
                )}
                {dead && (
                  <p className="mt-1.5 text-xs font-bold" style={{ color: 'var(--danger)' }}>
                    {!promo.active
                      ? 'O‘chirilgan'
                      : expired(promo)
                        ? 'Muddati tugagan'
                        : 'Limiti tugagan'}
                  </p>
                )}
              </article>
            )
          })}
        </div>
      )}

      {draft && (
        <Modal
          title={draft.id ? 'Promokodni tahrirlash' : 'Yangi promokod'}
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="adm-label">Kod</label>
              <input
                className="adm-input font-mono uppercase"
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
                placeholder="MUSA10"
              />
            </div>

            <div>
              <label className="adm-label">Chegirma (%)</label>
              <input
                className="adm-input"
                inputMode="numeric"
                value={draft.discountPercent}
                onChange={(e) =>
                  setDraft({ ...draft, discountPercent: e.target.value.replace(/\D/g, '') })
                }
              />
            </div>

            <div>
              <label className="adm-label">Limit — 0 cheksiz</label>
              <input
                className="adm-input"
                inputMode="numeric"
                value={draft.maxUses}
                onChange={(e) => setDraft({ ...draft, maxUses: e.target.value.replace(/\D/g, '') })}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="adm-label">Amal qilish muddati — ixtiyoriy</label>
              <input
                className="adm-input"
                type="date"
                value={draft.expiresAt}
                onChange={(e) => setDraft({ ...draft, expiresAt: e.target.value })}
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2.5 sm:col-span-2">
              <input
                type="checkbox"
                className="size-4"
                checked={draft.active}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
              />
              <span className="text-sm font-semibold">Faol — mijozlar ishlata oladi</span>
            </label>
          </div>
        </Modal>
      )}

      {removing && (
        <ConfirmDialog
          title="Promokodni o‘chirish"
          message={`«${removing.code}» butunlay o‘chiriladi.`}
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
