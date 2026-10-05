import {
  Ban, CheckCircle2, Copy, KeyRound, Loader2, MapPin, Phone, Plus, Printer, RefreshCw, Search, Store,
  Trash2, Unlink, UserRound, Users,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { apiPost } from '../lib/api'
import { useCustomers, useShopCodes, useShops, useShopsSyncInfo, type ShopRow } from '../lib/live'
import { ConfirmDialog, Modal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { usePrintDoc } from '../lib/print'
import { dateTime } from '../lib/dates'
import { BRAND } from '../../config/brand'
import { WeekdayPicker } from '../components/WeekdayPicker'

type Filter = 'all' | 'unlinked' | 'linked' | 'nocode' | 'blocked'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Barchasi' },
  { id: 'unlinked', label: 'Ulanmagan' },
  { id: 'linked', label: 'Ulangan' },
  { id: 'nocode', label: 'Kodsiz' },
  { id: 'blocked', label: 'Bloklangan' },
]

/** «998901234567» → «+998 90 123 45 67». */
function prettyPhone(value: string): string {
  const d = value.replace(/\D/g, '')
  if (d.length !== 12) return value
  return `+${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10, 12)}`
}

const WEEKDAY = ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh']
const weekdayNames = (days: number[]) =>
  [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WEEKDAY[d]).join(', ')

const allPhones = (shop: ShopRow) => [...new Set([...shop.phones, ...shop.extraPhones])]
const isOpen = (shop: ShopRow) => shop.active && shop.linkoActive

/**
 * Do'konlar — Trade Avenue mijozlari.
 *
 * Linko'dan sinxronlanadi (yoki qo'lda qo'shiladi). Har do'konga 6 belgili
 * kirish kodi beriladi; agent kodni do'konga olib boradi, do'konchi esa
 * mini app'da telefon + kod bilan kiradi. Shu yerda kim ulangani ko'rinadi
 * va kerak bo'lsa uziladi yoki do'kon bloklanadi.
 */
export function ShopsPage() {
  const { shops, loading } = useShops()
  const codes = useShopCodes()
  const sync = useShopsSyncInfo()
  const { customers } = useCustomers()
  const { show, node: toast } = useToast()
  const printer = usePrintDoc()

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [agent, setAgent] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState('')

  const userName = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of customers) {
      const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || `ID ${c.id}`
      map.set(c.id, c.username ? `${name} (@${c.username})` : name)
    }
    return map
  }, [customers])

  const agents = useMemo(
    () => [...new Set(shops.map((s) => s.agentName).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [shops],
  )

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const digits = needle.replace(/\D/g, '')
    return shops.filter((shop) => {
      if (filter === 'unlinked' && (shop.memberIds.length > 0 || !isOpen(shop))) return false
      if (filter === 'linked' && shop.memberIds.length === 0) return false
      if (filter === 'nocode' && (shop.hasCode || !isOpen(shop))) return false
      if (filter === 'blocked' && isOpen(shop)) return false
      if (agent && shop.agentName !== agent) return false
      if (!needle) return true
      return (
        shop.name.toLowerCase().includes(needle) ||
        shop.address.toLowerCase().includes(needle) ||
        shop.agentName.toLowerCase().includes(needle) ||
        (codes.get(shop.id) || '').toLowerCase() === needle ||
        (digits.length >= 4 && allPhones(shop).some((p) => p.includes(digits)))
      )
    })
  }, [shops, filter, agent, query, codes])

  const totals = useMemo(() => ({
    all: shops.length,
    coded: shops.filter((s) => s.hasCode).length,
    linked: shops.filter((s) => s.memberIds.length > 0).length,
    accounts: shops.reduce((sum, s) => sum + s.memberIds.length, 0),
  }), [shops])

  const run = async (key: string, action: string, body: Record<string, unknown> = {}) => {
    setBusy(key)
    try {
      return await apiPost<Record<string, unknown>>('action', { action, ...body })
    } catch (error) {
      show(error instanceof Error ? error.message : 'Bajarilmadi', 'error')
      return null
    } finally {
      setBusy('')
    }
  }

  const printCards = (rows: ShopRow[]) => {
    const withCode = rows.filter((s) => codes.get(s.id))
    if (!withCode.length) return show('Chop etish uchun kodli do‘kon yo‘q — avval kod bering', 'error')
    printer.print(<ShopCodeCards shops={withCode} codes={codes} />)
  }

  const open = openId ? shops.find((s) => s.id === openId) ?? null : null

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Jami do‘konlar" value={totals.all} />
        <Stat label="Kod berilgan" value={totals.coded} />
        <Stat label="Ilovaga ulangan" value={totals.linked} hint={totals.all ? `${Math.round((totals.linked / totals.all) * 100)}%` : undefined} />
        <Stat label="Ulangan akkauntlar" value={totals.accounts} />
      </div>

      <div className="adm-card mb-4 p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <button className="adm-btn adm-btn--primary" disabled={!!busy} onClick={async () => {
            const result = await run('sync', 'shops.sync')
            if (result) show(String(result.report || 'Sinxronlandi'))
          }}>
            {busy === 'sync' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Linko’dan yangilash
          </button>
          <button className="adm-btn adm-btn--ghost" disabled={!!busy} onClick={async () => {
            const result = await run('codes', 'shops.codesAll')
            if (result) show(`${Number(result.issued) || 0} ta do‘konga kod berildi`)
          }}>
            {busy === 'codes' ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />} Kodsizlarga kod berish
          </button>
          <button className="adm-btn adm-btn--ghost" onClick={() => printCards(visible)}>
            <Printer size={16} /> Kodlarni chop etish ({visible.filter((s) => codes.get(s.id)).length})
          </button>
          <button className="adm-btn adm-btn--ghost ml-auto" onClick={() => setCreating(true)}>
            <Plus size={16} /> Do‘kon qo‘shish
          </button>
        </div>
        <p className="mt-2 text-xs" style={{ color: 'var(--faint)' }}>
          {sync.lastSyncAt ? `Oxirgi sinxron: ${dateTime(sync.lastSyncAt)} — ${sync.lastReport ?? ''}` : 'Linko’dan hali sinxronlanmagan'}
        </p>
      </div>

      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--faint)' }} />
          <input
            className="adm-input icon-left"
            placeholder="Nomi, manzili, telefoni, agenti yoki kodi bo‘yicha..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {agents.length > 0 && (
          <select className="adm-input lg:w-56" value={agent} onChange={(e) => setAgent(e.target.value)} aria-label="Agent">
            <option value="">Hamma agentlar</option>
            {agents.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        )}
      </div>

      <div className="scrollbar-none mb-3 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className="shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-bold transition active:scale-95"
            style={{
              borderColor: filter === f.id ? 'var(--brand-line)' : 'var(--line)',
              background: filter === f.id ? 'var(--brand-soft)' : 'var(--surface)',
              color: filter === f.id ? 'var(--brand-strong)' : 'var(--muted)',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="adm-skeleton h-16" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="adm-card adm-empty">
          <Store size={30} />
          <p className="text-sm font-semibold">{shops.length ? 'Do‘kon topilmadi' : 'Do‘konlar hali yo‘q — Linko’dan yangilang yoki qo‘lda qo‘shing'}</p>
        </div>
      ) : (
        <div className="grid gap-2.5 lg:grid-cols-2">
          {visible.map((shop) => (
            <button key={shop.id} type="button" className="adm-card p-3.5 text-left" onClick={() => setOpenId(shop.id)}>
              <div className="flex items-start gap-3">
                <span
                  className="grid size-10 shrink-0 place-items-center rounded-xl"
                  style={{ background: isOpen(shop) ? 'var(--brand-soft)' : 'var(--surface-3)', color: isOpen(shop) ? 'var(--brand)' : 'var(--faint)' }}
                >
                  <Store size={19} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold">{shop.name}</p>
                  <p className="truncate text-xs" style={{ color: 'var(--muted)' }}>{shop.address || 'Manzil yo‘q'}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                    {shop.agentName && <span className="adm-pill">{shop.agentName}</span>}
                    {!isOpen(shop) && <span className="adm-pill" style={{ color: 'var(--danger)' }}>Bloklangan</span>}
                    {shop.source === 'manual' && <span className="adm-pill">Qo‘lda</span>}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <span className="shop-code-chip">{codes.get(shop.id) || '——'}</span>
                  <span className="mt-1 flex items-center justify-end gap-1 text-xs font-bold" style={{ color: shop.memberIds.length ? 'var(--success)' : 'var(--faint)' }}>
                    <Users size={12} /> {shop.memberIds.length}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && (
        <ShopDetail
          shop={open}
          code={codes.get(open.id) || ''}
          userName={userName}
          busy={busy}
          run={run}
          onToast={show}
          onPrint={() => printCards([open])}
          onClose={() => setOpenId(null)}
        />
      )}
      {creating && (
        <ShopForm
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            setCreating(false)
            setOpenId(id)
            show('Do‘kon qo‘shildi')
          }}
          run={run}
          busy={busy === 'save'}
        />
      )}
      {printer.node}
      {toast}
    </>
  )
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="adm-card p-4">
      <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{label}</p>
      <p className="mt-1 flex items-baseline gap-2 text-2xl font-extrabold">
        {value}
        {hint && <span className="text-sm font-bold" style={{ color: 'var(--faint)' }}>{hint}</span>}
      </p>
    </div>
  )
}

