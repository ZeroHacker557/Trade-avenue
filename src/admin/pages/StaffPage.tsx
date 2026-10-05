import { Loader2, Pencil, Plus, ShieldCheck, Trash2, UserCog } from 'lucide-react'
import { useState } from 'react'
import { apiPost } from '../lib/api'
import { useStaff, type StaffRow } from '../lib/live'
import type { Staff, StaffRole } from '../lib/auth'
import { ConfirmDialog, Modal } from '../components/Modal'
import { useToast } from '../components/Toast'

type Draft = {
  uid?: string
  email: string
  name: string
  password: string
  role: StaffRole
  telegramId: string
  phone: string
  active: boolean
  /**
   * Panelga kirish kerakmi.
   *
   * Kuryer Telegramda ishlaydi — unga email/parol shart emas, shuning
   * uchun bu maydon alohida turadi va formada nima ko'rinishini
   * belgilaydi. Admin va ega uchun doim true.
   */
  webAccess: boolean
  /** Ega/admin kuryer sifatida ham ishlaydi — mini app'da kuryer sahifasi. */
  canDeliver: boolean
}

const EMPTY: Draft = {
  email: '', name: '', password: '', role: 'courier', telegramId: '',
  phone: '', active: true, webAccess: false, canDeliver: false,
}

const ROLE_LABEL: Record<StaffRole, string> = {
  owner: 'Ega',
  admin: 'Admin',
  courier: 'Kuryer',
}

const ROLE_TONE: Record<StaffRole, { fg: string; bg: string }> = {
  owner: { fg: 'var(--brand-strong)', bg: 'var(--brand-soft)' },
  admin: { fg: 'var(--royal)', bg: 'var(--royal-soft)' },
  courier: { fg: 'var(--gold)', bg: 'var(--gold-soft)' },
}

