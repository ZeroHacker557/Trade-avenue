import { useMemo, useState } from 'react'
import {
  Check, CheckCircle2, Link2, Link2Off, Loader2, PlugZap, Plus, RefreshCw, Search, Send, Star,
  TriangleAlert,
} from 'lucide-react'
import { apiPost } from '../lib/api'
import { useCategories, useLinkoProducts, useProducts, useSettings, type LinkoRow } from '../lib/live'
import { useToast } from '../components/Toast'
import { bestMatches, SUGGEST_AT, similarity } from '../lib/match'
import { Modal } from '../components/Modal'
import { formatPrice } from '../../data'

/**
 * Linko (SFA) integratsiyasi.
 *
 * Oqim bir tomonlama: Linko → MUSA. Linko katalogining nusxasi shu
 * yerda ko'rinadi, admin esa kerakli pozitsiyani do'kondagi mahsulotga
 * bog'laydi. Narx va qoldiq faqat BOG'LANGANLARIGA tushadi — Linko'dagi
 * hamma pozitsiya do'konga chiqib ketmasligi uchun.
 */

type Status = {
  connected: boolean
  hasToken: boolean
  reason?: string
  products?: number
  priceLists?: { id: number; name: string }[]
  stocks?: { id: number; name: string }[]
  users?: { id: number; name: string; job: string }[]
  mirror?: { total: number; linked: number }
}

type Filter = 'all' | 'linked' | 'free'