type Run = (key: string, action: string, body?: Record<string, unknown>) => Promise<Record<string, unknown> | null>

function ShopDetail({
  shop, code, userName, busy, run, onToast, onPrint, onClose,
}: {
  shop: ShopRow
  code: string
  userName: Map<string, string>
  busy: string
  run: Run
  onToast: (message: string, kind?: 'error') => void
  onPrint: () => void
  onClose: () => void
}) {
  const [confirm, setConfirm] = useState<null | 'regen' | 'unbindAll' | 'block' | 'delete'>(null)
  const [editing, setEditing] = useState(false)
  const phones = allPhones(shop)

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(() => onToast('Nusxa olindi'))
  }

  return (
    <Modal title={shop.name} onClose={onClose} wide>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="adm-card p-3.5">
          <p className="text-sm font-extrabold">Ma’lumot</p>
          <div className="mt-2 grid gap-1.5 text-sm" style={{ color: 'var(--muted)' }}>
            <span className="flex items-start gap-2"><MapPin size={15} className="mt-0.5 shrink-0" /> {shop.address || '—'}</span>
            {phones.map((p) => (
              <a key={p} href={`tel:+${p.replace(/\D/g, '')}`} className="flex items-center gap-2" style={{ color: 'var(--brand)' }}>
                <Phone size={15} /> {prettyPhone(p)}
                {shop.extraPhones.includes(p) && !shop.phones.includes(p) && <span className="text-xs" style={{ color: 'var(--faint)' }}>(qo‘shimcha)</span>}
              </a>
            ))}
            {!phones.length && <span style={{ color: 'var(--danger)' }}>Telefon yo‘q — do‘konchi kira olmaydi. Qo‘shimcha raqam qo‘shing.</span>}
            <span>Agent: <b style={{ color: 'var(--ink)' }}>{shop.agentName || '—'}</b></span>
            <span>Yetkazish kunlari: <b style={{ color: 'var(--ink)' }}>{shop.deliveryDays.length ? weekdayNames(shop.deliveryDays) : 'umumiy'}</b></span>
            <span>Narxlar ro‘yxati: <b style={{ color: 'var(--ink)' }}>{shop.priceListName || (shop.priceListId ? `#${shop.priceListId}` : 'umumiy')}</b></span>
            {shop.marketTypeName && <span>Turi: {shop.marketTypeName}</span>}
            {shop.linkoId > 0 && <span>Linko ID: {shop.linkoId}</span>}
            {shop.note && <span>Izoh: {shop.note}</span>}
            {!shop.linkoActive && <span style={{ color: 'var(--danger)' }}>Linko’da o‘chirilgan</span>}
          </div>
          <button className="adm-btn adm-btn--ghost mt-3 w-full" onClick={() => setEditing(true)}>Tahrirlash</button>
        </section>

        <section className="adm-card p-3.5">
          <p className="text-sm font-extrabold">Kirish kodi</p>
          {code ? (
            <>
              <div className="mt-2 flex items-center gap-2">
                <span className="shop-code-big">{code}</span>
                <button className="adm-btn adm-btn--ghost" onClick={() => copy(code)} aria-label="Nusxa olish"><Copy size={16} /></button>
              </div>
              <p className="mt-1.5 text-xs" style={{ color: 'var(--faint)' }}>
                {shop.codeIssuedAt ? `Berilgan: ${dateTime(shop.codeIssuedAt)}` : ''}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button className="adm-btn adm-btn--ghost" onClick={onPrint}><Printer size={16} /> Chop etish</button>
                <button className="adm-btn adm-btn--ghost" onClick={() => setConfirm('regen')}><RefreshCw size={16} /> Yangilash</button>
              </div>
            </>
          ) : (
            <button
              className="adm-btn adm-btn--primary mt-3 w-full"
              disabled={!!busy}
              onClick={async () => {
                const result = await run('code', 'shops.code', { shopId: shop.id })
                if (result) onToast(`Kod: ${String(result.code)}`)
              }}
            >
              {busy === 'code' ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />} Kod berish
            </button>
          )}
        </section>

        <section className="adm-card p-3.5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-extrabold">Ulangan akkauntlar ({shop.memberIds.length})</p>
            {shop.memberIds.length > 1 && (
              <button className="text-xs font-bold" style={{ color: 'var(--danger)' }} onClick={() => setConfirm('unbindAll')}>Hammasini uzish</button>
            )}
          </div>
          {shop.memberIds.length === 0 ? (
            <p className="mt-2 text-sm" style={{ color: 'var(--faint)' }}>Hali hech kim kirmagan. Kodni agent orqali do‘konga yetkazing.</p>
          ) : (
            <ul className="mt-2 grid gap-1.5">
              {shop.memberIds.map((uid) => (
                <li key={uid} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'var(--surface-2)' }}>
                  <UserRound size={16} style={{ color: 'var(--muted)' }} />
                  <span className="min-w-0 flex-1 truncate text-sm">{userName.get(uid) || `ID ${uid}`}</span>
                  <button
                    className="flex items-center gap-1 text-xs font-bold"
                    style={{ color: 'var(--danger)' }}
                    disabled={!!busy}
                    onClick={async () => {
                      const result = await run('unbind', 'shops.unbind', { shopId: shop.id, uid })
                      if (result) onToast('Akkaunt uzildi')
                    }}
                  >
                    <Unlink size={13} /> Uzish
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-wrap gap-2 lg:col-span-2">
          <button className="adm-btn adm-btn--ghost" onClick={() => setConfirm('block')} disabled={!!busy}>
            {shop.active ? <><Ban size={16} /> Bloklash</> : <><CheckCircle2 size={16} /> Blokdan chiqarish</>}
          </button>
          {shop.source === 'manual' && (
            <button className="adm-btn adm-btn--ghost" style={{ color: 'var(--danger)' }} onClick={() => setConfirm('delete')}>
              <Trash2 size={16} /> O‘chirish
            </button>
          )}
        </section>
      </div>

      {editing && (
        <ShopForm shop={shop} run={run} busy={busy === 'save'} onClose={() => setEditing(false)} onSaved={() => {
          setEditing(false)
          onToast('Saqlandi')
        }} />
      )}

      {confirm === 'regen' && (
        <ConfirmDialog
          title="Kodni yangilash"
          message="Eski kod endi ishlamaydi. Ulangan akkauntlar qoladi. Yangi kodni do‘konga qayta yetkazish kerak bo‘ladi."
          confirmLabel="Yangilash"
          busy={busy === 'code'}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            const result = await run('code', 'shops.code', { shopId: shop.id, regenerate: true })
            setConfirm(null)
            if (result) onToast(`Yangi kod: ${String(result.code)}`)
          }}
        />
      )}
      {confirm === 'unbindAll' && (
        <ConfirmDialog
          title="Hamma akkauntlarni uzish"
          message="Bu do‘konga ulangan hamma Telegram akkauntlar uziladi. Qayta kirish uchun kod kerak bo‘ladi."
          confirmLabel="Uzish"
          busy={busy === 'unbind'}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            const result = await run('unbind', 'shops.unbind', { shopId: shop.id, all: true })
            setConfirm(null)
            if (result) onToast(`${Number(result.removed) || 0} ta akkaunt uzildi`)
          }}
        />
      )}
      {confirm === 'block' && (
        <ConfirmDialog
          title={shop.active ? 'Do‘konni bloklash' : 'Blokdan chiqarish'}
          message={shop.active
            ? 'Do‘konchilar ilovaga kira olmaydi va buyurtma bera olmaydi. Ulangan akkauntlar saqlanadi.'
            : 'Do‘kon yana buyurtma bera oladi.'}
          confirmLabel={shop.active ? 'Bloklash' : 'Chiqarish'}
          busy={busy === 'block'}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            await run('block', 'shops.active', { shopId: shop.id, active: !shop.active })
            setConfirm(null)
          }}
        />
      )}
      {confirm === 'delete' && (
        <ConfirmDialog
          title="Do‘konni o‘chirish"
          message="Do‘kon, uning kodi va ulanishlari o‘chadi. Buyurtmalar tarixi saqlanadi."
          confirmLabel="O‘chirish"
          busy={busy === 'delete'}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            const result = await run('delete', 'shops.delete', { shopId: shop.id })
            setConfirm(null)
            if (result) onClose()
          }}
        />
      )}
    </Modal>
  )
}

