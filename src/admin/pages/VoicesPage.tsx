import { ArrowDown, ArrowUp, CalendarDays, Loader2, Music, Plus, Trash2, Volume2 } from 'lucide-react'
import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { apiPost } from '../lib/api'
import { useVoices } from '../lib/live'
import { ConfirmDialog } from '../components/Modal'
import { useToast } from '../components/Toast'
import { DEFAULT_VOICE, VOICE_MODES, voiceForDay, type VoiceItem, type VoiceMode } from '../../config/voices'
import { tashkentToday } from '../../utils/order-label'

/**
 * Kirish ovozlari: mini app ochilib intro tugagach asosiy sahifada chalinadi.
 * Ovoz yuklanadi, eshitib ko'riladi, qaysi kunlarda va qanchalik tez-tez
 * chalinishi belgilanadi. Server: api/_lib/actions/voices.ts.
 */

const MAX_BYTES = 3 * 1024 * 1024
const ACCEPT = 'audio/mpeg,audio/mp3,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,.mp3,.m4a,.aac,.wav'

/** «2026-10-01» → «01.10.2026». */
const dmy = (d: string | null) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : '')

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = () => reject(new Error('Faylni o‘qib bo‘lmadi'))
    reader.readAsDataURL(file)
  })
}

/** Brauzer ba'zan audio turini bermaydi — kengaytmadan aniqlaymiz. */
function audioType(file: File): string {
  if (file.type) return file.type
  const ext = file.name.split('.').pop()?.toLowerCase()
  return ext === 'mp3' ? 'audio/mpeg' : ext === 'm4a' ? 'audio/mp4' : ext === 'aac' ? 'audio/aac' : ext === 'wav' ? 'audio/wav' : ''
}

