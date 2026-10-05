import { AlertTriangle, DatabaseBackup, Download, Loader2, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { apiPost } from '../lib/api'
import { ConfirmDialog, Modal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { longDate } from '../lib/dates'

/**
 * Zaxira nusxalar (faqat ega).
 *
 * Butun baza bitta siqilgan faylga olinadi va Firebase Storage'ning
 * yopiq `backups/` papkasida saqlanadi. Avtomatik — belgilangan kunda bir
 * (sukut: haftada bir); qo'lda — «Hozir nusxa olish». Tiklash tanlangan
 * kolleksiyalarni nusxadagi holatga qaytaradi va oldin hozirgi holatning
 * ham nusxasini oladi — xato tanlansa ortga qaytish mumkin.
 * Server: api/_lib/actions/backup.ts.
 */

type BackupFile = {
  name: string
  size: number
  createdAt: string | null
  docs: number | null
  reason: 'auto' | 'manual' | null
  by: string | null
}
type Settings = { auto: boolean; intervalDays: number; keep: number; lastAt: string | null }
type ListResult = { files: BackupFile[]; settings: Settings }

/** Tiklashda ko'rsatiladigan nomlar. */
const COLLECTIONS: Record<string, string> = {
  orders: 'Buyurtmalar', products: 'Mahsulotlar', categories: 'Kategoriyalar', sections: 'Bo‘limlar',
  users: 'Mijozlar', staff: 'Xodimlar', promotions: 'Aksiyalar', promocodes: 'Promokodlar', ads: 'Reklama',
  settings: 'Sozlamalar', reviews: 'Sharhlar', notifications: 'Bildirishnomalar', linko_products: 'Linko katalogi',
  channel_posts: 'Kanal e’lonlari', broadcasts: 'Ommaviy xabarlar', scheduled_posts: 'Rejalashtirilganlar',
  post_templates: 'Shablonlar', audit_log: 'Harakatlar jurnali', cash_handovers: 'Kassa topshirishlari',
  support_threads: 'Murojaatlar', campaign_stats: 'Kampaniya statistikasi', analytics: 'Analitika',
  counters: 'Hisoblagichlar', dispatch: 'Kuryerga yuborishlar', courier_locations: 'Kuryer joylashuvi',
}

const size = (bytes: number) =>
  bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
const when = (iso: string | null) =>
  longDate(iso)

export function BackupPage() {
  const { show, node: toast } = useToast()
  const [data, setData] = useState<ListResult | null>(null)
  const [busy, setBusy] = useState('')
  const [deleting, setDeleting] = useState<BackupFile | null>(null)
  const [restoring, setRestoring] = useState<BackupFile | null>(null)
  const onRestoreError = useCallback((m: string) => show(m, 'error'), [show])

  useEffect(() => {
    let alive = true
    apiPost<ListResult>('action', { action: 'backup.list' })
      .then((r) => { if (alive) setData(r) })
      .catch((e: unknown) => { if (alive) show(e instanceof Error ? e.message : 'Ro‘yxat yuklanmadi', 'error') })
    return () => { alive = false }
  }, [show])

  const run = async () => {
    setBusy('run')
    try {
      const r = await apiPost<{ docs: number; size: number }>('action', { action: 'backup.run' })
      show(`Nusxa olindi: ${r.docs.toLocaleString('ru-RU')} ta yozuv, ${size(r.size)}`)
      setData(await apiPost<ListResult>('action', { action: 'backup.list' }))
    } catch (e) {
      show(e instanceof Error ? e.message : 'Nusxa olinmadi', 'error')
    } finally {
      setBusy('')
    }
  }

  const saveSettings = async (patch: Partial<Settings>) => {
    setBusy('settings')
    try {
      setData(await apiPost<ListResult>('action', { action: 'backup.settings', ...patch }))
      show('Saqlandi')
    } catch (e) {
      show(e instanceof Error ? e.message : 'Saqlanmadi', 'error')
    } finally {
      setBusy('')
    }
  }

  const download = async (file: BackupFile) => {
    setBusy(file.name)
    try {
      const { url } = await apiPost<{ url: string }>('action', { action: 'backup.download', name: file.name })
      window.open(url, '_blank', 'noopener')
    } catch (e) {
      show(e instanceof Error ? e.message : 'Yuklab bo‘lmadi', 'error')
    } finally {
      setBusy('')
    }
  }

  const remove = async () => {
    const file = deleting
    setDeleting(null)
    if (!file) return
    try {
      setData(await apiPost<ListResult>('action', { action: 'backup.delete', name: file.name }))
      show('Nusxa o‘chirildi')
    } catch (e) {
      show(e instanceof Error ? e.message : 'O‘chirilmadi', 'error')
    }
  }

  const settings = data?.settings

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <section className="adm-card p-4 sm:p-5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>
              <DatabaseBackup size={18} />
            </span>
            <div>
              <h2 className="text-sm font-extrabold">Zaxira nusxa</h2>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Oxirgisi: {when(settings?.lastAt ?? null)}</p>
            </div>
          </div>

          <button className="adm-btn adm-btn--primary mt-4 w-full py-3" onClick={() => void run()} disabled={busy === 'run'}>
            {busy === 'run' ? <Loader2 size={17} className="animate-spin" /> : <DatabaseBackup size={17} />}
            {busy === 'run' ? 'Nusxa olinmoqda…' : 'Hozir nusxa olish'}
          </button>

          {settings && (
            <>
              <label className="mt-5 flex items-center justify-between gap-3 text-sm">
                <span>
                  <b>Avtomatik nusxa</b>
                  <span className="block text-xs" style={{ color: 'var(--muted)' }}>Server o‘zi oladi — hech narsa qilish shart emas</span>
                </span>
                <input
                  type="checkbox"
                  className="adm-ch-switch"
                  checked={settings.auto}
                  onChange={(e) => void saveSettings({ auto: e.target.checked })}
                  disabled={busy === 'settings'}
                />
              </label>
              <p className="adm-label mt-4">Qanchalik tez-tez</p>
              <div className="flex flex-wrap gap-1.5">
                {[1, 3, 7, 14].map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={'adm-chip ' + (settings.intervalDays === d ? 'active' : '')}
                    onClick={() => void saveSettings({ intervalDays: d })}
                    disabled={!settings.auto || busy === 'settings'}
                  >
                    {d === 1 ? 'Har kuni' : d === 7 ? 'Haftada bir' : `${d} kunda bir`}
                  </button>
                ))}
              </div>
              <p className="adm-label mt-4">Nechta nusxa saqlansin</p>
              <div className="flex flex-wrap gap-1.5">
                {[4, 8, 12, 24].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={'adm-chip ' + (settings.keep === n ? 'active' : '')}
                    onClick={() => void saveSettings({ keep: n })}
                    disabled={busy === 'settings'}
                  >
                    {n} ta
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs" style={{ color: 'var(--faint)' }}>Eskilari o‘zi o‘chadi — eng yangi {settings.keep} tasi qoladi.</p>
            </>
          )}

          <p className="adm-bc-note mt-5 flex gap-2">
            <ShieldCheck size={16} className="shrink-0" />
            <span>Nusxalar yopiq joyda — faqat server o‘qiydi. Yuklab olish havolasi 10 daqiqa ishlaydi. Faylda mijozlar ma’lumoti bor, uni ehtiyot saqlang.</span>
          </p>
        </section>

        <section className="adm-card p-4 sm:p-5">
          <h2 className="text-sm font-extrabold">Nusxalar</h2>
          {!data ? (
            <p className="mt-3 text-sm" style={{ color: 'var(--muted)' }}><Loader2 size={15} className="inline animate-spin" /> Yuklanmoqda…</p>
          ) : data.files.length === 0 ? (
            <p className="mt-3 text-sm" style={{ color: 'var(--muted)' }}>Hali nusxa yo‘q. «Hozir nusxa olish» ni bosing.</p>
          ) : (
            <ul className="mt-2 flex flex-col">
              {data.files.map((file) => (
                <li key={file.name} className="adm-ch-post">
                  <span className="adm-ch-post__thumb"><DatabaseBackup size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="adm-ch-post__text">{when(file.createdAt)}</p>
                    <p className="adm-ch-post__meta">
                      {file.reason === 'auto' ? 'Avtomatik' : 'Qo‘lda'}
                      {file.by && file.reason !== 'auto' ? ` · ${file.by}` : ''}
                      {file.docs ? ` · ${file.docs.toLocaleString('ru-RU')} yozuv` : ''} · {size(file.size)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" className="adm-icon-btn" onClick={() => void download(file)} disabled={busy === file.name} aria-label="Yuklab olish" title="Yuklab olish">
                      {busy === file.name ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                    </button>
                    <button type="button" className="adm-icon-btn" onClick={() => setRestoring(file)} aria-label="Tiklash" title="Shu nusxadan tiklash">
                      <RotateCcw size={14} />
                    </button>
                    <button type="button" className="adm-icon-btn adm-icon-btn--danger" onClick={() => setDeleting(file)} aria-label="O‘chirish" title="O‘chirish">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {deleting && (
        <ConfirmDialog
          title="Nusxa o‘chirilsinmi?"
          message={`${when(deleting.createdAt)} dagi nusxa butunlay o‘chadi.`}
          confirmLabel="Ha, o‘chirilsin"
          onConfirm={() => void remove()}
          onClose={() => setDeleting(null)}
        />
      )}
      {restoring && (
        <RestoreModal
          file={restoring}
          onClose={() => setRestoring(null)}
          onDone={(message) => {
            setRestoring(null)
            show(message)
            apiPost<ListResult>('action', { action: 'backup.list' }).then(setData).catch(() => undefined)
          }}
          onError={onRestoreError}
        />
      )}
      {toast}
    </>
  )
}

function RestoreModal({
  file, onClose, onDone, onError,
}: {
  file: BackupFile
  onClose: () => void
  onDone: (message: string) => void
  onError: (message: string) => void
}) {
  const [counts, setCounts] = useState<Record<string, number> | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    apiPost<{ counts: Record<string, number> }>('action', { action: 'backup.inspect', name: file.name })
      .then((r) => { if (alive) setCounts(r.counts) })
      .catch((e: unknown) => { if (alive) onError(e instanceof Error ? e.message : 'Nusxa o‘qilmadi') })
    return () => { alive = false }
  }, [file.name, onError])

  const collections = Object.entries(counts ?? {}).filter(([name]) => !name.startsWith('*/'))

  const restore = async () => {
    setBusy(true)
    try {
      const r = await apiPost<{ written: number }>('action', {
        action: 'backup.restore', name: file.name, collections: picked, confirm,
      })
      onDone(`Tiklandi: ${r.written.toLocaleString('ru-RU')} ta yozuv. Oldingi holat alohida nusxaga saqlandi.`)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Tiklanmadi')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Nusxadan tiklash"
      onClose={onClose}
      footer={
        <>
          <button className="adm-btn adm-btn--ghost flex-1" onClick={onClose} disabled={busy}>Bekor qilish</button>
          <button className="adm-btn adm-btn--danger flex-1" onClick={() => void restore()} disabled={busy || !picked.length || confirm !== 'TIKLASH'}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />} Tiklash
          </button>
        </>
      }
    >
      <p className="text-sm"><b>{when(file.createdAt)}</b> dagi holatga qaytariladi.</p>
      <p className="adm-ch-problem">
        <AlertTriangle size={15} />
        Tanlangan bo‘limlardagi yozuvlar nusxadagi holatga qaytadi — shundan keyingi o‘zgarishlar ustidan yoziladi.
        Nusxadan keyin qo‘shilgan yozuvlar o‘chmaydi. Tiklashdan oldin hozirgi holat avtomatik saqlanadi.
      </p>
      <p className="adm-label mt-3">Nimani tiklash kerak</p>
      {!counts ? (
        <p className="text-sm" style={{ color: 'var(--muted)' }}><Loader2 size={14} className="inline animate-spin" /> Nusxa o‘qilmoqda…</p>
      ) : (
        <div className="adm-picklist" style={{ maxHeight: '34vh' }}>
          {collections.map(([name, n]) => (
            <label key={name}>
              <input
                type="checkbox"
                checked={picked.includes(name)}
                onChange={() => setPicked(picked.includes(name) ? picked.filter((p) => p !== name) : [...picked, name])}
              />
              <span className="truncate">{COLLECTIONS[name] ?? name}</span>
              <small>{n.toLocaleString('ru-RU')} ta</small>
            </label>
          ))}
        </div>
      )}
      <label className="adm-label mt-3" htmlFor="restore-confirm">Tasdiqlash uchun <b>TIKLASH</b> deb yozing</label>
      <input id="restore-confirm" className="adm-input" value={confirm} onChange={(e) => setConfirm(e.target.value.toUpperCase())} autoComplete="off" />
    </Modal>
  )
}
