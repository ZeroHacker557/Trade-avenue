import { CalendarClock, CheckCircle2, Copy, Loader2, Megaphone, Send, Users, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { apiPost } from '../lib/api'
import type { UploadedAdMedia } from '../lib/storage'
import { ConfirmDialog } from '../components/Modal'
import { useToast } from '../components/Toast'
import { ButtonsEditor, MediaField, PostPreview } from '../components/PostComposer'
import { AudiencePicker } from '../components/Audience'
import {
  ProductFillButton, ScheduledList, SchedulePicker, StatsLine, TemplatesBar,
  type CampaignStats, type Draft, type ScheduledRow,
} from '../components/ComposerTools'
import { CAPTION_MAX, buttonError, cleanButtons, plainLength, toButtonDraft, type ButtonDraft } from '../lib/post-draft'
import { displayName, sendToCustomers, useAudience, type Progress } from '../lib/audience'
import { localInput, useNow, useScheduled } from '../lib/schedule'
import { shortDate, longDate } from '../lib/dates'

/**
 * Ommaviy xabar — botda mijozlarga (har biri o'z tilida).
 * Muharrir, auditoriya, shablonlar va rejalashtirish «Kanal» sahifasi
 * bilan umumiy. Har yuborish kampaniya sifatida saqlanadi: tarixda
 * yetkazilganlar, tugmani bosganlar, buyurtmalar va tushum ko'rinadi.
 */

type RawButton = { text: string; textRu: string; kind: 'url' | 'app'; url: string; target: string; style: string | null }
type Campaign = {
  id: string
  at: string
  by: string
  snippet: string
  media: { type: 'image' | 'video'; url: string } | null
  draft?: { text: string; textRu: string; buttons: RawButton[] }
  audience?: string
  total: number
  sent: number
  failed: number
  status: 'running' | 'done'
  scheduled?: boolean
  channelPostId?: string | null
  stats: CampaignStats
}

export function BroadcastPage() {
  const aud = useAudience()
  const { recipients } = aud
  const { show, node: toast } = useToast()
  const scheduled = useScheduled((m) => show(m, 'error'))
  const now = useNow()

  const [text, setText] = useState('')
  /** Ruscha matn — bo'sh qolsa ruschada ham o'zbekchasi ketadi. */
  const [textRu, setTextRu] = useState('')
  const [media, setMedia] = useState<UploadedAdMedia | null>(null)
  const [uploading, setUploading] = useState(false)
  const [buttons, setButtons] = useState<ButtonDraft[]>([])
  const [later, setLater] = useState(false)
  const [when, setWhen] = useState(() => localInput(Date.now() + 60 * 60_000))

  const [confirming, setConfirming] = useState(false)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [history, setHistory] = useState<Campaign[]>([])
  const [cancelling, setCancelling] = useState<ScheduledRow | null>(null)
  const cancelled = useRef(false)

  const loadHistory = () =>
    apiPost<{ rows: Campaign[] }>('action', { action: 'broadcast.history' })
      .then((r) => setHistory(r.rows))
      .catch(() => undefined)

  // Birinchi yuklash — javob kelganda yoziladi
  useEffect(() => {
    let alive = true
    apiPost<{ rows: Campaign[] }>('action', { action: 'broadcast.history' })
      .then((r) => { if (alive) setHistory(r.rows) })
      .catch(() => undefined)
    return () => { alive = false }
  }, [])

  const loadDraft = (draft: Draft) => {
    setText(draft.text)
    setTextRu(draft.textRu)
    setMedia(draft.media)
    setButtons(draft.buttons)
  }

  const whenMs = Date.parse(when)
  const badTime = later && (!Number.isFinite(whenMs) || whenMs < now + 60_000)

  const start = async () => {
    setConfirming(false)
    setRunning(true)
    cancelled.current = false
    const payloadButtons = cleanButtons(buttons)
    try {
      if (later) {
        const r = await apiPost<{ scheduled: ScheduledRow[] }>('action', {
          action: 'schedule.create',
          runAt: new Date(whenMs).toISOString(),
          customers: true,
          recipients: recipients.map((c) => c.id),
          audience: aud.audienceLabel,
          post: { text, textRu, media, buttons: payloadButtons },
        })
        scheduled.setRows(r.scheduled)
        show(`Rejalashtirildi: ${shortDate(whenMs)}`)
        return
      }
      const { id: campaignId } = await apiPost<{ id: string }>('action', {
        action: 'broadcast.start', text, textRu, media, buttons: payloadButtons,
        audience: aud.audienceLabel, total: recipients.length,
      })
      const totals = await sendToCustomers(
        { text, textRu, media, buttons: payloadButtons, campaignId },
        recipients.map((c) => c.id),
        setProgress,
        () => cancelled.current,
      )
      show(
        cancelled.current
          ? `To‘xtatildi — ${totals.sent} ta yuborildi`
          : `Tayyor: ${totals.sent} ta yuborildi, ${totals.failed} ta yetmadi`,
      )
      void loadHistory()
    } catch (error) {
      show(error instanceof Error ? error.message : 'Yuborishda xato', 'error')
    } finally {
      setRunning(false)
    }
  }

  const cancelScheduled = async () => {
    const row = cancelling
    setCancelling(null)
    if (!row) return
    try {
      const r = await apiPost<{ scheduled: ScheduledRow[] }>('action', { action: 'schedule.cancel', id: row.id })
      scheduled.setRows(r.scheduled)
      show('Rejalashtirilgan xabar bekor qilindi')
    } catch (error) {
      show(error instanceof Error ? error.message : 'Bekor qilib bo‘lmadi', 'error')
    }
  }

  const buttonsInvalid = buttons.some((b) => buttonError(b))
  const longCaption = Boolean(media) && Math.max(plainLength(text), plainLength(textRu)) > CAPTION_MAX
  const blocked = running || uploading || buttonsInvalid || (!text.trim() && !media) || recipients.length === 0 || badTime

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <section className="adm-card p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-start gap-2">
            <ProductFillButton onFill={(d) => { loadDraft(d); show('Mahsulot xabari tayyor — tekshirib yuboring') }} disabled={running} />
            <TemplatesBar
              current={{ text, textRu, media, buttons }}
              onLoad={loadDraft}
              onError={(m) => show(m, 'error')}
              onDone={(m) => show(m)}
              disabled={running}
            />
          </div>

          {/* Rasm yoki video — matn uning izohi bo'lib ketadi */}
          <MediaField
            media={media}
            onChange={setMedia}
            onBusy={setUploading}
            disabled={running}
            onError={(message) => show(message, 'error')}
          />

          <label className="adm-label mt-4" htmlFor="broadcast-text">Xabar matni</label>
          <textarea
            id="broadcast-text"
            className="adm-input"
            rows={7}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'🎉 Yangi mahsulot!\n\nMUSA plombiri endi katalogda. Buyurtma bering — tez yetkazamiz.'}
            disabled={running}
            maxLength={3500}
          />
          <div className="mt-1.5 flex items-center justify-between">
            <p className="text-xs" style={{ color: 'var(--faint)' }}>
              HTML: &lt;b&gt;qalin&lt;/b&gt;, &lt;i&gt;qiya&lt;/i&gt;, &lt;a href=""&gt;havola&lt;/a&gt;
            </p>
            <p className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>{text.length} / 3500</p>
          </div>

          {/* Ruscha matn: mijoz botda yoki ilovada rus tilini tanlagan
              bo'lsa shu ketadi. Bo'sh qolsa — hammaga o'zbekchasi. */}
          <label className="adm-label mt-4" htmlFor="broadcast-text-ru">Xabar matni (ruscha)</label>
          <textarea
            id="broadcast-text-ru"
            className="adm-input"
            rows={7}
            value={textRu}
            onChange={(e) => setTextRu(e.target.value)}
            placeholder={'🎉 Новинка!\n\nПломбир MUSA уже в каталоге. Закажите — доставим быстро.'}
            disabled={running}
            maxLength={3500}
          />
          <div className="mt-1.5 flex items-center justify-between">
            <p className="text-xs" style={{ color: 'var(--faint)' }}>
              Bo‘sh qoldirilsa, rus tilidagi mijozlarga ham o‘zbekcha matn boradi
            </p>
            <p className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>{textRu.length} / 3500</p>
          </div>
          {longCaption && (
            <p className="adm-bc-note">
              Matn {CAPTION_MAX} belgidan uzun — Telegram rasm ostiga buncha matn sig‘dirmaydi.
              Avval rasm/video, keyin matn tugmalar bilan alohida xabar bo‘lib boradi.
            </p>
          )}

          {/* Inline tugmalar — xabar ostida, har biri alohida qatorda */}
          <ButtonsEditor buttons={buttons} onChange={setButtons} disabled={running} />

          <p className="adm-label mt-4">Kimga</p>
          <AudiencePicker state={aud} disabled={running} />

          <p className="adm-label mt-4">Qachon</p>
          <SchedulePicker enabled={later} onEnabled={setLater} value={when} onChange={setWhen} disabled={running} />
          {badTime && <p className="mt-1.5 text-xs" style={{ color: 'var(--danger)' }}>Vaqt kamida 1 daqiqa keyin bo‘lsin</p>}

          <button
            className="adm-btn adm-btn--primary mt-4 w-full py-3"
            onClick={() => setConfirming(true)}
            disabled={blocked}
          >
            {running ? <Loader2 size={17} className="animate-spin" /> : later ? <CalendarClock size={17} /> : <Send size={17} />}
            {running
              ? 'Yuborilmoqda...'
              : !recipients.length
                ? 'Qabul qiluvchi yo‘q'
                : later
                  ? `${recipients.length} ta mijozga rejalashtirish`
                  : `${recipients.length} ta mijozga yuborish`}
          </button>

          {running && !later && (
            <button className="adm-btn adm-btn--ghost mt-2 w-full" onClick={() => { cancelled.current = true }}>
              To‘xtatish
            </button>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <div className="adm-card p-4">
            <h2 className="text-sm font-extrabold">Ko‘rinishi</h2>
            <div className="mt-3">
              <PostPreview media={media} text={text} buttons={buttons} />
            </div>
          </div>

          <div className="adm-card p-4">
            <h2 className="flex items-center gap-2 text-sm font-extrabold">
              <Users size={16} /> Qabul qiluvchilar
              <span className="ml-auto text-lg font-extrabold" style={{ color: 'var(--brand)' }}>{recipients.length}</span>
            </h2>
            {recipients.length ? (
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {recipients.slice(0, 8).map((c) => (
                  <li key={c.id} className="flex justify-between gap-2">
                    <span className="truncate">{displayName(c)}</span>
                    <span className="shrink-0 text-xs" style={{ color: 'var(--faint)' }}>{c.phone || ''}</span>
                  </li>
                ))}
                {recipients.length > 8 && (
                  <li className="text-xs" style={{ color: 'var(--muted)' }}>… va yana {recipients.length - 8} ta</li>
                )}
              </ul>
            ) : (
              <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
                Tanlangan shartga mos mijoz yo‘q. Boshqa guruh yoki filtrni tanlang.
              </p>
            )}
          </div>

          {progress && (
            <div className="adm-card p-4">
              <h2 className="text-sm font-extrabold">Jarayon</h2>
              <div className="mt-3 flex flex-col gap-2 text-sm">
                <Line icon={<CheckCircle2 size={15} />} label="Yuborildi" value={progress.sent} tone="var(--brand)" />
                <Line icon={<XCircle size={15} />} label="Yetmadi — bot bloklangan" value={progress.failed} tone="var(--danger)" />
                <Line icon={<Megaphone size={15} />} label="O‘tkazib yuborildi" value={progress.skipped} tone="var(--muted)" />
              </div>
              {running && (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--surface-3)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      background: 'var(--brand)',
                      width: `${Math.min(100, (progress.processed / Math.max(1, recipients.length)) * 100)}%`,
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              )}
            </div>
          )}

          <ScheduledList rows={scheduled.rows} filter={(r) => r.customers && !r.channel} onCancel={setCancelling} />

          <div className="adm-card p-4">
            <h2 className="text-sm font-extrabold">Oxirgi xabarlar va natijasi</h2>
            {history.length === 0 ? (
              <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>Hali xabar yuborilmagan.</p>
            ) : (
              <ul className="mt-2 flex flex-col">
                {history.map((c) => (
                  <li key={c.id} className="adm-ch-post">
                    <span className="adm-ch-post__thumb">
                      {c.media?.type === 'image' ? <img src={c.media.url} alt="" loading="lazy" /> : <Megaphone size={16} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="adm-ch-post__text">{c.snippet || (c.media ? 'Rasm/video' : '—')}</p>
                      <p className="adm-ch-post__meta">
                        {shortDate(c.at)}
                        {' · '}{c.by}{c.audience ? ` · ${c.audience}` : ''}
                        {c.scheduled && ' · rejadagi'}{c.channelPostId && ' · kanal bilan'}
                        {c.status === 'running' && ' · davom etmoqda'}
                      </p>
                      <StatsLine stats={c.stats} sent={c.sent} />
                    </div>
                    {c.draft && (
                      <button
                        type="button"
                        className="adm-icon-btn"
                        onClick={() => {
                          const d = c.draft!
                          loadDraft({ text: d.text, textRu: d.textRu, media: c.media, buttons: (d.buttons ?? []).map(toButtonDraft) })
                          window.scrollTo({ top: 0, behavior: 'smooth' })
                          show('Xabar muharrirga yuklandi')
                        }}
                        aria-label="Takrorlash"
                        title="Muharrirga yuklash"
                      >
                        <Copy size={14} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px]" style={{ color: 'var(--faint)' }}>
              ✉️ yetkazildi · tugmani bosganlar · buyurtmalar · tushum (bosgandan keyin 3 kun ichida)
            </p>
          </div>
        </section>
      </div>

      {confirming && (
        <ConfirmDialog
          title={later ? 'Xabar rejalashtirilsinmi?' : 'Ommaviy xabar yuborilsinmi?'}
          message={later
            ? `Xabar ${longDate(whenMs)} da ${recipients.length} ta mijozga yuboriladi. Undan oldin bekor qilish mumkin.`
            : `Xabar ${recipients.length} ta mijozga boradi. Yuborilgan xabarni qaytarib bo‘lmaydi.`}
          confirmLabel={later ? 'Ha, rejalashtirilsin' : 'Ha, yuborilsin'}
          onConfirm={start}
          onClose={() => setConfirming(false)}
        />
      )}
      {cancelling && (
        <ConfirmDialog
          title="Rejalashtirilgan xabar bekor qilinsinmi?"
          message="Xabar belgilangan vaqtda yuborilmaydi."
          confirmLabel="Ha, bekor qilinsin"
          onConfirm={cancelScheduled}
          onClose={() => setCancelling(null)}
        />
      )}

      {toast}
    </>
  )
}

function Line({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center gap-2">
      <span style={{ color: tone }}>{icon}</span>
      <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--muted)' }}>{label}</span>
      <span className="font-extrabold">{value}</span>
    </div>
  )
}
