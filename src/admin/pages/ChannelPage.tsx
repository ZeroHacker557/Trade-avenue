import {
  AlertTriangle, BarChart3, BellOff, CalendarClock, CheckCircle2, Copy, ExternalLink, Film, Link2, Loader2, Megaphone, Pencil,
  Pin, PlugZap, Plus, RefreshCw, Send, ShieldCheck, Square, Trash2, Unplug, Users, X, XCircle,
} from 'lucide-react'
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
import { localInput, useNow, useScheduled } from '../lib/schedule'
import { shortDate, longDate } from '../lib/dates'
import {
  CAPTION_MAX, buttonError, cleanButtons, plainLength, toButtonDraft, type ButtonDraft,
} from '../lib/post-draft'
import { sendToCustomers, useAudience, type Progress } from '../lib/audience'

/**
 * Telegram kanali — e'lon va so'rovnoma joylash.
 *
 * Tepada ulanish holati (bot adminmi, post joylay oladimi — jonli
 * tekshiriladi), pastda muharrir: rasm/video, matn, tugmalar (havola yoki
 * ilovaning kerakli joyi, rangi). Xohlasa o'sha e'lon bir vaqtda botda
 * mijozlarga ham ketadi; hozir yoki belgilangan vaqtda. Har e'lonning
 * natijasi — tugmani bosganlar, buyurtmalar va tushum — tarixda ko'rinadi.
 * Server: api/_lib/actions/channel.ts, scheduler.ts, campaigns.ts.
 */

type Rights = { isAdmin: boolean; canPost: boolean; canEdit: boolean; canDelete: boolean }
type ChannelInfo = { chatId: number; title: string; username: string | null; members: number | null; link: string | null }
type RawButton = { text: string; textRu: string; kind: 'url' | 'app'; url: string; target: string; style: string | null }
type PollState = {
  question: string
  options: { text: string; voters: number }[]
  total: number
  closed: boolean
  quiz?: boolean
  correct?: number | null
  multiple?: boolean
}
type Post = {
  id: string
  type?: 'post' | 'poll'
  link: string
  snippet: string
  media: { type: 'image' | 'video'; url: string } | null
  buttons: number
  pinned: boolean
  silent: boolean
  protect: boolean
  preview?: boolean
  customers: number
  by: string
  at: string
  editedAt?: string
  deleted: boolean
  layout?: 'text' | 'caption' | 'split'
  draft?: { text: string; textRu: string; bilingual: boolean; buttons: RawButton[] }
  poll?: PollState | null
  stats?: CampaignStats
}
type Status = {
  connected: boolean
  channel: ChannelInfo | null
  rights: Rights | null
  problem: string | null
  bot: { username: string; appLinks: boolean } | null
  candidates: { chatId: number; title: string; username: string | null }[]
  posts: Post[]
}

const formatWhen = (iso: string) => {
  return shortDate(iso)
}

