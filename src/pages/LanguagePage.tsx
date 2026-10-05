import { Check, ChevronLeft, Languages } from 'lucide-react'
import { LANGUAGES, useI18n, type Language } from '../i18n'
import { updateUserProfile } from '../lib/firebase'
import { hapticSelection, hapticSuccess } from '../utils/telegram'
import { auth } from '../lib/auth'
import { PageTitle } from '../components/layout/PageTitle'

type Props = {
  onBack: () => void
  onNotify: (msg: string) => void
}

export function LanguagePage({ onBack, onNotify }: Props) {
  const { lang, setLang, t } = useI18n()

  const choose = (next: Language) => {
    if (next === lang) return

    setLang(next)
    hapticSelection()

    // Tanlov qurilmalar orasida saqlanishi uchun profilga ham yozamiz
    const uid = auth.currentUser?.uid
    if (uid) {
      updateUserProfile(Number(uid), { language: next }).catch(() => {
        // Saqlanmasa ham ilova shu qurilmada tanlangan tilda ishlaydi
      })
    }

    hapticSuccess()
    onNotify(next === 'ru' ? 'Язык изменён' : "Til o'zgartirildi")
  }

  return (
    <>
      <header className="page-head page-head--solo flex items-center gap-3 px-5 pt-8 sm:px-10">
        <button onClick={onBack} className="back-button" aria-label={t('common.back')}>
          <ChevronLeft size={22} />
        </button>
        <PageTitle className="text-2xl font-extrabold">{t('profile.language')}</PageTitle>
      </header>

      <div className="px-5 pb-32 pt-6 sm:px-10 page-animate">
        <div
          className="mb-6 flex items-center gap-3 rounded-2xl border p-4"
          style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}
        >
          <span
            className="grid size-10 shrink-0 place-items-center rounded-xl"
            style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}
          >
            <Languages size={20} />
          </span>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>{t('language.title')}</p>
        </div>

        <div className="space-y-3">
          {LANGUAGES.map((option) => {
            const selected = option.code === lang
            return (
              <button
                key={option.code}
                onClick={() => choose(option.code)}
                className="flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition"
                style={{
                  borderColor: selected ? 'var(--brand)' : 'var(--line)',
                  background: selected ? 'var(--brand-soft)' : 'var(--surface)',
                }}
              >
                <span
                  className="grid size-11 shrink-0 place-items-center rounded-full text-sm font-extrabold uppercase"
                  style={{
                    background: selected ? 'var(--brand)' : 'var(--surface-3)',
                    color: selected ? 'var(--brand-ink)' : 'var(--muted)',
                  }}
                >
                  {option.code}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold" style={{ color: selected ? 'var(--brand)' : 'var(--ink)' }}>
                    {option.native}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>{t(option.label)}</p>
                </div>
                {selected && <Check size={20} style={{ color: 'var(--brand)' }} />}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
