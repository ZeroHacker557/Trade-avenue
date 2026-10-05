import {
  ArrowDown, ArrowUp, Clapperboard, ImagePlus, Layers, Link2, Loader2, Package, Save, Tag, Trash2, Video,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { apiPost } from '../lib/api'
import { useCategories, useProducts, useSections, useSplashAd } from '../lib/live'
import { uploadAdMedia } from '../lib/storage'
import { useToast } from '../components/Toast'
import { SplashAdView } from '../../components/promo/SplashAdView'
import {
  AD_LIMITS, ALL_CATEGORIES, isSafeUrl, type AdFrequency, type AdLink, type AdSlide, type SplashAd,
} from '../../utils/splash-ad'

type LinkKind = AdLink['kind']

/** Tahrirlash shakli: tugma matni yozilayotganda havola hali to'liq bo'lmasligi mumkin. */
type SlideDraft = {
  id: string
  type: 'image' | 'video'
  url: string
  seconds: number
  buttonText: string
  buttonTextRu: string
  linkKind: LinkKind
  linkUrl: string
  category: string
  sectionId: string
  productId: string
}

type Draft = { active: boolean; frequency: AdFrequency; slides: SlideDraft[] }

const FREQUENCIES: { key: AdFrequency; label: string; hint: string }[] = [
  { key: 'daily', label: 'Kuniga bir marta', hint: 'Tavsiya — mijozni zeriktirmaydi' },
  { key: 'always', label: 'Har ochilganda', hint: 'Qisqa muddatli aksiya uchun' },
  { key: 'once', label: 'Faqat bir marta', hint: 'Reklama o‘zgartirilsa yana bir marta' },
]

const LINK_KINDS: { key: LinkKind; label: string; icon: typeof Link2 }[] = [
  { key: 'category', label: 'Kategoriya', icon: Tag },
  { key: 'section', label: 'Bo‘lim', icon: Layers },
  { key: 'product', label: 'Mahsulot', icon: Package },
  { key: 'url', label: 'Havola', icon: Link2 },
]

const PREVIEW_LABELS = {
  skip: 'O‘tkazib yuborish', close: 'Yopish',
  mute: 'Ovozni o‘chirish', unmute: 'Ovozni yoqish',
}

function toDraft(ad: SplashAd): Draft {
  return {
    active: ad.active,
    frequency: ad.frequency,
    slides: ad.slides.map((s) => ({
      id: s.id,
      type: s.type,
      url: s.url,
      seconds: s.seconds,
      buttonText: s.button?.text ?? '',
      buttonTextRu: s.button?.textRu ?? '',
      linkKind: s.button?.link.kind ?? 'category',
      linkUrl: s.button?.link.kind === 'url' ? s.button.link.url : '',
      category: s.button?.link.kind === 'category' ? s.button.link.category : '',
      sectionId: s.button?.link.kind === 'section' ? s.button.link.sectionId : '',
      productId: s.button?.link.kind === 'product' ? s.button.link.productId : '',
    })),
  }
}

function linkOf(s: SlideDraft): AdLink {
  if (s.linkKind === 'url') return { kind: 'url', url: s.linkUrl.trim() }
  if (s.linkKind === 'product') return { kind: 'product', productId: s.productId }
  if (s.linkKind === 'section') return { kind: 'section', sectionId: s.sectionId }
  return { kind: 'category', category: s.category }
}

/** Saqlashdan oldin: tugma yozilgan bo'lsa, havola to'liqmi. */
function problemOf(s: SlideDraft, no: number): string | null {
  if (!s.buttonText.trim()) return null
  if (s.linkKind === 'url' && !isSafeUrl(s.linkUrl.trim())) return `${no}-slayd: havola https:// bilan boshlansin`
  if (s.linkKind === 'category' && !s.category) return `${no}-slayd: tugma uchun kategoriyani tanlang`
  if (s.linkKind === 'product' && !s.productId) return `${no}-slayd: tugma uchun mahsulotni tanlang`
  if (s.linkKind === 'section' && !s.sectionId) return `${no}-slayd: tugma uchun bo‘limni tanlang`
  return null
}

/**
 * «Reklama banneri» — mijoz ilovasi ochilganda butun ekranni egallaydigan
 * slaydlar (rasm yoki video), har birida ixtiyoriy tugma.
 *
 * O'ngda telefon ko'rinishi — mijoz aynan shuni ko'radi: ilovadagi
 * komponentning o'zi (SplashAdView), nusxasi emas.
 */
export function AdsPage() {
  const { ad, loading, error } = useSplashAd()
  const { categories } = useCategories()
  const { sections } = useSections()
  const { products } = useProducts()
  const { show, node: toast } = useToast()

  const [draft, setDraft] = useState<Draft | null>(null)
  const [baseline, setBaseline] = useState('')
  const [selected, setSelected] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [previewKey, setPreviewKey] = useState(0)

  // Bazadagi holat shaklga faqat saqlanmagan tahrir YO'Q bo'lsa olinadi:
  // boshqa admin saqlasa ham, bu admin yozib turgan narsa yo'qolmasin.
  const draftRef = useRef<Draft | null>(null)
  const baselineRef = useRef('')
  useEffect(() => { draftRef.current = draft })
  useEffect(() => {
    if (loading) return
    const current = draftRef.current
    if (current !== null && JSON.stringify(current) !== baselineRef.current) return
    const next = toDraft(ad)
    baselineRef.current = JSON.stringify(next)
    setBaseline(baselineRef.current)
    setDraft(next)
  }, [ad, loading])

  const dirty = draft !== null && JSON.stringify(draft) !== baseline

  const previewAd = useMemo<SplashAd>(() => ({
    active: true,
    frequency: 'always',
    version: '',
    slides: (draft?.slides ?? []).map((s): AdSlide => ({
      id: s.id,
      type: s.type,
      url: s.url,
      seconds: s.seconds,
      button: s.buttonText.trim()
        ? {
            text: s.buttonText.trim(),
            textRu: s.buttonTextRu.trim(),
            link: linkOf(s),
          }
        : null,
    })),
  }), [draft])

  const sortedProducts = useMemo(
    () => [...products].sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''))),
    [products],
  )

  if (loading || !draft) {
    return <div className="adm-skeleton h-96" />
  }

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d))
  const setSlide = (i: number, patch: Partial<SlideDraft>) =>
    setDraft((d) => (d ? { ...d, slides: d.slides.map((s, j) => (j === i ? { ...s, ...patch } : s)) } : d))

  const move = (i: number, by: number) => {
    const j = i + by
    if (j < 0 || j >= draft.slides.length) return
    const slides = [...draft.slides]
    ;[slides[i], slides[j]] = [slides[j], slides[i]]
    set({ slides })
    setSelected(j)
  }

  const remove = (i: number) => {
    const slides = draft.slides.filter((_, j) => j !== i)
    set({ slides, active: slides.length ? draft.active : false })
    setSelected((current) => Math.max(0, Math.min(current, slides.length - 1)))
  }

  const addFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    const room = AD_LIMITS.maxSlides - draft.slides.length
    if (!files.length || room <= 0) return
    if (files.length > room) show(`Ko‘pi bilan ${AD_LIMITS.maxSlides} ta slayd — ${room} tasi qo‘shiladi`, 'error')

    setUploading(true)
    let added = 0
    try {
      for (const file of files.slice(0, room)) {
        const media = await uploadAdMedia(file)
        const slide: SlideDraft = {
          id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          type: media.type,
          url: media.url,
          seconds: AD_LIMITS.defaultSeconds,
          buttonText: '',
          buttonTextRu: '',
          linkKind: 'category',
          linkUrl: '',
          category: '',
          sectionId: '',
          productId: '',
        }
        // Har fayl yuklanishi bilan qo'shiladi — keyingisi xato bersa ham
        // oldingilari yo'qolmaydi
        // Bo'sh reklamaga birinchi slayd qo'shilsa — o'zi yoqiladi. Ilgari
        // o'chiq qolib ketardi: admin slayd qo'shib saqlardi, mijozga esa
        // hech narsa chiqmasdi va sababi ko'rinmasdi.
        setDraft((d) => (d ? { ...d, active: d.slides.length === 0 ? true : d.active, slides: [...d.slides, slide] } : d))
        setSelected(draft.slides.length + added)
        added++
      }
      show(added > 1 ? `${added} ta slayd qo‘shildi — «Saqlash» ni bosing` : 'Slayd qo‘shildi — «Saqlash» ni bosing')
    } catch (err) {
      const code = (err as { code?: string }).code
      show(
        code === 'storage/unauthorized'
          ? 'Yuklashga ruxsat yo‘q: Firebase Console → Storage → Rules ga loyihadagi storage.rules ni qo‘yib, Publish bosing'
          : err instanceof Error ? err.message : 'Yuklab bo‘lmadi',
        'error',
      )
    } finally {
      setUploading(false)
    }
  }

  const save = async () => {
    const problem = draft.slides.map((s, i) => problemOf(s, i + 1)).find(Boolean)
    if (problem) return show(problem, 'error')
    if (draft.active && !draft.slides.length) return show('Reklamani yoqish uchun kamida bitta slayd qo‘shing', 'error')

    setSaving(true)
    try {
      await apiPost('action', {
        action: 'ad.save',
        active: draft.active,
        frequency: draft.frequency,
        slides: previewAd.slides,
      })
      baselineRef.current = JSON.stringify(draft)
      setBaseline(baselineRef.current)
      if (draft.active) show('Saqlandi — mijozlar ilovani ochganda ko‘radi')
      else if (draft.slides.length) show('Saqlandi, lekin reklama O‘CHIRILGAN — mijozlarga chiqmaydi. «Reklamani yoqish» belgisini qo‘yib, qayta saqlang', 'error')
      else show('Saqlandi')
    } catch (err) {
      show(err instanceof Error ? err.message : 'Saqlanmadi', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="adm-page-head">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Mijoz ilovani ochganda butun ekranda chiqadi. 2–3 ta slayd — eng yaxshisi.
        </p>
        <div className="adm-page-head__actions">
          <button className="adm-btn adm-btn--primary" onClick={save} disabled={saving || uploading || !dirty}>
            {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
            {dirty ? 'Saqlash' : 'Saqlangan'}
          </button>
        </div>
      </div>

      {error && (
        <div className="adm-card mb-4 p-4" style={{ borderColor: 'var(--danger)', background: 'var(--danger-soft)' }}>
          <p className="text-sm font-extrabold" style={{ color: 'var(--danger)' }}>
            Reklama bazadan o‘qilmayapti
          </p>
          <p className="mt-1 text-sm">
            {error === 'rules'
              ? 'Firebase qoidalari hali yangilanmagan. Firebase Console → Firestore → Rules ga loyihadagi firestore.rules, Storage → Rules ga storage.rules faylini to‘liq qo‘yib, ikkalasida ham Publish bosing. Shu paytgacha mijozlarga reklama chiqmaydi.'
              : 'Internetni tekshirib, sahifani yangilang.'}
          </p>
        </div>
      )}

      <div className="adm-ads">
        <div className="grid min-w-0 gap-4">
          {/* ── Holat ── */}
          <section className="adm-card p-4">
            <label
              className="flex cursor-pointer items-center gap-3 rounded-xl border p-3"
              style={{
                borderColor: draft.active ? 'var(--brand)' : draft.slides.length ? 'var(--warning)' : 'var(--line)',
                background: draft.active ? 'var(--brand-soft)' : draft.slides.length ? 'var(--warning-soft)' : 'var(--surface)',
              }}
            >
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => set({ active: e.target.checked })}
                style={{ width: 18, height: 18, accentColor: 'var(--brand)' }}
              />
              <Clapperboard size={18} style={{ color: draft.active ? 'var(--brand-strong)' : 'var(--muted)' }} />
              <span className="min-w-0">
                <b className="block text-sm">
                  {draft.active ? 'Reklama yoqilgan — mijozlarga chiqadi' : 'Reklamani yoqish'}
                </b>
                <span
                  className="block text-xs"
                  style={{ color: !draft.active && draft.slides.length ? 'var(--warning)' : 'var(--muted)', fontWeight: !draft.active && draft.slides.length ? 700 : 400 }}
                >
                  {draft.active
                    ? 'Belgini olib tashlasangiz slaydlar saqlanib qoladi, faqat mijozlarga chiqmaydi'
                    : draft.slides.length
                      ? 'Hozir o‘chiq — mijozlarga CHIQMAYDI. Belgini qo‘yib, «Saqlash» ni bosing'
                      : 'Slayd qo‘shilganda o‘zi yoqiladi'}
                </span>
              </span>
            </label>

            <p className="adm-label mt-4">Qanchalik tez-tez chiqadi</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {FREQUENCIES.map((f) => (
                <button
                  key={f.key}
                  className={'adm-pick text-left ' + (draft.frequency === f.key ? 'is-on' : '')}
                  onClick={() => set({ frequency: f.key })}
                >
                  <span className="min-w-0">
                    <b className="block text-sm">{f.label}</b>
                    <span className="block text-xs" style={{ color: 'var(--muted)' }}>{f.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* ── Slaydlar ── */}
          <section className="adm-card p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-extrabold">
                Slaydlar <span style={{ color: 'var(--muted)' }}>{draft.slides.length}/{AD_LIMITS.maxSlides}</span>
              </h3>
            </div>

            <div className="grid gap-3">
              {draft.slides.map((slide, i) => (
                <article
                  key={slide.id}
                  className={'adm-ad-slide ' + (selected === i ? 'is-selected' : '')}
                  onClick={() => setSelected(i)}
                >
                  <div className="adm-ad-slide__media">
                    {slide.type === 'image'
                      ? <img src={slide.url} alt="" />
                      : <video src={slide.url} muted playsInline preload="metadata" />}
                    <span className="adm-ad-slide__no">{i + 1}</span>
                    {slide.type === 'video' && <span className="adm-ad-slide__type"><Video size={12} /></span>}
                  </div>

                  <div className="grid min-w-0 gap-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <b className="text-sm">{i + 1}-slayd · {slide.type === 'image' ? 'Rasm' : 'Video'}</b>
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <button className="adm-icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Yuqoriga">
                          <ArrowUp size={15} />
                        </button>
                        <button className="adm-icon-btn" onClick={() => move(i, 1)} disabled={i === draft.slides.length - 1} aria-label="Pastga">
                          <ArrowDown size={15} />
                        </button>
                        <button className="adm-icon-btn adm-icon-btn--danger" onClick={() => remove(i)} aria-label="Slaydni o‘chirish">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    {slide.type === 'image' ? (
                      <div>
                        <label className="adm-label">Ekranda turadi</label>
                        <select
                          className="adm-input"
                          value={slide.seconds}
                          onChange={(e) => setSlide(i, { seconds: Number(e.target.value) })}
                        >
                          {Array.from({ length: AD_LIMITS.maxSeconds - AD_LIMITS.minSeconds + 1 }, (_, k) => k + AD_LIMITS.minSeconds).map((n) => (
                            <option key={n} value={n}>{n} soniya</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>
                        Video o‘z uzunligicha o‘ynaydi ({AD_LIMITS.maxVideoSeconds} soniyagacha), ovozsiz boshlanadi.
                      </p>
                    )}

                    <div>
                      <label className="adm-label">Tugma matni (ixtiyoriy)</label>
                      <input
                        className="adm-input"
                        value={slide.buttonText}
                        maxLength={AD_LIMITS.buttonText}
                        placeholder="Masalan: Hoziroq buyurtma bering"
                        onChange={(e) => setSlide(i, { buttonText: e.target.value })}
                      />
                    </div>

                    {slide.buttonText.trim() && (
                      <div>
                        <label className="adm-label">Tugma matni (ruscha)</label>
                        <input
                          className="adm-input"
                          value={slide.buttonTextRu}
                          maxLength={AD_LIMITS.buttonText}
                          placeholder="Bo‘sh qoldirsangiz o‘zbekchasi ko‘rinadi"
                          onChange={(e) => setSlide(i, { buttonTextRu: e.target.value })}
                        />
                      </div>
                    )}

                    {slide.buttonText.trim() && (
                      <div className="grid gap-2">
                        <div className="flex flex-wrap gap-1.5">
                          {LINK_KINDS.map(({ key, label, icon: Icon }) => (
                            <button
                              key={key}
                              className={'adm-chip inline-flex items-center gap-1.5 ' + (slide.linkKind === key ? 'active' : '')}
                              onClick={() => setSlide(i, { linkKind: key })}
                            >
                              <Icon size={13} /> {label}
                            </button>
                          ))}
                        </div>

                        {slide.linkKind === 'category' && (
                          <select className="adm-input" value={slide.category} onChange={(e) => setSlide(i, { category: e.target.value })}>
                            <option value="">Kategoriyani tanlang…</option>
                            <option value={ALL_CATEGORIES}>Barchasi — butun katalog</option>
                            {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                          </select>
                        )}
                        {slide.linkKind === 'section' && (
                          <select className="adm-input" value={slide.sectionId} onChange={(e) => setSlide(i, { sectionId: e.target.value })}>
                            <option value="">Bo‘limni tanlang…</option>
                            {/* Kategoriya bo'yicha guruhlangan — bir xil nomli bo'limlar adashmasin */}
                            {categories.map((c) => {
                              const list = sections.filter((s) => s.category === c.name)
                              return list.length ? (
                                <optgroup key={c.id} label={c.name}>
                                  {list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </optgroup>
                              ) : null
                            })}
                          </select>
                        )}
                        {slide.linkKind === 'product' && (
                          <select className="adm-input" value={slide.productId} onChange={(e) => setSlide(i, { productId: e.target.value })}>
                            <option value="">Mahsulotni tanlang…</option>
                            {sortedProducts.map((p) => <option key={p.docId} value={String(p.id)}>{p.name}</option>)}
                          </select>
                        )}
                        {slide.linkKind === 'url' && (
                          <input
                            className="adm-input"
                            value={slide.linkUrl}
                            inputMode="url"
                            placeholder="https://t.me/kanal yoki https://sayt.uz"
                            onChange={(e) => setSlide(i, { linkUrl: e.target.value })}
                          />
                        )}
                        <p className="text-xs" style={{ color: 'var(--faint)' }}>
                          {slide.linkKind === 'url'
                            ? 'Telegram havolasi Telegram ichida, boshqasi brauzerda ochiladi.'
                            : slide.linkKind === 'section'
                              ? 'Tugma bosilganda katalog shu bo‘lim turgan kategoriyada ochilib, bo‘limga o‘tadi.'
                              : 'Tugma bosilganda reklama yopilib, ilovaning o‘zida ochiladi.'}
                        </p>
                      </div>
                    )}
                  </div>
                </article>
              ))}

              {draft.slides.length < AD_LIMITS.maxSlides && (
                <label className={'adm-ad-add ' + (uploading ? 'is-busy' : '')}>
                  {uploading ? <Loader2 size={22} className="animate-spin" /> : <ImagePlus size={22} />}
                  <span className="text-sm font-bold">{uploading ? 'Yuklanmoqda…' : 'Rasm yoki video qo‘shish'}</span>
                  <span className="text-xs" style={{ color: 'var(--faint)' }}>
                    Ekranni to‘liq egallashi uchun: 1080×2340 (telefon ekrani). 9:16 ham bo‘ladi — kesilmaydi,
                    chetlari xira fon bilan to‘ldiriladi · Muhim yozuvni pastki qismga qo‘ymang, u yerda tugmalar
                    turadi · Video: MP4, 40 MB gacha
                  </span>
                  <input
                    type="file"
                    accept="image/*,video/mp4,video/webm,video/quicktime"
                    multiple
                    hidden
                    disabled={uploading}
                    onChange={addFiles}
                  />
                </label>
              )}
            </div>
          </section>
        </div>

        {/* ── Telefon ko'rinishi ── */}
        <aside className="adm-ads__preview">
          <p className="adm-label text-center">Mijoz shunday ko‘radi</p>
          <div className="adm-phone">
            {previewAd.slides.length ? (
              <SplashAdView
                // Slayd tanlansa yoki soni o'zgarsa — ko'rinish o'sha slayddan qaytadan
                key={`${previewKey}:${previewAd.slides.length}:${selected}`}
                ad={previewAd}
                labels={PREVIEW_LABELS}
                preview
                startIndex={selected}
                onClose={() => setPreviewKey((k) => k + 1)}
                onAction={() => {}}
              />
            ) : (
              <div className="adm-phone__empty">
                <Clapperboard size={30} />
                <p className="text-sm font-bold">Hali slayd yo‘q</p>
                <p className="text-xs">Chapdan rasm yoki video qo‘shing</p>
              </div>
            )}
          </div>
          <p className="mt-2 text-center text-xs" style={{ color: 'var(--faint)' }}>
            O‘ng tomonni bosing — keyingi, chap tomonni — oldingi slayd. Bosib turing — pauza
          </p>
        </aside>
      </div>

      {toast}
    </>
  )
}