export function ChannelPage() {
  const { show, node: toast } = useToast()
  const aud = useAudience()
  const scheduled = useScheduled((m) => show(m, 'error'))
  // Har 30 soniyada yangilanadigan «hozir» — vaqt tekshiruvi render'da sof qoladi
  const now = useNow()

  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [chatInput, setChatInput] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [changing, setChanging] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [mode, setMode] = useState<'post' | 'poll'>('post')

  // Muharrir
  const [media, setMedia] = useState<UploadedAdMedia | null>(null)
  const [uploading, setUploading] = useState(false)
  const [text, setText] = useState('')
  const [textRu, setTextRu] = useState('')
  const [bilingual, setBilingual] = useState(false)
  const [buttons, setButtons] = useState<ButtonDraft[]>([])
  /** Joylangan e'lonni tahrirlash — matn va tugmalar. */
  const [editing, setEditing] = useState<Post | null>(null)

  // Qayerga, qachon va qanday
  const [toChannel, setToChannel] = useState(true)
  const [toCustomers, setToCustomers] = useState(false)
  const [later, setLater] = useState(false)
  const [when, setWhen] = useState(() => localInput(Date.now() + 60 * 60_000))
  const [silent, setSilent] = useState(false)
  const [pin, setPin] = useState(false)
  const [protect, setProtect] = useState(false)
  const [preview, setPreview] = useState(false)

  const [confirming, setConfirming] = useState(false)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [lastLink, setLastLink] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Post | null>(null)
  const [cancelling, setCancelling] = useState<ScheduledRow | null>(null)
  const cancelled = useRef(false)

  const reload = async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      setStatus(await apiPost<Status>('action', { action: 'channel.status' }))
    } catch (error) {
      show(error instanceof Error ? error.message : 'Holatni olib bo‘lmadi', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Birinchi yuklash — natija kelganda holat yoziladi
  useEffect(() => {
    let alive = true
    apiPost<Status>('action', { action: 'channel.status' })
      .then((next) => { if (alive) setStatus(next) })
      .catch((error: unknown) => { if (alive) show(error instanceof Error ? error.message : 'Holatni olib bo‘lmadi', 'error') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [show])

  const connect = async (chat: string) => {
    setConnecting(true)
    try {
      setStatus(await apiPost<Status>('action', { action: 'channel.connect', chat }))
      setChatInput('')
      setChanging(false)
      show('Kanal ulandi')
    } catch (error) {
      show(error instanceof Error ? error.message : 'Ulab bo‘lmadi', 'error')
    } finally {
      setConnecting(false)
    }
  }

  const disconnect = async () => {
    setConfirmDisconnect(false)
    try {
      setStatus(await apiPost<Status>('action', { action: 'channel.disconnect' }))
      show('Kanal uzildi')
    } catch (error) {
      show(error instanceof Error ? error.message : 'Uzib bo‘lmadi', 'error')
    }
  }

  const loadDraft = (draft: Draft) => {
    setText(draft.text)
    setTextRu(draft.textRu)
    setBilingual(Boolean(draft.bilingual))
    setMedia(draft.media)
    setButtons(draft.buttons)
  }
  const clearDraft = () => loadDraft({ text: '', textRu: '', bilingual: false, media: null, buttons: [] })

  const ready = Boolean(status?.connected && status.rights?.canPost && !status.problem)
  const channelOn = toChannel && ready
  const customersOn = toCustomers && aud.recipients.length > 0
  const channelText = bilingual && textRu.trim() && text.trim() ? `🇺🇿 ${text.trim()}\n\n🇷🇺 ${textRu.trim()}` : text.trim() || textRu.trim()
  const canPin = Boolean(status?.rights?.canEdit)

  const buttonsInvalid = buttons.some((b) => buttonError(b))
  const empty = !text.trim() && !textRu.trim() && !media
  const whenMs = Date.parse(when)
  const badTime = later && (!Number.isFinite(whenMs) || whenMs < now + 60_000)
  const blocked = running || uploading || buttonsInvalid || empty ||
    (editing ? false : (!channelOn && !customersOn) || badTime)
  const longCaption = Boolean(media) && plainLength(channelOn || editing ? channelText : text) > CAPTION_MAX
  const editTooLong = Boolean(editing?.layout === 'caption') && plainLength(channelText) > CAPTION_MAX

  const postOptions = {
    silent,
    pin: pin && canPin,
    protect,
    preview: preview && !media,
  }

  const send = async () => {
    setConfirming(false)
    setRunning(true)
    setProgress(null)
    setLastLink(null)
    cancelled.current = false
    const payloadButtons = cleanButtons(buttons)
    try {
      // Tahrirlash
      if (editing) {
        await apiPost('action', { action: 'channel.edit', id: editing.id, text, textRu, bilingual, buttons: payloadButtons })
        show('E’lon kanalda yangilandi')
        setEditing(null)
        clearDraft()
        void reload(true)
        return
      }

      // Rejalashtirish — server belgilangan vaqtda o'zi yuboradi
      if (later) {
        const r = await apiPost<{ scheduled: ScheduledRow[] }>('action', {
          action: 'schedule.create',
          runAt: new Date(whenMs).toISOString(),
          channel: channelOn,
          customers: customersOn,
          recipients: customersOn ? aud.recipients.map((c) => c.id) : [],
          audience: aud.audienceLabel,
          post: { text, textRu, bilingual, media, buttons: payloadButtons, ...postOptions },
        })
        scheduled.setRows(r.scheduled)
        show(`Rejalashtirildi: ${shortDate(whenMs)}`)
        return
      }

      let channelPostId: string | null = null
      if (channelOn) {
        const result = await apiPost<{ id: string; link: string; pinError: string | null }>('action', {
          action: 'channel.post',
          text, textRu, bilingual, media, buttons: payloadButtons, ...postOptions,
          customers: customersOn ? aud.recipients.length : 0,
        })
        channelPostId = result.id
        setLastLink(result.link)
        if (result.pinError) show(`E’lon joylandi, lekin qadalmadi: ${result.pinError}`, 'error')
        else if (!customersOn) show('E’lon kanalga joylandi')
      }
      if (customersOn) {
        const { id: campaignId } = await apiPost<{ id: string }>('action', {
          action: 'broadcast.start', text, textRu, media, buttons: payloadButtons,
          audience: aud.audienceLabel, total: aud.recipients.length, channelPostId,
        })
        const totals = await sendToCustomers(
          { text, textRu, media, buttons: payloadButtons, campaignId },
          aud.recipients.map((c) => c.id),
          setProgress,
          () => cancelled.current,
        )
        show(
          (channelOn ? 'Kanalga joylandi. ' : '') +
            (cancelled.current
              ? `Mijozlarga yuborish to‘xtatildi — ${totals.sent} ta yuborildi`
              : `Mijozlarga: ${totals.sent} ta yuborildi, ${totals.failed} ta yetmadi`),
        )
      }
      void reload(true)
    } catch (error) {
      show(error instanceof Error ? error.message : 'Yuborishda xato', 'error')
    } finally {
      setRunning(false)
    }
  }

  const reuse = (post: Post) => {
    if (!post.draft) return
    setEditing(null)
    loadDraft({
      text: post.draft.text,
      textRu: post.draft.textRu,
      bilingual: post.draft.bilingual,
      media: post.media,
      buttons: (post.draft.buttons ?? []).map(toButtonDraft),
    })
    setMode('post')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    show('E’lon muharrirga yuklandi')
  }

  const startEdit = (post: Post) => {
    reuse(post)
    setEditing(post)
    setLater(false)
  }

  const removePost = async () => {
    const post = deleting
    setDeleting(null)
    if (!post) return
    try {
      await apiPost('action', { action: 'channel.delete', id: post.id })
      show('E’lon kanaldan o‘chirildi')
      void reload(true)
    } catch (error) {
      show(error instanceof Error ? error.message : 'O‘chirib bo‘lmadi', 'error')
    }
  }

  const stopPoll = async (post: Post) => {
    try {
      await apiPost('action', { action: 'channel.pollStop', id: post.id })
      show('So‘rovnoma yakunlandi')
      void reload(true)
    } catch (error) {
      show(error instanceof Error ? error.message : 'Yakunlab bo‘lmadi', 'error')
    }
  }

  const cancelScheduled = async () => {
    const row = cancelling
    setCancelling(null)
    if (!row) return
    try {
      const r = await apiPost<{ scheduled: ScheduledRow[] }>('action', { action: 'schedule.cancel', id: row.id })
      scheduled.setRows(r.scheduled)
      show('Rejalashtirilgan e’lon bekor qilindi')
    } catch (error) {
      show(error instanceof Error ? error.message : 'Bekor qilib bo‘lmadi', 'error')
    }
  }

  const sendLabel = running
    ? 'Yuborilmoqda...'
    : editing
      ? 'O‘zgarishlarni saqlash'
      : later
        ? 'Rejalashtirish'
        : channelOn && customersOn
          ? `Kanalga va ${aud.recipients.length} ta mijozga`
          : channelOn
            ? 'Kanalga joylash'
            : customersOn
              ? `${aud.recipients.length} ta mijozga yuborish`
              : 'Qayerga yuborishni tanlang'

  const confirmMessage = editing
    ? 'Kanaldagi e’lon matni va tugmalari yangilanadi. Obunachilarga yangi bildirishnoma bormaydi.'
    : [
      later && `Yuborish vaqti: ${longDate(whenMs)}.`,
      channelOn && `E’lon «${status?.channel?.title}» kanaliga joylanadi${pin && canPin ? ' va qadaladi' : ''}.`,
      customersOn && `${aud.recipients.length} ta mijozga botda yuboriladi.`,
      !later && 'Yuborilgan xabarni qaytarib bo‘lmaydi (kanaldagini keyin o‘chirish yoki tahrirlash mumkin).',
    ].filter(Boolean).join(' ')

  return (
    <>
      {/* ── Ulanish holati ── */}
      <ConnectionCard
        status={status}
        loading={loading}
        changing={changing}
        chatInput={chatInput}
        connecting={connecting}
        onInput={setChatInput}
        onConnect={connect}
        onRefresh={() => void reload()}
        onChange={() => setChanging(true)}
        onCancelChange={() => setChanging(false)}
        onDisconnect={() => setConfirmDisconnect(true)}
      />

      <div className="adm-view-toggle mt-4" role="tablist" aria-label="Turi">
        <button role="tab" aria-selected={mode === 'post'} className={mode === 'post' ? 'is-on' : ''} onClick={() => setMode('post')}>
          <Megaphone size={15} /> E’lon
        </button>
        <button
          role="tab"
          aria-selected={mode === 'poll'}
          className={mode === 'poll' ? 'is-on' : ''}
          onClick={() => { setMode('poll'); setEditing(null) }}
        >
          <BarChart3 size={15} /> So‘rovnoma
        </button>
      </div>

      <div className="mt-3 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        {mode === 'poll' ? (
          <PollForm
            ready={ready}
            canPin={canPin}
            onDone={(link) => { setLastLink(link); void reload(true) }}
            onError={(m) => show(m, 'error')}
            onInfo={(m) => show(m)}
          />
        ) : (
          <section className="adm-card p-4 sm:p-5">
            {editing ? (
              <div className="adm-edit-banner">
                <Pencil size={15} />
                <span className="min-w-0 flex-1">
                  <b>Tahrirlanmoqda:</b> {editing.snippet.slice(0, 70)}
                  <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                    Matn va tugmalar o‘zgaradi. Rasm/videoni almashtirib bo‘lmaydi — kerak bo‘lsa yangi e’lon joylang.
                  </span>
                </span>
                <button type="button" className="adm-icon-btn" onClick={() => { setEditing(null); clearDraft() }} aria-label="Tahrirni bekor qilish">
                  <X size={15} />
                </button>
              </div>
            ) : (
              <div className="mb-3 flex flex-wrap items-start gap-2">
                <ProductFillButton onFill={(d) => { loadDraft(d); show('Mahsulot e’loni tayyor — tekshirib yuboring') }} disabled={running} />
                <TemplatesBar
                  current={{ text, textRu, bilingual, media, buttons }}
                  onLoad={loadDraft}
                  onError={(m) => show(m, 'error')}
                  onDone={(m) => show(m)}
                  disabled={running}
                />
              </div>
            )}

            {editing ? (
              editing.media ? (
                <div className="adm-bc-media is-locked">
                  {editing.media.type === 'image' ? <img src={editing.media.url} alt="" /> : <video src={editing.media.url} muted playsInline preload="metadata" />}
                </div>
              ) : null
            ) : (
              <MediaField
                media={media}
                onChange={setMedia}
                onBusy={setUploading}
                disabled={running}
                onError={(message) => show(message, 'error')}
              />
            )}

            <label className="adm-label mt-4" htmlFor="channel-text">E’lon matni</label>
            <textarea
              id="channel-text"
              className="adm-input"
              rows={7}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'🔥 Yangi aksiya!\n\nBarcha muzqaymoqlarga 20% chegirma — faqat shu hafta.'}
              disabled={running}
              maxLength={3500}
            />
            <div className="mt-1.5 flex items-center justify-between">
              <p className="text-xs" style={{ color: 'var(--faint)' }}>
                HTML: &lt;b&gt;qalin&lt;/b&gt;, &lt;i&gt;qiya&lt;/i&gt;, &lt;a href=""&gt;havola&lt;/a&gt;, &lt;tg-spoiler&gt;
              </p>
              <p className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>{text.length} / 3500</p>
            </div>

            <label className="adm-label mt-4" htmlFor="channel-text-ru">
              Ruscha matn <span style={{ color: 'var(--faint)' }}>(ixtiyoriy)</span>
            </label>
            <textarea
              id="channel-text-ru"
              className="adm-input"
              rows={5}
              value={textRu}
              onChange={(e) => setTextRu(e.target.value)}
              placeholder={'🔥 Новая акция!\n\nСкидка 20% на всё мороженое — только на этой неделе.'}
              disabled={running}
              maxLength={3500}
            />
            <p className="mt-1.5 text-xs" style={{ color: 'var(--faint)' }}>
              Mijozlarga — har biriga o‘z tilida. Kanalga — pastdagi belgiga qarab.
            </p>
            {textRu.trim() && text.trim() && (
              <Toggle
                checked={bilingual}
                onChange={setBilingual}
                label="Kanalga ikki tilda joylash"
                hint="Bitta postda avval o‘zbekcha, keyin ruscha. O‘chiq bo‘lsa — faqat o‘zbekcha"
              />
            )}
            {editTooLong ? (
              <p className="adm-bc-note" style={{ color: 'var(--danger)' }}>
                Rasm ostidagi matn {CAPTION_MAX} belgidan oshmasin — Telegram buni tahrirlashga ruxsat bermaydi.
              </p>
            ) : longCaption && (
              <p className="adm-bc-note">
                Matn {CAPTION_MAX} belgidan uzun — Telegram rasm ostiga buncha matn sig‘dirmaydi.
                Avval rasm/video, keyin matn tugmalar bilan alohida xabar bo‘lib chiqadi.
              </p>
            )}

            <ButtonsEditor buttons={buttons} onChange={setButtons} disabled={running} channel={!toCustomers || Boolean(editing)} />
            {buttons.some((b) => b.kind === 'app') && status?.bot && (
              <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
                {status.bot.appLinks
                  ? `Kanalda «Ilovada ochish» tugmasi @${status.bot.username} ilovasini aynan tanlangan joyda ochadi.`
                  : `Botda asosiy Mini App sozlanmagan — kanaldagi tugma faqat @${status.bot.username} botini ochadi.`}
              </p>
            )}

            {!editing && (
              <>
                {/* ── Qayerga ── */}
                <p className="adm-label mt-5">Qayerga yuborilsin</p>
                <div className="adm-ch-dest">
                  <button
                    type="button"
                    className={'adm-ch-dest__item ' + (channelOn ? 'active' : '')}
                    onClick={() => setToChannel(!toChannel)}
                    disabled={running || !ready}
                    aria-pressed={channelOn}
                  >
                    <span className="adm-ch-dest__icon"><Megaphone size={18} /></span>
                    <span className="min-w-0">
                      <b>Kanalga</b>
                      <span>{ready ? status?.channel?.title : 'Kanal ulanmagan'}</span>
                    </span>
                    <span className="adm-ch-dest__check">{channelOn && <CheckCircle2 size={18} />}</span>
                  </button>
                  <button
                    type="button"
                    className={'adm-ch-dest__item ' + (toCustomers ? 'active' : '')}
                    onClick={() => setToCustomers(!toCustomers)}
                    disabled={running}
                    aria-pressed={toCustomers}
                  >
                    <span className="adm-ch-dest__icon"><Users size={18} /></span>
                    <span className="min-w-0">
                      <b>Mijozlarga ham</b>
                      <span>Botda, har biriga shaxsan</span>
                    </span>
                    <span className="adm-ch-dest__check">{toCustomers && <CheckCircle2 size={18} />}</span>
                  </button>
                </div>

                {channelOn && (
                  <div className="adm-ch-opts">
                    <Toggle checked={silent} onChange={setSilent} icon={<BellOff size={15} />} label="Ovozsiz" hint="Obunachilarga tovushsiz bildirishnoma" />
                    <Toggle
                      checked={pin}
                      onChange={setPin}
                      icon={<Pin size={15} />}
                      label="Kanalda qadash"
                      hint={canPin ? 'E’lon kanal tepasida turadi' : 'Botda «Tahrirlash» huquqi kerak'}
                      disabled={!canPin}
                    />
                    <Toggle checked={protect} onChange={setProtect} icon={<ShieldCheck size={15} />} label="Nusxalashni taqiqlash" hint="Forward qilib, saqlab bo‘lmaydi" />
                    <Toggle checked={preview} onChange={setPreview} icon={<Link2 size={15} />} label="Havola ko‘rinishi" hint="Matndagi birinchi havola kartochka bo‘lib chiqadi" disabled={Boolean(media)} />
                  </div>
                )}

                {toCustomers && (
                  <div className="mt-4">
                    <p className="adm-label">Qaysi mijozlarga</p>
                    <AudiencePicker state={aud} disabled={running} />
                  </div>
                )}

                <p className="adm-label mt-5">Qachon</p>
                <SchedulePicker enabled={later} onEnabled={setLater} value={when} onChange={setWhen} disabled={running} />
                {badTime && <p className="mt-1.5 text-xs" style={{ color: 'var(--danger)' }}>Vaqt kamida 1 daqiqa keyin bo‘lsin</p>}
              </>
            )}

            <button
              className="adm-btn adm-btn--primary mt-5 w-full py-3"
              onClick={() => setConfirming(true)}
              disabled={blocked || editTooLong || (Boolean(editing) && !status?.rights?.canEdit)}
            >
              {running ? <Loader2 size={17} className="animate-spin" /> : editing ? <Pencil size={17} /> : later ? <CalendarClock size={17} /> : <Send size={17} />}
              {sendLabel}
            </button>
            {editing && !status?.rights?.canEdit && (
              <p className="mt-1.5 text-xs" style={{ color: 'var(--danger)' }}>Tahrirlash uchun botga kanalda «Tahrirlash» huquqini bering</p>
            )}
            {running && customersOn && (
              <button className="adm-btn adm-btn--ghost mt-2 w-full" onClick={() => { cancelled.current = true }}>
                Mijozlarga yuborishni to‘xtatish
              </button>
            )}
            {lastLink && !running && (
              <a className="adm-btn adm-btn--ghost mt-2 w-full" href={lastLink} target="_blank" rel="noreferrer">
                <ExternalLink size={16} /> Kanaldagi e’lonni ochish
              </a>
            )}
          </section>
        )}

        <section className="flex flex-col gap-4">
          {mode === 'post' && (
            <div className="adm-card p-4">
              <h2 className="text-sm font-extrabold">Kanalda ko‘rinishi</h2>
              <div className="adm-ch-wall mt-3">
                <PostPreview
                  media={editing ? editing.media : media}
                  text={channelText}
                  buttons={buttons}
                  channel={{ title: status?.channel?.title || 'Kanal' }}
                />
              </div>
            </div>
          )}

          {mode === 'post' && toCustomers && !editing && (
            <div className="adm-card p-4">
              <h2 className="flex items-center gap-2 text-sm font-extrabold">
                <Users size={16} /> Mijozlar
                <span className="ml-auto text-lg font-extrabold" style={{ color: 'var(--brand)' }}>{aud.recipients.length}</span>
              </h2>
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                Botda shaxsiy xabar bo‘lib boradi, tugmalar ilovani to‘g‘ridan-to‘g‘ri ochadi.
              </p>
            </div>
          )}

          {progress && (
            <div className="adm-card p-4">
              <h2 className="text-sm font-extrabold">Mijozlarga yuborish</h2>
              <div className="mt-3 flex flex-col gap-2 text-sm">
                <Line icon={<CheckCircle2 size={15} />} label="Yuborildi" value={progress.sent} tone="var(--brand)" />
                <Line icon={<XCircle size={15} />} label="Yetmadi — bot bloklangan" value={progress.failed} tone="var(--danger)" />
              </div>
              {running && (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--surface-3)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      background: 'var(--brand)',
                      width: `${Math.min(100, (progress.processed / Math.max(1, aud.recipients.length)) * 100)}%`,
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              )}
            </div>
          )}

          <ScheduledList rows={scheduled.rows} filter={(r) => r.channel} onCancel={setCancelling} />

          <History
            posts={status?.posts ?? []}
            canDelete={Boolean(status?.rights?.canDelete)}
            canEdit={Boolean(status?.rights?.canEdit)}
            onReuse={reuse}
            onEdit={startEdit}
            onDelete={setDeleting}
            onStopPoll={stopPoll}
          />
        </section>
      </div>

      {confirming && (
        <ConfirmDialog
          title={editing ? 'E’lon yangilansinmi?' : later ? 'E’lon rejalashtirilsinmi?' : channelOn ? 'E’lon joylansinmi?' : 'Mijozlarga yuborilsinmi?'}
          message={confirmMessage}
          confirmLabel={editing ? 'Ha, saqlansin' : later ? 'Ha, rejalashtirilsin' : 'Ha, yuborilsin'}
          onConfirm={send}
          onClose={() => setConfirming(false)}
        />
      )}
      {confirmDisconnect && (
        <ConfirmDialog
          title="Kanal uzilsinmi?"
          message="Panel bu kanalga e’lon joylamaydi. Bot kanalda qoladi — keyin qayta ulash mumkin."
          confirmLabel="Ha, uzilsin"
          onConfirm={disconnect}
          onClose={() => setConfirmDisconnect(false)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="E’lon kanaldan o‘chirilsinmi?"
          message="Xabar kanaldan butunlay o‘chadi. Mijozlarga botda ketgan nusxalar qoladi."
          confirmLabel="Ha, o‘chirilsin"
          onConfirm={removePost}
          onClose={() => setDeleting(null)}
        />
      )}
      {cancelling && (
        <ConfirmDialog
          title="Rejalashtirilgan e’lon bekor qilinsinmi?"
          message="E’lon belgilangan vaqtda yuborilmaydi."
          confirmLabel="Ha, bekor qilinsin"
          onConfirm={cancelScheduled}
          onClose={() => setCancelling(null)}
        />
      )}
      {toast}
    </>
  )
}

// ─── So'rovnoma ───────────────────────────────────────────────

function PollForm({
  ready, canPin, onDone, onError, onInfo,
}: {
  ready: boolean
  canPin: boolean
  onDone: (link: string) => void
  onError: (message: string) => void
  onInfo: (message: string) => void
}) {
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [multiple, setMultiple] = useState(false)
  const [quiz, setQuiz] = useState(false)
  const [correct, setCorrect] = useState(0)
  const [explanation, setExplanation] = useState('')
  const [silent, setSilent] = useState(false)
  const [pin, setPin] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const filled = options.map((o) => o.trim()).filter(Boolean)
  const duplicate = new Set(filled).size !== filled.length
  const invalid = !ready || !question.trim() || filled.length < 2 || duplicate || (quiz && !options[correct]?.trim())

  const send = async () => {
    setConfirming(false)
    setBusy(true)
    try {
      const r = await apiPost<{ link: string; pinError: string | null }>('action', {
        action: 'channel.poll',
        question,
        options: filled,
        multiple: !quiz && multiple,
        quiz,
        // To'g'ri javob — to'ldirilgan variantlar ichidagi tartibi
        correct: quiz ? filled.indexOf(options[correct].trim()) : undefined,
        explanation: quiz ? explanation : '',
        silent,
        pin: pin && canPin,
      })
      onInfo(r.pinError ? `So‘rovnoma joylandi, lekin qadalmadi: ${r.pinError}` : 'So‘rovnoma kanalga joylandi')
      onDone(r.link)
      setQuestion('')
      setOptions(['', ''])
      setExplanation('')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Joylab bo‘lmadi')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="adm-card p-4 sm:p-5">
      <label className="adm-label" htmlFor="poll-q">Savol</label>
      <input
        id="poll-q"
        className="adm-input"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Qaysi ta’mdagi muzqaymoqni qo‘shaylik?"
        maxLength={300}
        disabled={busy}
      />

      <p className="adm-label mt-4">Javob variantlari <span style={{ color: 'var(--faint)' }}>(2–10)</span></p>
      <div className="flex flex-col gap-2">
        {options.map((option, index) => (
          <div key={index} className="flex items-center gap-2">
            {quiz && (
              <input
                type="radio"
                name="poll-correct"
                className="size-4 shrink-0"
                checked={correct === index}
                onChange={() => setCorrect(index)}
                aria-label={`${index + 1}-variant to‘g‘ri javob`}
              />
            )}
            <input
              className="adm-input flex-1"
              value={option}
              onChange={(e) => setOptions(options.map((o, i) => (i === index ? e.target.value : o)))}
              placeholder={`${index + 1}-variant`}
              maxLength={100}
              disabled={busy}
            />
            {options.length > 2 && (
              <button
                type="button"
                className="adm-icon-btn adm-icon-btn--danger"
                onClick={() => {
                  setOptions(options.filter((_, i) => i !== index))
                  if (correct >= index && correct > 0) setCorrect(correct - 1)
                }}
                aria-label="Variantni o‘chirish"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
        {options.length < 10 && (
          <button type="button" className="adm-btn adm-btn--ghost self-start" onClick={() => setOptions([...options, ''])} disabled={busy}>
            <Plus size={16} /> Variant qo‘shish
          </button>
        )}
        {duplicate && <p className="text-xs" style={{ color: 'var(--danger)' }}>Variantlar takrorlanmasin</p>}
      </div>

      <div className="adm-ch-opts mt-4">
        <Toggle checked={quiz} onChange={setQuiz} icon={<CheckCircle2 size={15} />} label="Viktorina" hint="Bitta to‘g‘ri javob — tanlagan zahoti ko‘rsatiladi" />
        <Toggle checked={multiple && !quiz} onChange={setMultiple} icon={<BarChart3 size={15} />} label="Bir nechta javob" hint="Obunachi bir nechta variantni belgilay oladi" disabled={quiz} />
        <Toggle checked={silent} onChange={setSilent} icon={<BellOff size={15} />} label="Ovozsiz" hint="Tovushsiz bildirishnoma" />
        <Toggle checked={pin} onChange={setPin} icon={<Pin size={15} />} label="Kanalda qadash" hint={canPin ? 'Tepada turadi' : 'Botda «Tahrirlash» huquqi kerak'} disabled={!canPin} />
      </div>
      {quiz && (
        <>
          <label className="adm-label mt-4" htmlFor="poll-exp">Izoh <span style={{ color: 'var(--faint)' }}>(xato javob berganda ko‘rinadi)</span></label>
          <input id="poll-exp" className="adm-input" value={explanation} onChange={(e) => setExplanation(e.target.value)} maxLength={200} disabled={busy} />
          <p className="mt-1.5 text-xs" style={{ color: 'var(--muted)' }}>To‘g‘ri javobni chapdagi doirachadan belgilang.</p>
        </>
      )}
      <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
        Kanalda so‘rovnoma doim anonim. Natijalar pastdagi «Oxirgi e’lonlar» da jonli ko‘rinadi.
      </p>

      <button className="adm-btn adm-btn--primary mt-4 w-full py-3" onClick={() => setConfirming(true)} disabled={invalid || busy}>
        {busy ? <Loader2 size={17} className="animate-spin" /> : <BarChart3 size={17} />}
        {ready ? 'So‘rovnomani joylash' : 'Kanal ulanmagan'}
      </button>
      {confirming && (
        <ConfirmDialog
          title="So‘rovnoma joylansinmi?"
          message={`«${question.trim()}» — ${filled.length} ta variant bilan kanalga joylanadi.`}
          confirmLabel="Ha, joylansin"
          onConfirm={send}
          onClose={() => setConfirming(false)}
        />
      )}
    </section>
  )
}

// ─── Ulanish kartasi ──────────────────────────────────────────

function ConnectionCard({
  status, loading, changing, chatInput, connecting,
  onInput, onConnect, onRefresh, onChange, onCancelChange, onDisconnect,
}: {
  status: Status | null
  loading: boolean
  changing: boolean
  chatInput: string
  connecting: boolean
  onInput: (value: string) => void
  onConnect: (chat: string) => void
  onRefresh: () => void
  onChange: () => void
  onCancelChange: () => void
  onDisconnect: () => void
}) {
  if (loading && !status) {
    return (
      <section className="adm-card adm-ch-status flex items-center gap-3 p-4">
        <Loader2 size={18} className="animate-spin" style={{ color: 'var(--muted)' }} />
        <span className="text-sm" style={{ color: 'var(--muted)' }}>Kanal holati tekshirilmoqda…</span>
      </section>
    )
  }

  const channel = status?.channel
  const rights = status?.rights
  const botName = status?.bot?.username ? `@${status.bot.username}` : 'botni'
  const healthy = Boolean(status?.connected && rights?.canPost && !status.problem)

  if (status?.connected && channel && !changing) {
    return (
      <section className={'adm-card adm-ch-status p-4 ' + (healthy ? 'is-ok' : 'is-bad')}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="adm-ch-avatar">{(channel.title || '?').trim().charAt(0).toUpperCase()}</span>
          <div className="min-w-[200px] flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-extrabold">{channel.title || 'Kanal'}</h2>
              <span className={'adm-ch-state ' + (healthy ? 'is-ok' : 'is-bad')}>
                <span className="adm-ch-state__dot" /> {healthy ? 'Ulangan' : 'Muammo bor'}
              </span>
            </div>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
              {channel.username ? `@${channel.username}` : 'Yopiq kanal'}
              {channel.members !== null && ` · ${channel.members.toLocaleString('ru-RU')} obunachi`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="adm-btn adm-btn--ghost" onClick={onRefresh} disabled={loading}>
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Tekshirish
            </button>
            {channel.link && (
              <a className="adm-btn adm-btn--ghost" href={channel.link} target="_blank" rel="noreferrer">
                <ExternalLink size={15} /> Ochish
              </a>
            )}
            <button type="button" className="adm-btn adm-btn--ghost" onClick={onChange}>
              <PlugZap size={15} /> Boshqa kanal
            </button>
            <button type="button" className="adm-icon-btn adm-icon-btn--danger" onClick={onDisconnect} aria-label="Kanalni uzish" title="Uzish">
              <Unplug size={15} />
            </button>
          </div>
        </div>

        {rights && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Right ok={rights.isAdmin} label="Bot admin" />
            <Right ok={rights.canPost} label="Post joylash" />
            <Right ok={rights.canEdit} label="Qadash / tahrirlash" optional />
            <Right ok={rights.canDelete} label="O‘chirish" optional />
          </div>
        )}
        {status.problem && (
          <p className="adm-ch-problem">
            <AlertTriangle size={15} /> {status.problem}. Kanal sozlamalari → Administratorlar → {botName} → «Xabar joylash» ni yoqing.
          </p>
        )}
      </section>
    )
  }

  const candidates = status?.candidates ?? []
  return (
    <section className="adm-card adm-ch-status p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-extrabold">{changing ? 'Boshqa kanalni ulash' : 'Kanalni ulash'}</h2>
        {!changing && <span className="adm-ch-state is-off"><span className="adm-ch-state__dot" /> Ulanmagan</span>}
        {changing && (
          <button type="button" className="adm-link ml-auto text-sm" onClick={onCancelChange}>Bekor qilish</button>
        )}
      </div>
      <ol className="adm-ch-steps">
        <li>Telegram’da kanal sozlamalari → <b>Administratorlar</b> → <b>{botName}</b> ni qo‘shing.</li>
        <li><b>«Xabar joylash»</b> huquqini yoqing (qadash va tahrirlash uchun <b>«Tahrirlash»</b>, o‘chirish uchun <b>«O‘chirish»</b> ham).</li>
        <li>Kanal manzilini yozing yoki bot topgan kanallardan tanlang.</li>
      </ol>
      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => { e.preventDefault(); if (chatInput.trim()) onConnect(chatInput) }}
      >
        <input
          className="adm-input flex-1"
          value={chatInput}
          onChange={(e) => onInput(e.target.value)}
          placeholder="@musa_uz, t.me/musa_uz yoki -100…"
          disabled={connecting}
          aria-label="Kanal manzili"
        />
        <button type="submit" className="adm-btn adm-btn--primary" disabled={connecting || !chatInput.trim()}>
          {connecting ? <Loader2 size={16} className="animate-spin" /> : <PlugZap size={16} />} Ulash
        </button>
      </form>
      {candidates.length > 0 && (
        <>
          <p className="adm-bc-sub">Bot admin bo‘lgan kanallar:</p>
          <div className="flex flex-wrap gap-2">
            {candidates.map((c) => (
              <button
                key={c.chatId}
                type="button"
                className="adm-chip inline-flex items-center gap-1.5"
                onClick={() => onConnect(String(c.chatId))}
                disabled={connecting}
              >
                <Megaphone size={13} /> {c.title || c.username || c.chatId}
              </button>
            ))}
          </div>
        </>
      )}
      {status?.problem && <p className="adm-ch-problem"><AlertTriangle size={15} /> {status.problem}</p>}
    </section>
  )
}

function Right({ ok, label, optional }: { ok: boolean; label: string; optional?: boolean }) {
  return (
    <span className={'adm-ch-right ' + (ok ? 'is-ok' : optional ? 'is-off' : 'is-bad')}>
      {ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />} {label}
    </span>
  )
}

// ─── Tarix ────────────────────────────────────────────────────

function History({
  posts, canDelete, canEdit, onReuse, onEdit, onDelete, onStopPoll,
}: {
  posts: Post[]
  canDelete: boolean
  canEdit: boolean
  onReuse: (post: Post) => void
  onEdit: (post: Post) => void
  onDelete: (post: Post) => void
  onStopPoll: (post: Post) => void
}) {
  return (
    <div className="adm-card p-4">
      <h2 className="text-sm font-extrabold">Oxirgi e’lonlar</h2>
      {posts.length === 0 ? (
        <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>Hali e’lon joylanmagan.</p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {posts.map((post) => (
            <li key={post.id} className={'adm-ch-post ' + (post.deleted ? 'is-deleted' : '')}>
              <span className="adm-ch-post__thumb">
                {post.media?.type === 'image'
                  ? <img src={post.media.url} alt="" loading="lazy" />
                  : post.type === 'poll' ? <BarChart3 size={16} />
                    : post.media?.type === 'video' ? <Film size={16} /> : <Megaphone size={16} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="adm-ch-post__text">{post.poll?.question ?? (post.snippet || (post.media ? 'Rasm/video' : '—'))}</p>
                {post.poll && <PollResults poll={post.poll} />}
                <p className="adm-ch-post__meta">
                  {formatWhen(post.at)} · {post.by}
                  {post.editedAt && ' · tahrirlangan'}
                  {post.pinned && <span title="Qadalgan"> · <Pin size={11} /></span>}
                  {post.silent && <span title="Ovozsiz"> · <BellOff size={11} /></span>}
                  {post.customers > 0 && <span title="Mijozlarga ham"> · <Users size={11} /> {post.customers}</span>}
                  {post.deleted && ' · o‘chirilgan'}
                </p>
                {post.type !== 'poll' && <StatsLine stats={post.stats ?? null} />}
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1">
                {post.poll && !post.poll.closed && !post.deleted && (
                  <button type="button" className="adm-icon-btn" onClick={() => onStopPoll(post)} aria-label="So‘rovnomani yakunlash" title="Yakunlash">
                    <Square size={13} />
                  </button>
                )}
                {post.draft && (
                  <button type="button" className="adm-icon-btn" onClick={() => onReuse(post)} aria-label="Takrorlash" title="Muharrirga yuklash">
                    <Copy size={14} />
                  </button>
                )}
                {post.draft && !post.deleted && canEdit && post.type !== 'poll' && (
                  <button type="button" className="adm-icon-btn" onClick={() => onEdit(post)} aria-label="Tahrirlash" title="Kanaldagi e’lonni tahrirlash">
                    <Pencil size={14} />
                  </button>
                )}
                {!post.deleted && (
                  <a className="adm-icon-btn" href={post.link} target="_blank" rel="noreferrer" aria-label="Kanalda ochish" title="Kanalda ochish">
                    <ExternalLink size={14} />
                  </a>
                )}
                {!post.deleted && canDelete && (
                  <button type="button" className="adm-icon-btn adm-icon-btn--danger" onClick={() => onDelete(post)} aria-label="Kanaldan o‘chirish" title="Kanaldan o‘chirish">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PollResults({ poll }: { poll: PollState }) {
  const total = Math.max(1, poll.total)
  return (
    <div className="adm-poll">
      {poll.options.map((o, i) => {
        const pct = Math.round((o.voters / total) * 100)
        return (
          <div key={i} className={'adm-poll__row' + (poll.quiz && poll.correct === i ? ' is-correct' : '')}>
            <span className="adm-poll__bar" style={{ width: `${poll.total ? pct : 0}%` }} />
            <span className="adm-poll__text">{o.text}</span>
            <span className="adm-poll__pct">{pct}%</span>
          </div>
        )
      })}
      <p className="adm-ch-post__meta">{poll.total} ta ovoz{poll.closed ? ' · yakunlangan' : ' · davom etmoqda'}</p>
    </div>
  )
}

// ─── Kichik qismlar ───────────────────────────────────────────

function Toggle({
  checked, onChange, label, hint, icon, disabled,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  hint?: string
  icon?: React.ReactNode
  disabled?: boolean
}) {
  return (
    <label className={'adm-ch-toggle ' + (disabled ? 'is-disabled' : '')}>
      {icon && <span className="adm-ch-toggle__icon">{icon}</span>}
      <span className="min-w-0 flex-1">
        <b>{label}</b>
        {hint && <span>{hint}</span>}
      </span>
      <input
        type="checkbox"
        className="adm-ch-switch"
        checked={checked && !disabled}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
    </label>
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