/** Qo'lda qo'shish yoki tahrirlash. Linko do'konida faqat qo'shimcha raqamlar va izoh. */
function ShopForm({
  shop, run, busy, onClose, onSaved,
}: {
  shop?: ShopRow
  run: Run
  busy: boolean
  onClose: () => void
  onSaved: (id: string) => void
}) {
  const manual = !shop || shop.source === 'manual'
  const [name, setName] = useState(shop?.name ?? '')
  const [address, setAddress] = useState(shop?.address ?? '')
  const [agentName, setAgentName] = useState(shop?.agentName ?? '')
  const [phones, setPhones] = useState((shop?.extraPhones ?? []).map(prettyPhone).join('\n'))
  const [note, setNote] = useState(shop?.note ?? '')
  const [deliveryDays, setDeliveryDays] = useState<number[]>(shop?.deliveryDays ?? [])

  const save = async () => {
    const result = await run('save', 'shops.save', {
      id: shop?.id,
      name,
      address,
      agentName,
      extraPhones: phones.split(/[\n,;]+/).map((p) => p.trim()).filter(Boolean),
      note,
      deliveryDays,
    })
    if (result) onSaved(String(result.id || shop?.id || ''))
  }

  return (
    <Modal
      title={shop ? 'Do‘konni tahrirlash' : 'Yangi do‘kon'}
      onClose={onClose}
      footer={
        <>
          <button className="adm-btn adm-btn--ghost flex-1" onClick={onClose} disabled={busy}>Bekor qilish</button>
          <button className="adm-btn adm-btn--primary flex-1" onClick={save} disabled={busy}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : null} Saqlash
          </button>
        </>
      }
    >
      {manual ? (
        <>
          <label className="adm-label" htmlFor="shop-name">Do‘kon nomi</label>
          <input id="shop-name" className="adm-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="«Baraka» do‘koni" />
          <label className="adm-label mt-3" htmlFor="shop-address">Manzil</label>
          <input id="shop-address" className="adm-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Tuman, ko‘cha, mo‘ljal" />
          <label className="adm-label mt-3" htmlFor="shop-agent">Agent</label>
          <input id="shop-agent" className="adm-input" value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="Agent ismi" />
        </>
      ) : (
        <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
          Nomi, manzili va agenti Linko’dan keladi — u yerda o‘zgartiring. Bu yerda faqat qo‘shimcha raqamlar va izoh.
        </p>
      )}
      <label className="adm-label mt-3" htmlFor="shop-phones">{manual ? 'Telefon raqamlari' : 'Qo‘shimcha telefon raqamlari'} (har qatorda bittadan)</label>
      <textarea id="shop-phones" className="adm-input min-h-[84px]" value={phones} onChange={(e) => setPhones(e.target.value)} placeholder="+998 90 123 45 67" />
      <p className="mt-1 text-xs" style={{ color: 'var(--faint)' }}>Do‘konchi shu raqamlardan biri va kod bilan kiradi.</p>
      <p className="adm-label mt-3">Yetkazish kunlari (agent marshruti) — tanlanmasa umumiy sozlama</p>
      <WeekdayPicker value={deliveryDays} onChange={setDeliveryDays} />
      <label className="adm-label mt-3" htmlFor="shop-note">Izoh (faqat adminlarga)</label>
      <input id="shop-note" className="adm-input" value={note} onChange={(e) => setNote(e.target.value)} />
    </Modal>
  )
}

/** Agent do'konga olib boradigan kod kartalari — A4 da 6 tadan, qirqish chiziqlari bilan. */
function ShopCodeCards({ shops, codes }: { shops: ShopRow[]; codes: Map<string, string> }) {
  return (
    <div className="shop-cards">
      {shops.map((shop) => (
        <article key={shop.id} className="shop-card">
          <header>
            <b>{BRAND.name}</b>
            <span>{BRAND.tagline}</span>
          </header>
          <h3>{shop.name}</h3>
          <p className="shop-card__addr">{shop.address}</p>
          <p className="shop-card__label">Kirish kodi / Код входа</p>
          <p className="shop-card__code">{codes.get(shop.id)}</p>
          <ol>
            <li>Telegram’da <b>@{BRAND.botUsername}</b> ni oching</li>
            <li>«Katalogni ochish» tugmasini bosing</li>
            <li>Do‘kon telefoni: <b>{allPhones(shop).map(prettyPhone)[0] || '—'}</b> va shu kodni kiriting</li>
          </ol>
          {shop.agentName && <footer>Agent: {shop.agentName}</footer>}
        </article>
      ))}
    </div>
  )
}