export function LinkoPage() {
  const settings = useSettings().linko
  const { rows, loading } = useLinkoProducts()
  const { products } = useProducts()
  const { categories } = useCategories()
  const { show, node: toast } = useToast()

  const [busy, setBusy] = useState('')
  const [status, setStatus] = useState<Status | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [linking, setLinking] = useState<LinkoRow | null>(null)

  const productName = useMemo(() => {
    const map = new Map<string, string>()
    for (const product of products) map.set(product.docId, String(product.name || ''))
    return map
  }, [products])

  /*
   * Nomi bo'yicha taklif. Ikki tizimda nomlar boshqacha yozilgan
   * («Musa Chuchvara 500gr» ⇄ «Musa Muzlatilgan Chuchvara Pelmeni 500 gr»),
   * shuning uchun aynan mos kelishini kutib bo'lmaydi. Taklif AVTOMATIK
   * bog'lanmaydi — admin bir bosish bilan tasdiqlaydi.
   */
  const suggestions = useMemo(() => {
    const list = products.map((p) => ({ id: p.docId, name: String(p.name || '') }))
    const map = new Map<number, { id: string; name: string; score: number }>()
    for (const row of rows) {
      if (row.productIds.length) continue
      const [best] = bestMatches(row.name, list, 1)
      if (best && best.score >= SUGGEST_AT) {
        map.set(row.linkoId, { ...best.item, score: best.score })
      }
    }
    return map
  }, [rows, products])

  /** Mahsulotga nechta Linko pozitsiyasi bog'langan (ta'mlar, o'lchamlar). */
  const linkedCount = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of rows) {
      for (const id of row.productIds) map.set(id, (map.get(id) ?? 0) + 1)
    }
    return map
  }, [rows])

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (filter === 'linked' && !row.productIds.length) return false
      if (filter === 'free' && row.productIds.length) return false
      if (!needle) return true
      return (
        row.name.toLowerCase().includes(needle) ||
        (row.code || '').toLowerCase().includes(needle) ||
        String(row.linkoId).includes(needle)
      )
    })
  }, [rows, search, filter])

  const linked = rows.filter((row) => row.productIds.length).length

  const run = async (key: string, body: Record<string, unknown>, done: (result: never) => string) => {
    setBusy(key)
    try {
      const result = await apiPost<never>('action', body)
      show(done(result))
      return result
    } catch (error) {
      show(error instanceof Error ? error.message : 'Bajarilmadi', 'error')
      return null
    } finally {
      setBusy('')
    }
  }

  const check = async () => {
    setBusy('check')
    try {
      const result = await apiPost<Status>('action', { action: 'linko.status' })
      setStatus(result)
      show(result.connected ? `Ulandi — Linko'da ${result.products} ta mahsulot` : 'Ulanmadi', result.connected ? 'ok' : 'error')
    } catch (error) {
      setStatus(null)
      show(error instanceof Error ? error.message : 'Ulanib bo‘lmadi', 'error')
    } finally {
      setBusy('')
    }
  }

  const saveSettings = (values: { baseUrl: string; priceListId: number; stockIds: number[] }) =>
    run('settings', { action: 'linko.settings', ...values }, () => 'Ulanish sozlamasi saqlandi')

  const pull = (full: boolean) =>
    run('pull', { action: 'linko.pull', full }, (result: never) =>
      String((result as { report?: string }).report || 'Sinxronlandi'),
    )

  const autoLink = () =>
    run('auto', { action: 'linko.autoLink' }, (result: never) =>
      `${(result as { linked?: number }).linked ?? 0} ta pozitsiya nomi bo‘yicha bog‘landi`,
    )

  const unlink = (row: LinkoRow) =>
    run(`unlink:${row.linkoId}`, { action: 'linko.link', linkoId: row.linkoId, unlink: true },
      () => 'Bog‘lanish uzildi')

  const makePrimary = (row: LinkoRow) =>
    run(`primary:${row.linkoId}`, {
      action: 'linko.link',
      linkoId: row.linkoId,
      makePrimary: true,
    }, () => 'Narx endi shu pozitsiyadan olinadi')

  const accept = (row: LinkoRow, productId: string) =>
    run(`link:${row.linkoId}`, { action: 'linko.link', linkoId: row.linkoId, productId },
      () => 'Bog‘landi')

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
        {/* ── Ulanish ──
            `key` — jonli sozlama kelganda forma qaytadan o‘rnatilsin uchun.
            Aks holda maydonlar birinchi renderdagi bo‘sh qiymat bilan qolib,
            «Saqlash» bosilganda saqlangan narxlar ro‘yxatini o‘chirib yuborardi
            (SettingsPage.tsx dagi bilan bir xil usul). */}
        <ConnectionCard
          key={`linko:${settings.baseUrl}|${settings.priceListId}|${settings.stockIds.join(",")}`}
          settings={settings}
          status={status}
          busy={busy}
          onCheck={check}
          onSave={saveSettings}
        />

        {/* ── Sinxronlash ── */}
        <section className="adm-card p-4 sm:p-5">
          <div className="flex items-center gap-2.5">
            <span
              className="grid size-9 shrink-0 place-items-center rounded-xl"
              style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}
            >
              <RefreshCw size={18} />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-extrabold">Sinxronlash</h2>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                Narx va qoldiq faqat bog‘langan mahsulotlarga tushadi
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Stat label="Linko nusxasi" value={rows.length} />
            <Stat label="Bog‘langan" value={linked} />
            <Stat label="Taklif bor" value={suggestions.size} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button className="adm-btn adm-btn--primary" onClick={() => pull(false)} disabled={busy === 'pull'}>
              {busy === 'pull' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Sinxronlash
            </button>
            <button className="adm-btn adm-btn--ghost" onClick={() => pull(true)} disabled={busy === 'pull'}>
              To‘liq qayta o‘qish
            </button>
            <button className="adm-btn adm-btn--ghost" onClick={autoLink} disabled={busy === 'auto'}>
              {busy === 'auto' ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />}
              Nomi bo‘yicha bog‘lash
            </button>
          </div>

          {settings.lastSyncAt && (
            <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
              Oxirgi sinxron: {new Date(settings.lastSyncAt).toLocaleString('uz-UZ')}
              {settings.lastReport ? ` — ${settings.lastReport}` : ''}
            </p>
          )}
        </section>
      </div>

      {/* ── Buyurtmalarni yuborish ── */}
      <OrdersCard
        key={`orders:${settings.sendOrders}|${settings.agentId}|${settings.deliveryManId}|${settings.orderStockId}|${settings.marketTypeId ?? 0}`}
        settings={settings}
        status={status}
        busy={busy}
        onSave={(values) =>
          run('orders', { action: 'linko.settings', ...values }, () => 'Saqlandi')
        }
        onPush={() =>
          run('push', { action: 'linko.pushOrders', days: 7 }, (result: never) => {
            const r = result as { sent?: number; failed?: number; skipped?: number }
            return `${r.sent ?? 0} ta yuborildi, ${r.failed ?? 0} ta xato, ${r.skipped ?? 0} ta o‘zgarmagan`
          })
        }
      />

      {/* ── Linko katalogi ── */}
      <section className="adm-card mt-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--faint)' }} />
            <input
              className="adm-input pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nomi, kodi yoki Linko ID si"
            />
          </div>
          <div className="flex gap-1.5">
            {([['all', 'Hammasi'], ['free', 'Bog‘lanmagan'], ['linked', 'Bog‘langan']] as const).map(
              ([key, label]) => (
                <button
                  key={key}
                  className={'adm-chip ' + (filter === key ? 'active' : '')}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ),
            )}
          </div>
        </div>

        {loading ? (
          <p className="mt-4 text-sm" style={{ color: 'var(--muted)' }}>Yuklanmoqda…</p>
        ) : shown.length === 0 ? (
          <p className="mt-4 text-sm" style={{ color: 'var(--muted)' }}>
            {rows.length === 0
              ? 'Hali sinxronlanmagan — yuqoridagi «Sinxronlash» tugmasini bosing.'
              : 'Bu shartga mos pozitsiya yo‘q.'}
          </p>
        ) : (
          <div className="mt-3 grid gap-2">
            {shown.slice(0, 200).map((row) => (
              <div
                key={row.linkoId}
                className="flex flex-wrap items-center gap-3 rounded-xl border p-3"
                style={{ borderColor: 'var(--line)' }}
              >
                <div className="min-w-[180px] flex-1">
                  <p className="truncate text-sm font-extrabold">{row.name || `#${row.linkoId}`}</p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    ID {row.linkoId}
                    {row.code ? ` · ${row.code}` : ''}
                    {row.typeName ? ` · ${row.typeName}` : ''}
                  </p>
                </div>

                <div className="text-right text-xs">
                  <p className="font-bold" style={{ color: 'var(--ink)' }}>
                    {row.price > 0 ? formatPrice(row.price) : '— narx yo‘q'}
                  </p>
                  <p style={{ color: row.stock > 0 ? 'var(--muted)' : 'var(--danger)' }}>
                    Qoldiq: {row.stock}
                  </p>
                </div>

                {row.productIds.length ? (
                  <div className="flex items-center gap-2">
                    {/* Bog'langan mahsulotlar — bosilsa ro'yxatni tahrirlash oynasi */}
                    <button
                      className="max-w-[220px] truncate rounded-lg px-2 py-1 text-left text-xs font-semibold"
                      style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}
                      onClick={() => setLinking(row)}
                      title="Bog‘langan mahsulotlarni o‘zgartirish"
                    >
                      {productName.get(row.productIds[0]) || 'Bog‘langan'}
                      {row.productIds.length > 1 && ` +${row.productIds.length - 1}`}
                    </button>
                    {/* Bir mahsulotga bir nechta pozitsiya bog'langanda narx
                        qaysi biridan olinishini admin belgilaydi */}
                    {row.productIds.some((id) => (linkedCount.get(id) ?? 0) > 1) && (
                      <button
                        className="adm-icon-btn"
                        onClick={() => !row.primary && makePrimary(row)}
                        disabled={busy === `primary:${row.linkoId}`}
                        title={row.primary
                          ? 'Narx shu pozitsiyadan olinadi'
                          : 'Narxni shu pozitsiyadan olish'}
                        style={row.primary ? { color: 'var(--brand)' } : undefined}
                      >
                        <Star size={15} fill={row.primary ? 'currentColor' : 'none'} />
                      </button>
                    )}
                    <button
                      className="adm-icon-btn"
                      onClick={() => unlink(row)}
                      disabled={busy === `unlink:${row.linkoId}`}
                      aria-label="Bog‘lanishni uzish"
                    >
                      <Link2Off size={15} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {suggestions.get(row.linkoId) && (
                      <button
                        className="adm-btn adm-btn--ghost"
                        onClick={() => accept(row, suggestions.get(row.linkoId)!.id)}
                        disabled={busy === `link:${row.linkoId}`}
                        title={`O‘xshashlik: ${Math.round(suggestions.get(row.linkoId)!.score * 100)}%`}
                      >
                        <Check size={15} />
                        <span className="max-w-[160px] truncate">
                          {suggestions.get(row.linkoId)!.name}
                        </span>
                      </button>
                    )}
                    <button className="adm-btn adm-btn--ghost" onClick={() => setLinking(row)}>
                      <Link2 size={15} /> Bog‘lash
                    </button>
                  </div>
                )}
              </div>
            ))}
            {shown.length > 200 && (
              <p className="text-xs" style={{ color: 'var(--faint)' }}>
                Yana {shown.length - 200} ta — qidiruv bilan toraytiring.
              </p>
            )}
          </div>
        )}
      </section>

      {linking && (
        <LinkModal
          row={linking}
          products={products.map((p) => ({ id: p.docId, name: String(p.name || '') }))}
          linkedCount={linkedCount}
          categories={categories.map((c) => String(c.name || ''))}
          onClose={() => setLinking(null)}
          onDone={(message) => {
            setLinking(null)
            show(message)
          }}
          onError={(message) => show(message, 'error')}
        />
      )}

      {toast}
    </>
  )
}