export function VoicesPage() {
  const { items, exists, loading } = useVoices()
  const { show, node: toast } = useToast()
  /** Saqlanmagan o'zgarishlar; null — bazadagi holat ko'rsatiladi. */
  const [draft, setDraft] = useState<VoiceItem[] | null>(null)
  const [busy, setBusy] = useState<'' | 'save' | 'upload'>('')
  const [removing, setRemoving] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Hali saqlanmagan bo'lsa — ilovadagi standart ovoz ro'yxatda birinchi turadi
  const saved = exists ? items : [DEFAULT_VOICE]
  const list = draft ?? saved
  const dirty = draft !== null
  const today = tashkentToday()
  const playingToday = useMemo(() => voiceForDay(list, today), [list, today])

  const edit = (index: number, patch: Partial<VoiceItem>) =>
    setDraft(list.map((v, i) => (i === index ? { ...v, ...patch } : v)))
  const move = (index: number, dir: -1 | 1) => {
    const next = [...list]
    const j = index + dir
    if (j < 0 || j >= next.length) return
    ;[next[index], next[j]] = [next[j], next[index]]
    setDraft(next)
  }

  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const contentType = audioType(file)
    if (!contentType.startsWith('audio/')) return show('Faqat ovoz fayli (MP3, M4A, WAV)', 'error')
    if (file.size > MAX_BYTES) return show('Ovoz fayli 3 MB dan oshmasin', 'error')
    setBusy('upload')
    try {
      const { url } = await apiPost<{ url: string }>('action', {
        action: 'voices.upload',
        name: file.name,
        contentType,
        data: await readBase64(file),
      })
      const item: VoiceItem = {
        id: `v${Date.now().toString(36)}`,
        name: file.name.replace(/\.[^.]+$/, '').slice(0, 80),
        url,
        active: true,
        from: null,
        to: null,
        mode: 'always',
      }
      setDraft([...list, item])
      show('Yuklandi — sozlab, «Saqlash» ni bosing')
    } catch (error) {
      show(error instanceof Error ? error.message : 'Yuklanmadi', 'error')
    } finally {
      setBusy('')
    }
  }

  const save = async () => {
    setBusy('save')
    try {
      await apiPost('action', { action: 'voices.save', items: list })
      setDraft(null)
      show('Saqlandi — mijozlar keyingi kirishida eshitadi')
    } catch (error) {
      show(error instanceof Error ? error.message : 'Saqlanmadi', 'error')
    } finally {
      setBusy('')
    }
  }

  if (loading) {
    return <div className="grid gap-3">{[0, 1].map((i) => <div key={i} className="adm-skeleton h-40" />)}</div>
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-4">
      <section className="adm-card flex flex-wrap items-center gap-3 p-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl" style={{ background: 'var(--brand-soft)', color: 'var(--brand-strong)' }}>
          <Volume2 size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold">
            Bugun: {playingToday ? <span style={{ color: 'var(--brand-strong)' }}>{playingToday.name}</span> : <span style={{ color: 'var(--muted)' }}>ovoz chalinmaydi</span>}
          </p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Ovoz faqat intro tugagach, asosiy sahifada chalinadi. Bir kunga bir nechtasi to‘g‘ri kelsa — sanasi aniqroq belgilangani, keyin ro‘yxatda yuqoridagisi.
          </p>
        </div>
        <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={(e) => void upload(e)} />
        <button className="adm-btn adm-btn--ghost" onClick={() => fileRef.current?.click()} disabled={!!busy}>
          {busy === 'upload' ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Ovoz yuklash
        </button>
      </section>

      {!exists && !dirty && (
        <p className="adm-hint">
          <Music size={16} />
          <span>Hozir ilova ichidagi standart ovoz chalinmoqda. Ro‘yxatni o‘zgartirib saqlasangiz — shu ro‘yxat ishlaydi.</span>
        </p>
      )}

      {list.length === 0 && (
        <div className="adm-card adm-empty">
          <Music size={30} />
          <p className="text-sm font-semibold">Ovoz yo‘q — mijozlar kirganda hech narsa chalinmaydi</p>
        </div>
      )}

      {list.map((voice, index) => {
        const isToday = playingToday?.id === voice.id
        const dated = Boolean(voice.from || voice.to)
        return (
          <article
            key={voice.id}
            className="adm-card grid gap-3 p-4"
            style={{
              opacity: voice.active ? 1 : 0.6,
              borderColor: isToday ? 'var(--brand)' : undefined,
              boxShadow: isToday ? '0 0 0 2px var(--brand-soft)' : undefined,
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="adm-input min-w-0 flex-1 font-bold"
                value={voice.name}
                maxLength={80}
                onChange={(e) => edit(index, { name: e.target.value })}
                aria-label="Ovoz nomi"
              />
              {isToday && (
                <span className="rounded-full px-2.5 py-1 text-xs font-extrabold" style={{ background: 'var(--brand)', color: 'var(--brand-ink)' }}>
                  Bugun chalinadi
                </span>
              )}
              <label className="flex items-center gap-2 text-sm font-bold">
                <input type="checkbox" className="adm-ch-switch" checked={voice.active} onChange={(e) => edit(index, { active: e.target.checked })} />
                {voice.active ? 'Yoqilgan' : 'O‘chirilgan'}
              </label>
            </div>

            {/* Eshitib ko'rish */}
            <audio controls preload="none" src={voice.url} className="w-full" />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <span className="adm-label m-0 flex items-center gap-1.5"><CalendarDays size={14} /> Qaysi kunlarda</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="adm-btn flex-1"
                    style={!dated ? { background: 'var(--brand)', color: 'var(--brand-ink)' } : { background: 'var(--surface-2)' }}
                    onClick={() => edit(index, { from: null, to: null })}
                  >
                    Har kuni
                  </button>
                  <button
                    type="button"
                    className="adm-btn flex-1"
                    style={dated ? { background: 'var(--brand)', color: 'var(--brand-ink)' } : { background: 'var(--surface-2)' }}
                    onClick={() => edit(index, { from: voice.from ?? today, to: voice.to ?? today })}
                  >
                    Sanadan sanagacha
                  </button>
                </div>
                {dated && (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      className="adm-input"
                      value={voice.from ?? ''}
                      onChange={(e) => edit(index, { from: e.target.value || null })}
                      aria-label="Boshlanish sanasi"
                    />
                    <span style={{ color: 'var(--muted)' }}>—</span>
                    <input
                      type="date"
                      className="adm-input"
                      value={voice.to ?? ''}
                      min={voice.from ?? undefined}
                      onChange={(e) => edit(index, { to: e.target.value || null })}
                      aria-label="Tugash sanasi"
                    />
                  </div>
                )}
                {dated && voice.from && voice.to && (
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    {voice.from === voice.to ? `Faqat ${dmy(voice.from)} kuni` : `${dmy(voice.from)} dan ${dmy(voice.to)} gacha`}
                  </span>
                )}
              </div>

              <label className="grid content-start gap-1.5">
                <span className="adm-label m-0">Qanchalik tez-tez</span>
                <select className="adm-input" value={voice.mode} onChange={(e) => edit(index, { mode: e.target.value as VoiceMode })}>
                  {VOICE_MODES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                </select>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  {voice.mode === 'always'
                    ? 'Mijoz botga har kirganda (fonga chiqib qaytganda ham)'
                    : voice.mode === 'daily'
                      ? 'Har mijozga kuniga bir marta'
                      : 'Har mijozga faqat bir marta — qayta eshitmaydi'}
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-1.5">
              <button className="grid size-8 place-items-center rounded-lg" style={{ background: 'var(--surface-2)' }} onClick={() => move(index, -1)} disabled={index === 0} aria-label="Yuqoriga">
                <ArrowUp size={15} />
              </button>
              <button className="grid size-8 place-items-center rounded-lg" style={{ background: 'var(--surface-2)' }} onClick={() => move(index, 1)} disabled={index === list.length - 1} aria-label="Pastga">
                <ArrowDown size={15} />
              </button>
              <button className="grid size-8 place-items-center rounded-lg" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }} onClick={() => setRemoving(index)} aria-label="O‘chirish">
                <Trash2 size={15} />
              </button>
            </div>
          </article>
        )
      })}

      <div className="flex flex-wrap items-center gap-2">
        <button className="adm-btn adm-btn--primary" onClick={() => void save()} disabled={!!busy || (!dirty && exists)}>
          {busy === 'save' ? <Loader2 size={16} className="animate-spin" /> : null} Saqlash
        </button>
        {dirty && (
          <>
            <button className="adm-btn adm-btn--ghost" onClick={() => setDraft(null)} disabled={!!busy}>Bekor qilish</button>
            <span className="text-xs font-bold" style={{ color: 'var(--warning)' }}>O‘zgarishlar hali saqlanmagan.</span>
          </>
        )}
      </div>

      {removing !== null && list[removing] && (
        <ConfirmDialog
          title="Ovozni olib tashlash"
          message={`«${list[removing].name}» ro‘yxatdan olib tashlanadi. «Saqlash» bosilgach kuchga kiradi.`}
          confirmLabel="Olib tashlash"
          onConfirm={() => {
            setDraft(list.filter((_, i) => i !== removing))
            setRemoving(null)
          }}
          onClose={() => setRemoving(null)}
        />
      )}
      {toast}
    </div>
  )
}