export function StaffPage({ me }: { me: Staff }) {
  const { staff, loading } = useStaff(me.role === 'owner')
  const { show, node: toast } = useToast()

  const [draft, setDraft] = useState<Draft | null>(null)
  const [removing, setRemoving] = useState<StaffRow | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!draft) return
    setBusy(true)
    try {
      await apiPost('action', {
        action: 'staff.save',
        ...draft,
        // Telegram-only kuryerda email yuborilmaydi — server shu bo'yicha
        // Auth hisobi kerakmi-yo'qmi deb qaror qiladi.
        email: draft.webAccess ? draft.email : '',
      })
      show(draft.uid ? 'Xodim yangilandi' : 'Xodim qo‘shildi')
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
      const result = await apiPost<{ unassigned: number }>('action', {
        action: 'staff.delete',
        uid: removing.uid,
      })
      show(
        result.unassigned
          ? `Xodim o‘chirildi. ${result.unassigned} ta buyurtma biriktirilmagan holatga qaytdi.`
          : 'Xodim o‘chirildi',
      )
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
          Jami {staff.length} ta xodim
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
      ) : staff.length === 0 ? (
        <div className="adm-card adm-empty">
          <UserCog size={30} />
          <p className="text-sm font-semibold">Xodim yo‘q</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {staff.map((person) => {
            const tone = ROLE_TONE[person.role]
            return (
              <article key={person.uid} className="adm-card p-3.5">
                <div className="flex items-center gap-3">
                  <span
                    className="grid size-11 shrink-0 place-items-center rounded-full text-base font-extrabold"
                    style={{ background: tone.bg, color: tone.fg }}
                  >
                    {person.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-extrabold">
                      {person.name}
                      {person.uid === me.uid && (
                        <span className="ml-1.5 text-xs font-bold" style={{ color: 'var(--muted)' }}>
                          (siz)
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs" style={{ color: 'var(--muted)' }}>
                      {person.email}
                    </p>
                  </div>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="adm-badge" style={{ background: tone.bg, color: tone.fg }}>
                    <ShieldCheck size={12} /> {ROLE_LABEL[person.role]}
                  </span>
                  {!person.active && (
                    <span
                      className="adm-badge"
                      style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
                    >
                      Bloklangan
                    </span>
                  )}
                  {(person.role === 'courier' || person.canDeliver) && (
                    <span
                      className="adm-badge"
                      style={person.onShift
                        ? { background: 'var(--brand-soft)', color: 'var(--brand)' }
                        : { background: 'var(--surface-2)', color: 'var(--muted)' }}
                    >
                      {person.onShift ? '● Ishda' : 'Dam olmoqda'}
                    </span>
                  )}
                  {!!person.ratingCount && (
                    <span className="adm-badge" style={{ background: 'var(--gold-soft)', color: 'var(--gold-strong)' }}>
                      ★ {((person.ratingSum ?? 0) / person.ratingCount).toFixed(1)} ({person.ratingCount})
                    </span>
                  )}
                  {person.role !== 'courier' && person.canDeliver && (
                    <span className="adm-badge" style={{ background: ROLE_TONE.courier.bg, color: ROLE_TONE.courier.fg }}>
                      + Kuryer
                    </span>
                  )}
                  {person.telegramId ? (
                    <span
                      className="adm-badge"
                      style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}
                    >
                      TG: {person.telegramId}
                    </span>
                  ) : (
                    person.role === 'courier' && (
                      <span
                        className="adm-badge"
                        style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}
                      >
                        Telegram ID yo‘q
                      </span>
                    )
                  )}

                  <span className="ml-auto flex gap-1.5">
                    <button
                      className="grid size-8 place-items-center rounded-lg transition active:scale-90"
                      style={{ background: 'var(--surface-2)' }}
                      onClick={() =>
                        setDraft({
                          uid: person.uid,
                          email: person.email,
                          name: person.name,
                          password: '',
                          role: person.role,
                          telegramId: person.telegramId ? String(person.telegramId) : '',
                          phone: person.phone || '',
                          active: person.active,
                          webAccess: person.webAccess ?? Boolean(person.email),
                          canDeliver: person.canDeliver === true,
                        })
                      }
                      aria-label="Tahrirlash"
                    >
                      <Pencil size={15} />
                    </button>
                    {person.uid !== me.uid && (
                      <button
                        className="grid size-8 place-items-center rounded-lg transition active:scale-90"
                        style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
                        onClick={() => setRemoving(person)}
                        aria-label="O‘chirish"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </span>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {draft && (
        <Modal
          title={draft.uid ? 'Xodimni tahrirlash' : 'Yangi xodim'}
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
              <label className="adm-label">Rol</label>
              <select
                className="adm-input"
                value={draft.role}
                onChange={(e) => {
                  const role = e.target.value as StaffRole
                  // Admin va ega panelsiz ishlay olmaydi — ularga
                  // email/parol doim kerak.
                  setDraft({ ...draft, role, webAccess: role !== 'courier' || draft.webAccess })
                }}
              >
                <option value="courier">Kuryer — Telegramda ishlaydi</option>
                <option value="admin">Admin — panelga kiradi</option>
                <option value="owner">Ega — to‘liq huquq</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="adm-label">Ism</label>
              <input
                className="adm-input"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Sardor Aliyev"
              />
            </div>

            {/*
              Kuryerga veb panel shart emas — u Telegramda ishlaydi.
              Shuning uchun email/parol faqat so'ralganda ko'rinadi:
              ortiqcha maydon xodim qo'shishni sekinlashtiradi.
            */}
            {draft.webAccess ? (
              <>
                <div className="sm:col-span-2">
                  <label className="adm-label">Email — panelga kirish uchun</label>
                  <input
                    className="adm-input"
                    type="email"
                    autoCapitalize="none"
                    value={draft.email}
                    onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                    placeholder="sardor@musa.uz"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="adm-label">
                    {draft.uid && draft.email ? 'Yangi parol — bo‘sh qoldirsangiz o‘zgarmaydi' : 'Parol'}
                  </label>
                  <input
                    className="adm-input"
                    type="text"
                    autoComplete="new-password"
                    value={draft.password}
                    onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                    placeholder="Kamida 8 belgi"
                  />
                </div>

                {draft.role === 'courier' && (
                  <button
                    type="button"
                    className="text-left text-xs font-bold sm:col-span-2"
                    style={{ color: 'var(--muted)' }}
                    onClick={() =>
                      setDraft({ ...draft, webAccess: false, email: '', password: '' })
                    }
                  >
                    ← Panelsiz, faqat Telegram orqali
                  </button>
                )}
              </>
            ) : (
              <div
                className="rounded-xl p-3 sm:col-span-2"
                style={{ background: 'var(--surface-2)' }}
              >
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  Kuryer buyurtmalarni <b>Telegram orqali</b> oladi — panelga kirishi
                  shart emas, shuning uchun email va parol so‘ralmaydi.
                </p>
                <button
                  type="button"
                  className="mt-2 text-xs font-bold"
                  style={{ color: 'var(--brand)' }}
                  onClick={() => setDraft({ ...draft, webAccess: true })}
                >
                  + Panelga kirish ham berilsin
                </button>
              </div>
            )}

            <div>
              <label className="adm-label">Telefon</label>
              <input
                className="adm-input"
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                placeholder="+998 90 123 45 67"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="adm-label">
                Telegram ID{' '}
                {draft.role === 'courier' && (
                  <span style={{ color: 'var(--danger)' }}>*</span>
                )}
              </label>
              <input
                className="adm-input"
                inputMode="numeric"
                value={draft.telegramId}
                onChange={(e) =>
                  setDraft({ ...draft, telegramId: e.target.value.replace(/\D/g, '') })
                }
                placeholder="7203124812"
              />
              <p className="mt-1.5 text-xs" style={{ color: 'var(--faint)' }}>
                Buyurtmalar shu Telegram hisobiga tushadi. ID ni @userinfobot beradi.
                {draft.role === 'courier' && ' Kuryer uchun majburiy.'}
              </p>
              {draft.role !== 'courier' && (
                <p className="mt-1 text-xs" style={{ color: 'var(--faint)' }}>
                  Bo‘sh qoldirsangiz ham bo‘ladi: xodim botdagi «🛠 Admin panel»
                  tugmasi orqali panelga kirganda ID o‘zi yozilib qoladi.
                </p>
              )}
            </div>

            {/* Ega yoki admin o'zi ham buyurtma yetkazishi mumkin */}
            {draft.role !== 'courier' && (
              <label
                className="flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 sm:col-span-2"
                style={{
                  borderColor: draft.canDeliver ? 'var(--gold-line)' : 'var(--line)',
                  background: draft.canDeliver ? 'var(--gold-soft)' : 'var(--surface)',
                }}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 size-4"
                  checked={draft.canDeliver}
                  onChange={(e) => setDraft({ ...draft, canDeliver: e.target.checked })}
                />
                <span className="min-w-0">
                  <b className="block text-sm">Kuryer sifatida ham ishlaydi</b>
                  <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                    Rol o‘zgarmaydi. Mini app'da kuryer sahifasi ochiladi, yangi buyurtmalar
                    «Sizni … kutmoqda» deb botga tushadi. Telegram ID kerak.
                  </span>
                </span>
              </label>
            )}

            <label className="flex cursor-pointer items-center gap-2.5 sm:col-span-2">
              <input
                type="checkbox"
                className="size-4"
                checked={draft.active}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
              />
              <span className="text-sm font-semibold">
                Faol — {draft.webAccess ? 'tizimga kira oladi' : 'buyurtma oladi'}
              </span>
            </label>
          </div>
        </Modal>
      )}

      {removing && (
        <ConfirmDialog
          title="Xodimni o‘chirish"
          message={`«${removing.name}» hisobi butunlay o‘chiriladi va u tizimga kira olmaydi. Unga biriktirilgan buyurtmalar bo‘shatiladi.`}
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