/**
 * Ulanish sozlamasi.
 *
 * Alohida komponent, chunki forma qiymatlari jonli sozlama kelganda
 * yangilanishi kerak. Ota komponent unga `key` beradi va qiymat
 * o'zgarganda karta qaytadan o'rnatiladi — bu loyihadagi odatiy usul
 * (SettingsPage.tsx). Ilgari maydonlar birinchi renderdagi bo'sh qiymat
 * bilan qolib ketib, «Saqlash» saqlangan narxlar ro'yxatini nolga
 * tushirib yuborardi.
 */
function ConnectionCard({
  settings, status, busy, onCheck, onSave,
}: {
  settings: { baseUrl: string; priceListId: number; stockIds: number[] }
  status: Status | null
  busy: string
  onCheck: () => void
  onSave: (values: { baseUrl: string; priceListId: number; stockIds: number[] }) => void
}) {
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl)
  const [priceListId, setPriceListId] = useState(String(settings.priceListId || ''))
  const [stockIds, setStockIds] = useState<number[]>(settings.stockIds || [])

  return (
        <section className="adm-card p-4 sm:p-5">
          <div className="flex items-center gap-2.5">
            <span
              className="grid size-9 shrink-0 place-items-center rounded-xl"
              style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}
            >
              <PlugZap size={18} />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-extrabold">Linko ulanishi</h2>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                Katalog, narx va qoldiq shu yerdan tortiladi
              </p>
            </div>
          </div>

          <label className="adm-label mt-4">Server manzili</label>
          <input
            className="adm-input"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://sfademo.linko.uz"
          />
          <p className="mt-1.5 text-xs" style={{ color: 'var(--faint)' }}>
            Token serverda <code>LINKO_TOKEN</code> muhit o‘zgaruvchisida saqlanadi — bu yerda emas.
          </p>

          <label className="adm-label mt-3">Narxlar ro‘yxati</label>
          <select
            className="adm-input"
            value={priceListId}
            onChange={(e) => setPriceListId(e.target.value)}
          >
            <option value="">— tanlanmagan —</option>
            {(status?.priceLists ?? (settings.priceListId
              ? [{ id: settings.priceListId, name: `#${settings.priceListId}` }]
              : [])).map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
          {!status?.priceLists && (
            <p className="mt-1.5 text-xs" style={{ color: 'var(--faint)' }}>
              Ro‘yxatni ko‘rish uchun «Ulanishni tekshirish» tugmasini bosing.
            </p>
          )}
          {/* Tanlanmagan holatda saqlash narxni butunlay o'chirib qo'yadi */}
          {!priceListId && (
            <p className="mt-1.5 flex items-start gap-1.5 text-xs" style={{ color: 'var(--danger)' }}>
              <TriangleAlert size={13} className="mt-0.5 shrink-0" />
              Tanlanmasa narx sinxronlanmaydi — mahsulotlarda eski narx qolib ketadi.
            </p>
          )}

          {status?.stocks?.length ? (
            <>
              <p className="adm-label mt-3">Qaysi skladlar qoldig‘i hisoblansin</p>
              <div className="flex flex-wrap gap-1.5">
                {status.stocks.map((stock) => {
                  const active = stockIds.includes(stock.id)
                  return (
                    <button
                      key={stock.id}
                      className={'adm-chip ' + (active ? 'active' : '')}
                      onClick={() =>
                        setStockIds(active
                          ? stockIds.filter((id) => id !== stock.id)
                          : [...stockIds, stock.id])
                      }
                    >
                      {stock.name}
                    </button>
                  )
                })}
              </div>
              <p className="mt-1.5 text-xs" style={{ color: 'var(--faint)' }}>
                Hech biri tanlanmasa — hamma sklad qoldig‘i qo‘shiladi.
              </p>
            </>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button className="adm-btn adm-btn--ghost" onClick={onCheck} disabled={busy === 'check'}>
              {busy === 'check' ? <Loader2 size={16} className="animate-spin" /> : <PlugZap size={16} />}
              Ulanishni tekshirish
            </button>
            <button className="adm-btn adm-btn--primary" onClick={() => onSave({ baseUrl: baseUrl.trim(), priceListId: Number(priceListId) || 0, stockIds })} disabled={busy === 'settings' || !baseUrl.trim()}>
              {busy === 'settings' ? <Loader2 size={16} className="animate-spin" /> : null}
              Saqlash
            </button>
          </div>

          {status && !status.connected && (
            <p
              className="mt-3 flex items-start gap-2 rounded-xl p-3 text-xs"
              style={{ background: 'var(--danger-soft, var(--surface-2))', color: 'var(--danger)' }}
            >
              <TriangleAlert size={15} className="mt-0.5 shrink-0" />
              {status.reason === 'token'
                ? 'LINKO_TOKEN sozlanmagan — uni Vercel muhit o‘zgaruvchilariga qo‘shing.'
                : 'Server manzili kiritilmagan.'}
            </p>
          )}
          {status?.connected && (
            <p
              className="mt-3 flex items-center gap-2 rounded-xl p-3 text-xs"
              style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}
            >
              <CheckCircle2 size={15} />
              Linko‘da {status.products} ta mahsulot bor.
            </p>
          )}
        </section>
  )
}


