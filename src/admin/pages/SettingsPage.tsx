import { Building2, CreditCard, Headphones, Loader2, PlugZap, Send, Smartphone, Truck, Users2, Webhook } from 'lucide-react'
import { PAY_PROVIDERS } from '../../utils/payment'
import { useState } from 'react'
import { apiPost } from '../lib/api'
import { useSettings, type CompanySettings } from '../lib/live'
import type { ContactInfo } from '../../config/contact'
import { useToast } from '../components/Toast'
import { FreeDeliveryBar } from '../../components/cart/FreeDeliveryBar'
import { formatPrice } from '../../data'

export function SettingsPage() {
  const settings = useSettings()
  const { show, node: toast } = useToast()
  const [busy, setBusy] = useState('')

  const save = async (section: string, payload: Record<string, unknown>) => {
    setBusy(section)
    try {
      await apiPost('action', { action: 'settings.save', section, ...payload })
      show('Saqlandi')
    } catch (error) {
      show(error instanceof Error ? error.message : 'Saqlanmadi', 'error')
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-2">
        {/*
          `key` — jonli qiymat kelganda forma qaytadan o'rnatilsin uchun.
          Props'ni useEffect bilan state'ga ko'chirish o'rniga shu usul:
          ortiqcha render bo'lmaydi va React uchun ham to'g'ri yo'l.
          Yozayotganda kalit o'zgarmaydi — settings faqat Firestore
          yangilanganda almashadi.
        */}
        <TransferCard
          key={`transfer:${settings.payment.cardNumber}|${settings.payment.cardOwner}|${settings.payment.transfer}`}
          settings={settings.payment}
          busy={busy === 'payment'}
          onSave={save}
        />
        <OnlinePaymentCard
          key={`online:${settings.payment.online}|${settings.payment.onlineTestOnly}|${(settings.payment.onlineProviders || []).join(',')}`}
          settings={settings.payment}
          busy={busy === 'online'}
          onSave={save}
          onError={(m) => show(m, 'error')}
          onOk={(m) => show(m)}
        />
        <DeliveryCard
          key={`del:${settings.delivery.fee}|${settings.delivery.freeFrom}|${settings.delivery.minOrder}`}
          settings={settings.delivery}
          busy={busy === 'delivery'}
          onSave={save}
        />
        <CourierCard
          key={`cour:${settings.courier.channel}|${settings.courier.groupChatId}|${settings.courier.notifyAdmins}`}
          settings={settings.courier}
          busy={busy === 'courier'}
          onSave={save}
          onError={(m) => show(m, 'error')}
          onOk={(m) => show(m)}
        />
        <ContactCard
          key={`ct:${Object.values(settings.contact).join('|')}`}
          settings={settings.contact}
          busy={busy === 'contact'}
          onSave={save}
        />
        <CompanyCard
          key={`co:${Object.values(settings.company).join('|')}`}
          settings={settings.company}
          busy={busy === 'company'}
          onSave={save}
        />
      </div>
      {toast}
    </>
  )
}

type SaveFn = (section: string, payload: Record<string, unknown>) => void

function Section({
  title, icon: Icon, hint, children,
}: {
  title: string
  icon: typeof CreditCard
  hint: string
  children: React.ReactNode
}) {
  return (
    <section className="adm-card p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-xl"
          style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}
        >
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-extrabold">{title}</h2>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            {hint}
          </p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

/**
 * Karta orqali to'lov (o'tkazma): mijoz shu kartaga pul o'tkazadi va
 * buyurtma berishda chek yuklaydi. Karta raqami va egasining ismi
 * buyurtma sahifasida va chek oynasida ko'rinadi.
 */
function TransferCard({
  settings, busy, onSave,
}: {
  settings: { cardNumber: string; cardOwner: string; transfer?: boolean }
  busy: boolean
  onSave: SaveFn
}) {
  const [number, setNumber] = useState(settings.cardNumber || '')
  const [owner, setOwner] = useState(settings.cardOwner || '')
  const [on, setOn] = useState(settings.transfer !== false)
  const digits = number.replace(/\D/g, '')
  const valid = digits.length === 16 && owner.trim().length > 0

  return (
    <Section
      title="Karta orqali to‘lov"
      icon={CreditCard}
      hint="Mijoz shu kartaga o‘tkazib, buyurtma berishda chek yuklaydi"
    >
      <label className="adm-ch-toggle">
        <span className="adm-ch-toggle__icon"><CreditCard size={18} /></span>
        <span className="min-w-0 flex-1">
          <b>{on ? 'Yoqilgan — mijozlarga «Karta» usuli ko‘rinadi' : 'O‘chirilgan — faqat naqd (va onlayn)'}</b>
          <span>O‘chirilsa karta ma’lumoti saqlanib qoladi, faqat mijozlarga ko‘rinmaydi</span>
        </span>
        <input type="checkbox" className="adm-ch-switch" checked={on} onChange={(e) => setOn(e.target.checked)} />
      </label>

      <label className="adm-label mt-3" htmlFor="tr-number">Karta raqami</label>
      <input
        id="tr-number"
        className="adm-input font-mono tracking-wider"
        inputMode="numeric"
        value={number}
        onChange={(e) => {
          const d = e.target.value.replace(/\D/g, '').slice(0, 16)
          setNumber(d.replace(/(\d{4})(?=\d)/g, '$1 '))
        }}
        placeholder="8600 0000 0000 0000"
      />
      {digits.length > 0 && digits.length !== 16 && (
        <p className="mt-1 text-xs font-bold" style={{ color: 'var(--danger)' }}>16 ta raqam bo‘lishi kerak ({digits.length}/16)</p>
      )}

      <label className="adm-label mt-3" htmlFor="tr-owner">Karta egasining ismi</label>
      <input
        id="tr-owner"
        className="adm-input"
        value={owner}
        maxLength={60}
        onChange={(e) => setOwner(e.target.value)}
        placeholder="ABDULLAYEV ALI"
      />

      {/* Mijoz buyurtma sahifasida aynan shuni ko'radi */}
      {digits.length === 16 && owner.trim() && (
        <div className="mt-3 rounded-xl p-3" style={{ background: 'var(--surface-2)' }}>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Mijoz ko‘radi:</p>
          <p className="mt-1 font-mono text-sm font-extrabold">{number}</p>
          <p className="text-xs font-bold" style={{ color: 'var(--muted)' }}>{owner.trim()}</p>
        </div>
      )}

      <button
        className="adm-btn adm-btn--primary mt-4 w-full"
        onClick={() => onSave('payment', { cardNumber: number, cardOwner: owner.trim(), transfer: on })}
        disabled={busy || !valid}
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : null} Saqlash
      </button>
    </Section>
  )
}

/**
 * Onlayn to'lov (WLCM: Click, Payme, Uzum, Paylov).
 * Kalitlar serverda (Vercel muhit o'zgaruvchilari) — bu yerda faqat
 * yoqish va mijozga ko'rinadigan usullar. «Tekshirish» kalitlar
 * ishlayotganini ko'rsatadi (kalitlarning o'zi ko'rinmaydi).
 */
function OnlinePaymentCard({
  settings, busy, onSave, onError, onOk,
}: {
  settings: { online?: boolean; onlineProviders?: string[]; onlineTestOnly?: boolean }
  busy: boolean
  onSave: SaveFn
  onError: (message: string) => void
  onOk: (message: string) => void
}) {
  const [online, setOnline] = useState(settings.online === true)
  // Yangi sozlashda sinov rejimi yoqilgan holda boshlanadi — xavfsizroq
  const [testOnly, setTestOnly] = useState(settings.onlineTestOnly ?? true)
  // Sandbox'da hozircha faqat Payme va Click faol
  const [providers, setProviders] = useState<string[]>(settings.onlineProviders?.length ? settings.onlineProviders : ['payme', 'click'])
  const [checking, setChecking] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [hooking, setHooking] = useState(false)

  /** Webhook manzilini WLCM'ga ro'yxatdan o'tkazish (sir — serverdagi WLCM_WEBHOOK_SECRET). */
  const connectWebhook = async () => {
    setHooking(true)
    try {
      const result = await apiPost<{ url: string; id: number | null }>('action', { action: 'payment.webhook' })
      setStatus(`Webhook ulandi: ${result.url}`)
      onOk('Webhook ulandi')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ulab bo‘lmadi'
      setStatus(message)
      onError(message)
    } finally {
      setHooking(false)
    }
  }

  const toggle = (id: string) =>
    setProviders((list) => (list.includes(id) ? list.filter((p) => p !== id) : [...list, id]))

  const check = async () => {
    setChecking(true)
    setStatus(null)
    try {
      const result = await apiPost<{
        ok: boolean
        configured: boolean
        sandbox?: boolean
        message?: string
        partner?: { id: number | null; name: string | null; active: boolean | null }
        activeProviders?: string[]
        webhookSecret?: boolean
      }>('action', { action: 'payment.check' })
      if (!result.configured) {
        setStatus(result.message || 'Kalitlar sozlanmagan')
        onError(result.message || 'Kalitlar sozlanmagan')
        return
      }
      const text = `${result.sandbox ? 'Sinov (sandbox)' : 'Ishchi'} · ${result.partner?.name || 'hamkor'} (#${result.partner?.id ?? '—'})` +
        (result.partner?.active === false ? ' — faol emas' : '') +
        ` · faol usullar: ${(result.activeProviders || []).join(', ') || '—'}` +
        (result.webhookSecret ? '' : ' · ⚠️ WLCM_WEBHOOK_SECRET yo‘q')
      setStatus(text)
      onOk('Ulanish ishlayapti')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tekshirib bo‘lmadi'
      setStatus(message)
      onError(message)
    } finally {
      setChecking(false)
    }
  }

  return (
    <Section
      title="Onlayn to‘lov"
      icon={Smartphone}
      hint="Click, Payme, Uzum — WLCM orqali. Yoqilsa mijoz buyurtmada «Onlayn» ni ko‘radi"
    >
      <label className="flex items-center justify-between gap-3 text-sm font-bold">
        <span>Mijozlarga ko‘rsatish</span>
        <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} className="size-5" />
      </label>
      <label className="mt-2 flex items-center justify-between gap-3 text-sm">
        <span>
          <b>Sinov rejimi</b>
          <span className="block text-xs" style={{ color: 'var(--muted)' }}>Faqat ega va adminlar ko‘radi — mijozlar sezmaydi</span>
        </span>
        <input type="checkbox" checked={testOnly} onChange={(e) => setTestOnly(e.target.checked)} className="size-5" />
      </label>

      <p className="adm-label mt-3">To‘lov usullari</p>
      <div className="flex flex-wrap gap-2">
        {PAY_PROVIDERS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={'adm-chip ' + (providers.includes(p.id) ? 'active' : '')}
            onClick={() => toggle(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {status && (
        <p className="mt-3 rounded-xl px-3 py-2 text-xs font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}>
          {status}
        </p>
      )}

      <button className="adm-btn adm-btn--ghost mt-4 w-full" onClick={connectWebhook} disabled={hooking}>
        {hooking ? <Loader2 size={16} className="animate-spin" /> : <Webhook size={16} />} Webhookni ulash
      </button>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button className="adm-btn adm-btn--ghost" onClick={check} disabled={checking}>
          {checking ? <Loader2 size={16} className="animate-spin" /> : <PlugZap size={16} />} Tekshirish
        </button>
        <button
          className="adm-btn adm-btn--primary"
          onClick={() => onSave('online', { online, onlineProviders: providers, onlineTestOnly: testOnly })}
          disabled={busy}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : null} Saqlash
        </button>
      </div>
    </Section>
  )
}

function DeliveryCard({
  settings, busy, onSave,
}: {
  settings: { fee: number; freeFrom: number; minOrder: number }
  busy: boolean
  onSave: SaveFn
}) {
  const [fee, setFee] = useState(String(settings.fee))
  const [freeFrom, setFreeFrom] = useState(String(settings.freeFrom))
  const [minOrder, setMinOrder] = useState(String(settings.minOrder ?? 0))


  return (
    <Section
      title="Yetkazib berish"
      icon={Truck}
      hint="Narx buyurtma rasmiylashtirishda hisoblanadi"
    >
      <label className="adm-label">Yetkazish narxi (so‘m)</label>
      <input
        className="adm-input"
        inputMode="numeric"
        value={fee}
        onChange={(e) => setFee(e.target.value.replace(/\D/g, ''))}
      />

      <label className="adm-label mt-3">Shu summadan bepul — 0 bo‘lsa bepul yetkazish yo‘q</label>
      <input
        className="adm-input"
        inputMode="numeric"
        value={freeFrom}
        onChange={(e) => setFreeFrom(e.target.value.replace(/\D/g, ''))}
      />

      {/* 0 — cheklov yo'q: buyurtma har qanday summada o'tadi */}
      <label className="adm-label mt-3">Minimal buyurtma summasi — 0 bo‘lsa cheklov yo‘q</label>
      <input
        className="adm-input"
        inputMode="numeric"
        value={minOrder}
        onChange={(e) => setMinOrder(e.target.value.replace(/\D/g, ''))}
      />

      {/* Mijoz savatda aynan shuni ko'radi — summani surib tekshirish mumkin */}
      <DeliveryPreview fee={Number(fee) || 0} freeFrom={Number(freeFrom) || 0} />

      <button
        className="adm-btn adm-btn--primary mt-4 w-full"
        onClick={() => onSave('delivery', {
          fee: Number(fee),
          freeFrom: Number(freeFrom),
          minOrder: Number(minOrder) || 0,
        })}
        disabled={busy}
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : null} Saqlash
      </button>
    </Section>
  )
}

const PREVIEW_TEXT = {
  remaining: ['Bepul yetkazishgacha yana', 'qoldi'] as [string, string],
  reached: 'Yetkazish bepul!',
  saved: (amount: string) => `${amount} tejaldi`,
  goal: (amount: string) => `${amount}dan bepul`,
  fee: (amount: string) => `Yetkazish: ${amount}`,
}

/**
 * Savatdagi «bepul yetkazishgacha» chizig'ining jonli namunasi.
 * Admin summani surib, mijoz qaysi summada nima ko'rishini tekshiradi.
 */
function DeliveryPreview({ fee, freeFrom }: { fee: number; freeFrom: number }) {
  const max = Math.max(freeFrom * 1.3, fee * 4, 100_000)
  const [cart, setCart] = useState(() => Math.round((freeFrom || 50_000) * 0.6))
  const subtotal = Math.min(cart, max)

  return (
    <div className="adm-preview">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
        Mijoz savatda shunday ko‘radi
      </p>
      {freeFrom <= 0 && fee <= 0 ? (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Yetkazish bepul — savatda chiziq ko‘rinmaydi.</p>
      ) : (
        <FreeDeliveryBar subtotal={subtotal} fee={fee} freeFrom={freeFrom} text={PREVIEW_TEXT} />
      )}
      {freeFrom > 0 && (
        <>
          <label className="mt-3 flex items-center justify-between text-xs" style={{ color: 'var(--muted)' }} htmlFor="delivery-preview">
            <span>Savat summasi (sinab ko‘rish)</span>
            <b style={{ color: 'var(--ink)' }}>{formatPrice(subtotal)}</b>
          </label>
          <input
            id="delivery-preview"
            type="range"
            min={0}
            max={max}
            step={1000}
            value={subtotal}
            onChange={(e) => setCart(Number(e.target.value))}
          />
          <p className="mt-1 text-xs" style={{ color: 'var(--faint)' }}>
            {formatPrice(freeFrom)} va undan yuqori buyurtmada yetkazish bepul, kamida esa {formatPrice(fee)} qo‘shiladi.
            Promokod chegirmasidan keyingi summa hisoblanadi.
          </p>
        </>
      )}
    </div>
  )
}

function CourierCard({
  settings, busy, onSave, onError, onOk,
}: {
  settings: {
    channel: 'couriers' | 'group'
    groupChatId: string | null
    notifyAdmins: boolean
  }
  busy: boolean
  onSave: SaveFn
  onError: (message: string) => void
  onOk: (message: string) => void
}) {
  const [channel, setChannel] = useState(settings.channel)
  const [groupChatId, setGroupChatId] = useState(settings.groupChatId || '')
  const [notifyAdmins, setNotifyAdmins] = useState(settings.notifyAdmins)
  const [testing, setTesting] = useState(false)

  const test = async () => {
    setTesting(true)
    try {
      await apiPost('action', { action: 'settings.testGroup', groupChatId })
      onOk('Sinov xabari yuborildi — guruhni tekshiring')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Yuborilmadi')
    } finally {
      setTesting(false)
    }
  }

  return (
    <Section
      title="Buyurtma xabarnomalari"
      icon={Users2}
      hint="Yangi buyurtma kimga va qachon tushadi"
    >
      <Toggle
        checked={notifyAdmins}
        onChange={setNotifyAdmins}
        label="Yangi buyurtma — adminlarga"
        hint="Buyurtma tushishi bilan admin va egaga xabar boradi (tasdiqlash uchun)"
      />

      <p className="adm-label mt-4">Tasdiqlangach — kuryerlarga</p>
      <p className="mb-2 text-xs" style={{ color: 'var(--muted)' }}>
        Kuryer buyurtmani mini app ichida oladi va yetkazadi. Bot har bir kuryerga
        shaxsan «Sizni #… buyurtma kutmoqda» deb yozadi, tagida ilovani ochadigan tugma bo‘ladi.
      </p>

      <div className="flex flex-col gap-2">
        {(
          [
            {
              key: 'couriers' as const,
              label: 'Faqat kuryerlarga shaxsiy xabar',
              hint: 'Biriktirilgan kuryerga, biriktirilmagan bo‘lsa — barcha faol kuryerlarga',
            },
            {
              key: 'group' as const,
              label: 'Shaxsiy xabar + guruhga nusxa',
              hint: 'Kuryerlarga shaxsan yoziladi, guruhga esa tugmasiz nusxa — kim olgani va yetkazgani ko‘rinib turadi',
            },
          ]
        ).map((item) => (
          <label
            key={item.key}
            className="flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition"
            style={{
              borderColor: channel === item.key ? 'var(--brand-line)' : 'var(--line)',
              background: channel === item.key ? 'var(--brand-soft)' : 'var(--surface)',
            }}
          >
            <input
              type="radio"
              className="mt-0.5 size-4"
              checked={channel === item.key}
              onChange={() => setChannel(item.key)}
            />
            <span className="min-w-0">
              <span className="block text-sm font-bold">{item.label}</span>
              <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                {item.hint}
              </span>
            </span>
          </label>
        ))}
      </div>

      {channel === 'group' && (
        <div className="mt-3 rounded-xl p-3" style={{ background: 'var(--surface-2)' }}>
          <label className="adm-label">Guruh chat ID si</label>
          <input
            className="adm-input"
            value={groupChatId}
            onChange={(e) => setGroupChatId(e.target.value)}
            placeholder="-1001234567890"
          />
          <p className="mt-1.5 text-xs" style={{ color: 'var(--muted)' }}>
            Botni guruhga qo‘shing, admin qiling va guruhda <b>/group</b> deb
            yozing — bot guruh ID sini o‘zi aytadi.
          </p>
          <button
            className="adm-btn adm-btn--ghost mt-2 w-full"
            onClick={test}
            disabled={testing || !groupChatId.trim()}
          >
            {testing ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
            Sinov xabarini yuborish
          </button>
        </div>
      )}

      <button
        className="adm-btn adm-btn--primary mt-4 w-full"
        onClick={() => onSave('courier', { channel, groupChatId, notifyAdmins })}
        disabled={busy}
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : null} Saqlash
      </button>
    </Section>
  )
}

function Toggle({
  checked, onChange, label, hint,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  hint: string
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-2">
      <input
        type="checkbox"
        className="mt-0.5 size-4 shrink-0"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0">
        <span className="block text-sm font-bold">{label}</span>
        <span className="block text-xs" style={{ color: 'var(--muted)' }}>
          {hint}
        </span>
      </span>
    </label>
  )
}

/**
 * «Biz bilan aloqa» — mijoz ko'radigan aloqa ma'lumotlari: mini app
 * «Yordam» sahifasi, botdagi «📞 Biz bilan aloqa» tugmasi va chek.
 */
function ContactCard({ settings, busy, onSave }: { settings: ContactInfo; busy: boolean; onSave: SaveFn }) {
  const [form, setForm] = useState<ContactInfo>({ ...settings, telegram: settings.telegram ? `@${settings.telegram}` : '' })
  const set = (key: keyof ContactInfo, value: string) => setForm({ ...form, [key]: value })

  return (
    <Section title="Biz bilan aloqa" icon={Headphones} hint="Mini app «Yordam» sahifasi, botdagi «📞 Biz bilan aloqa» va chekda chiqadi">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="adm-label" htmlFor="ct-phone">Telefon</label>
          <input id="ct-phone" className="adm-input" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+998 90 123 45 67" maxLength={40} />
        </div>
        <div>
          <label className="adm-label" htmlFor="ct-tg">Telegram (mijozlar xizmati)</label>
          <input id="ct-tg" className="adm-input" value={form.telegram} onChange={(e) => set('telegram', e.target.value)} placeholder="@musa_support" maxLength={100} />
        </div>
        <div className="sm:col-span-2">
          <label className="adm-label" htmlFor="ct-email">Email</label>
          <input id="ct-email" className="adm-input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="info@musa.uz" maxLength={120} />
        </div>
        <div className="sm:col-span-2">
          <label className="adm-label" htmlFor="ct-address">Manzil</label>
          <input id="ct-address" className="adm-input" value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Toshkent, O‘zbekiston" maxLength={200} />
        </div>
        <div className="sm:col-span-2">
          <label className="adm-label" htmlFor="ct-hours">Ish vaqti</label>
          <input id="ct-hours" className="adm-input" value={form.workHours} onChange={(e) => set('workHours', e.target.value)} placeholder="09:00 — 20:00" maxLength={60} />
        </div>
      </div>
      <button className="adm-btn adm-btn--primary mt-4 w-full" onClick={() => onSave('contact', form)} disabled={busy}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : null} Saqlash
      </button>
    </Section>
  )
}