type OrderValues = {
  sendOrders: boolean
  agentId: number
  deliveryManId: number
  orderStockId: number
  marketTypeId: number
}

/**
 * Buyurtmalarni Linko'ga yuborish.
 *
 * Buyurtma agent nomidan, tanlangan sklad hisobidan yoziladi —
 * yetkazuvchi ixtiyoriy (bo'lmasa Linko'da agentga tushadi).
 *
 * Hammasi avtomatik: buyurtma yaratilganda va har holat o'zgarishida
 * darhol ketadi; har 10 daqiqada esa tushmay qolganlari qayta
 * yuboriladi (api/linko-cron.ts). Oxirgi natija shu yerda ko'rinadi.
 */
function OrdersCard({
  settings, status, busy, onSave, onPush,
}: {
  settings: {
    sendOrders: boolean
    agentId: number
    deliveryManId: number
    orderStockId: number
    marketTypeId?: number
    stockIds: number[]
    lastOrderPush?: { at: string; sent: number; failed: number; skipped: number; checked: number; errors?: string[] } | null
  }
  status: Status | null
  busy: string
  onSave: (values: OrderValues) => void
  onPush: () => void
}) {
  const [sendOrders, setSendOrders] = useState(settings.sendOrders)
  const [agentId, setAgentId] = useState(String(settings.agentId || ''))
  const [orderStockId, setOrderStockId] = useState(
    String(settings.orderStockId || settings.stockIds[0] || ''),
  )
  const [marketTypeId, setMarketTypeId] = useState(String(settings.marketTypeId || ''))

  const users = status?.users ?? []
  // Linko'da lavozimlar ruscha nomlanadi
  const agents = users.filter((u) => !/достав|курьер/i.test(u.job))
  const ready = Boolean(agentId && orderStockId)
  const auto = settings.lastOrderPush

  return (
    <section className="adm-card mt-4 p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-xl"
          style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}
        >
          <Send size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-extrabold">Buyurtmalarni Linko‘ga yuborish</h2>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Mijoz «market», buyurtma esa «order» bo‘lib tushadi
          </p>
        </div>
      </div>

      {!users.length && (
        <p className="mt-3 text-xs" style={{ color: 'var(--faint)' }}>
          Agentlar ro‘yxati uchun yuqorida «Ulanishni tekshirish» tugmasini bosing.
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="adm-label">Agent nomidan</label>
          <select className="adm-input" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            <option value="">— tanlanmagan —</option>
            {agents.map((u) => (
              <option key={u.id} value={u.id}>{u.name}{u.job ? ` · ${u.job}` : ''}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="adm-label">Qaysi sklad hisobidan</label>
          <select
            className="adm-input"
            value={orderStockId}
            onChange={(e) => setOrderStockId(e.target.value)}
          >
            <option value="">— tanlanmagan —</option>
            {(status?.stocks ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="adm-label">Mijoz turi (Linko ID)</label>
          <input
            className="adm-input"
            inputMode="numeric"
            value={marketTypeId}
            onChange={(e) => setMarketTypeId(e.target.value.replace(/\D/g, ''))}
            placeholder="Masalan: Telegram bot B2C turining raqami"
          />
          <p className="mt-1 text-xs" style={{ color: 'var(--faint)' }}>
            Botdan kelgan mijoz Linko’da shu turda yoziladi. Bo‘sh — Linko o‘zi «Розничный» qo‘yadi.
          </p>
        </div>
      </div>

      <label className="mt-4 flex items-center gap-2.5 text-sm font-semibold">
        <input
          type="checkbox"
          checked={sendOrders}
          disabled={!ready}
          onChange={(e) => setSendOrders(e.target.checked)}
        />
        Buyurtmalar Linko‘ga avtomatik yuborilsin
      </label>
      {!ready && (
        <p className="mt-1.5 text-xs" style={{ color: 'var(--faint)' }}>
          Avval agent va skladni tanlang.
        </p>
      )}

      {/* Avtomatik ishlash holati — qo'lda hech narsa bosish shart emas */}
      {settings.sendOrders && (
        <div className="adm-linko-auto mt-4">
          <p className="text-sm font-extrabold">Avtomatik ishlayapti</p>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
            Buyurtma berilganda va har holat o‘zgarishida darhol yuboriladi. Har 10 daqiqada tushmay
            qolgan yoki holati yangilanmaganlari o‘zi qayta yuboriladi, qoldiqlar esa Linko’dan yangilanadi.
          </p>
          {auto ? (
            <p className="mt-2 text-xs font-semibold" style={{ color: auto.failed ? 'var(--danger)' : 'var(--brand)' }}>
              Oxirgi tekshiruv: {new Date(auto.at).toLocaleString('uz-UZ')} —{' '}
              {auto.failed
                ? `${auto.failed} ta buyurtma yuborilmadi`
                : auto.sent
                  ? `${auto.sent} ta buyurtma yangilandi`
                  : 'hammasi Linko bilan bir xil'}
            </p>
          ) : (
            <p className="mt-2 text-xs" style={{ color: 'var(--faint)' }}>Birinchi avtomatik tekshiruv kutilmoqda…</p>
          )}
          {!!auto?.errors?.length && (
            <ul className="mt-1.5 text-xs" style={{ color: 'var(--danger)' }}>
              {auto.errors.map((e) => <li key={e}>• {e}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="adm-btn adm-btn--primary"
          onClick={() => onSave({
            sendOrders,
            agentId: Number(agentId) || 0,
            // Yetkazuvchi endi tanlanmaydi — buyurtma agentga tushadi
            deliveryManId: 0,
            orderStockId: Number(orderStockId) || 0,
            marketTypeId: Number(marketTypeId) || 0,
          })}
          disabled={busy === 'orders'}
        >
          {busy === 'orders' ? <Loader2 size={16} className="animate-spin" /> : null}
          Saqlash
        </button>
        <button className="adm-btn adm-btn--ghost" onClick={onPush} disabled={busy === 'push'}>
          {busy === 'push' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          Hozir tekshirish (7 kun)
        </button>
      </div>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl p-2.5" style={{ background: 'var(--surface-2)' }}>
      <p className="text-lg font-extrabold">{value}</p>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>{label}</p>
    </div>
  )
}

/**
 * Bog'lash oynasi: mavjud mahsulotga ulash YOKI Linko pozitsiyasidan
 * yangi mahsulot yaratish. Yangisida rasm bo'lmaydi — uni «Mahsulotlar»
 * bo'limidan qo'shish kerak, shuning uchun bu haqda ogohlantiramiz.
 */
function LinkModal({
  row, products, categories, linkedCount, onClose, onDone, onError,
}: {
  row: LinkoRow
  products: { id: string; name: string }[]
  categories: string[]
  /** Mahsulotga allaqachon nechta Linko pozitsiyasi bog'langan. */
  linkedCount: Map<string, number>
  onClose: () => void
  onDone: (message: string) => void
  onError: (message: string) => void
}) {
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  /*
   * Bir pozitsiya bir NECHTA mahsulotga bog'lanishi mumkin: Linko'da
   * umumiy «BAMBUK 90GR», do'konda esa har ta'm alohida mahsulot.
   * Shuning uchun tanlov ro'yxat bo'lib yig'iladi.
   */
  const [selected, setSelected] = useState<string[]>(row.productIds)
  const [category, setCategory] = useState(categories[0] ?? '')
  const [name, setName] = useState(row.name)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)

  /*
   * Qidiruv yozilmagan bo'lsa — eng o'xshash nomlar yuqorida turadi.
   * Ro'yxatda yuzlab mahsulot bor, kerakligini qo'lda izlash uzoq.
   */
  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (needle) {
      return products
        .filter((p) => p.name.toLowerCase().includes(needle))
        .slice(0, 50)
        .map((item) => ({ item, score: similarity(row.name, item.name) }))
    }
    return bestMatches(row.name, products, 50)
  }, [products, search, row.name])

  const submit = async () => {
    setBusy(true)
    try {
      await apiPost('action', mode === 'existing'
        ? { action: 'linko.link', linkoId: row.linkoId, productIds: selected }
        : { action: 'linko.link', linkoId: row.linkoId, category, name: name.trim() })
      onDone(mode === 'existing'
        ? `${selected.length} ta mahsulotga bog‘landi`
        : 'Yangi mahsulot yaratildi')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Bajarilmadi')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={row.name || `#${row.linkoId}`}
      onClose={onClose}
      footer={
        <>
          <button className="adm-btn adm-btn--ghost flex-1" onClick={onClose} disabled={busy}>
            Bekor qilish
          </button>
          <button
            className="adm-btn adm-btn--primary flex-1"
            onClick={submit}
            disabled={busy || (mode === 'existing' ? !selected.length : !category || !name.trim())}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : null}
            {mode === 'existing'
              ? `Bog‘lash${selected.length > 1 ? ` (${selected.length} ta)` : ''}`
              : 'Yaratish'}
          </button>
        </>
      }
    >
      <div className="flex gap-1.5">
        <button
          className={'adm-chip ' + (mode === 'existing' ? 'active' : '')}
          onClick={() => setMode('existing')}
        >
          <Link2 size={13} /> Mavjud mahsulotga
        </button>
        <button
          className={'adm-chip ' + (mode === 'new' ? 'active' : '')}
          onClick={() => setMode('new')}
        >
          <Plus size={13} /> Yangi mahsulot
        </button>
      </div>

      <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
        Linko narxi: <b>{row.price > 0 ? formatPrice(row.price) : 'yo‘q'}</b> · qoldiq: <b>{row.stock}</b>
      </p>
      <p className="mt-1 text-xs" style={{ color: 'var(--faint)' }}>
        Bir nechtasini belgilash mumkin: Linko‘dagi bitta pozitsiya do‘konda
        bir necha ta’m bo‘lib turgan bo‘lsa, hammasiga shu narx va qoldiq
        tushadi. Teskarisi ham ishlaydi — bir mahsulotga bir nechta pozitsiya
        bog‘lansa qoldiq qo‘shiladi.
      </p>

      {mode === 'existing' ? (
        <>
          <label className="adm-label mt-3">Do‘kondagi mahsulot</label>
          <input
            className="adm-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nomi bo‘yicha qidiring"
          />
          <div className="mt-2 max-h-56 overflow-auto rounded-xl border" style={{ borderColor: 'var(--line)' }}>
            {matches.map(({ item: product, score }) => {
              const on = selected.includes(product.id)
              return (
              <button
                key={product.id}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                style={{
                  background: on ? 'var(--brand-soft)' : 'transparent',
                  color: on ? 'var(--brand)' : 'var(--ink)',
                }}
                onClick={() => setSelected(on
                  ? selected.filter((id) => id !== product.id)
                  : [...selected, product.id])}
              >
                <span
                  className="grid size-4 shrink-0 place-items-center rounded border"
                  style={{
                    borderColor: on ? 'var(--brand)' : 'var(--line)',
                    background: on ? 'var(--brand)' : 'transparent',
                    color: 'var(--surface)',
                  }}
                >
                  {on && <Check size={11} strokeWidth={3} />}
                </span>
                <span className="flex-1 truncate">{product.name}</span>
                {(linkedCount.get(product.id) ?? 0) > 0 && (
                  <span className="shrink-0 text-[11px]" style={{ color: 'var(--faint)' }}>
                    {linkedCount.get(product.id)} ta bog‘langan
                  </span>
                )}
                {score >= SUGGEST_AT && (
                  <span
                    className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold"
                    style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}
                  >
                    {Math.round(score * 100)}%
                  </span>
                )}
              </button>
              )
            })}
            {matches.length === 0 && (
              <p className="px-3 py-2 text-xs" style={{ color: 'var(--faint)' }}>Topilmadi</p>
            )}
          </div>
        </>
      ) : (
        <>
          <label className="adm-label mt-3">Nomi</label>
          <input className="adm-input" value={name} onChange={(e) => setName(e.target.value)} />

          <label className="adm-label mt-3">Kategoriya</label>
          <select className="adm-input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>

          <p className="mt-2 text-xs" style={{ color: 'var(--faint)' }}>
            Rasm va tavsif Linko‘da yo‘q — ularni «Mahsulotlar» bo‘limidan qo‘shasiz.
          </p>
        </>
      )}
    </Modal>
  )
}