/**
 * Kompaniya rekvizitlari — nakladnoy (yuk xati) va marshrut varaqasida
 * «Yetkazib beruvchi» sifatida chiqadi. Bo'sh qolsa brend nomi ishlatiladi.
 */
function CompanyCard({ settings, busy, onSave }: { settings: CompanySettings; busy: boolean; onSave: SaveFn }) {
  const [form, setForm] = useState<CompanySettings>(settings)
  const set = (key: keyof CompanySettings, value: string) => setForm({ ...form, [key]: value })
  const digits = (key: keyof CompanySettings, max: number) => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(key, e.target.value.replace(/\D/g, '').slice(0, max))

  return (
    <Section title="Kompaniya rekvizitlari" icon={Building2} hint="Nakladnoy va marshrut varaqasida chiqadi">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="adm-label" htmlFor="co-name">Korxona nomi</label>
          <input id="co-name" className="adm-input" value={form.legalName} onChange={(e) => set('legalName', e.target.value)} placeholder="«MUSA FOOD» MChJ" maxLength={120} />
        </div>
        <div>
          <label className="adm-label" htmlFor="co-inn">STIR (INN)</label>
          <input id="co-inn" className="adm-input" inputMode="numeric" value={form.inn} onChange={digits('inn', 9)} placeholder="9 ta raqam" />
        </div>
        <div>
          <label className="adm-label" htmlFor="co-phone">Telefon</label>
          <input id="co-phone" className="adm-input" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+998 …" maxLength={40} />
        </div>
        <div className="sm:col-span-2">
          <label className="adm-label" htmlFor="co-address">Yuridik manzil</label>
          <input id="co-address" className="adm-input" value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Toshkent sh., …" maxLength={200} />
        </div>
        <div className="sm:col-span-2">
          <label className="adm-label" htmlFor="co-bank">Bank</label>
          <input id="co-bank" className="adm-input" value={form.bank} onChange={(e) => set('bank', e.target.value)} placeholder="«…bank» ATB, … filiali" maxLength={120} />
        </div>
        <div>
          <label className="adm-label" htmlFor="co-acc">Hisob raqami</label>
          <input id="co-acc" className="adm-input" inputMode="numeric" value={form.account} onChange={digits('account', 20)} placeholder="20 ta raqam" />
        </div>
        <div>
          <label className="adm-label" htmlFor="co-mfo">MFO</label>
          <input id="co-mfo" className="adm-input" inputMode="numeric" value={form.mfo} onChange={digits('mfo', 5)} placeholder="5 ta raqam" />
        </div>
        <div className="sm:col-span-2">
          <label className="adm-label" htmlFor="co-dir">Rahbar (imzo uchun)</label>
          <input id="co-dir" className="adm-input" value={form.director} onChange={(e) => set('director', e.target.value)} placeholder="F.I.Sh." maxLength={80} />
        </div>
      </div>
      <button className="adm-btn adm-btn--primary mt-4 w-full" onClick={() => onSave('company', form)} disabled={busy}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : null} Saqlash
      </button>
    </Section>
  )
}
