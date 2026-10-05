import { useState } from 'react'
import { ChevronLeft, Phone, User, UserRound } from 'lucide-react'
import { updateUserProfile } from '../lib/firebase'
import { auth } from '../lib/auth'
import { getTelegramUser, hapticSuccess } from '../utils/telegram'
import { useT } from '../i18n'
import type { UserProfile } from '../types/domain'
import { PageTitle } from '../components/layout/PageTitle'

type Props = {
  profile: UserProfile | null
  onBack: () => void
  onNotify: (msg: string) => void
}

export function ProfileEditPage({ profile, onBack, onNotify }: Props) {
  const t = useT()
  const tgUser = getTelegramUser()
  const [firstName, setFirstName] = useState(profile?.first_name || tgUser?.first_name || '')
  const [lastName, setLastName] = useState(profile?.last_name || tgUser?.last_name || '')
  const [phone, setPhone] = useState(profile?.phone || '')
  const [loading, setLoading] = useState(false)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!firstName.trim() || !phone.trim()) {
      onNotify(t('profile.nameRequired'))
      return
    }

    const uid = auth.currentUser?.uid
    if (!uid) {
      onNotify(t('profile.userNotFound'))
      return
    }

    setLoading(true)
    try {
      await updateUserProfile(Number(uid), {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim(),
      })
      hapticSuccess()
      onNotify(t('profile.saved'))
      onBack()
    } catch (error) {
      console.error('[Profil] saqlanmadi:', error)
      onNotify(t('error.saveFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <header className="page-head page-head--solo flex items-center gap-3 px-5 pt-8 sm:px-10">
        <button onClick={onBack} className="back-button" aria-label={t('common.back')}>
          <ChevronLeft size={22} />
        </button>
        <PageTitle className="text-2xl font-extrabold">{t('profile.personal')}</PageTitle>
      </header>

      <form onSubmit={handleSave} className="kb-safe px-5 pt-6 sm:px-10 page-animate">
        <div className="space-y-5">
          <div>
            <label className="field-label">
              {t('profile.firstName')} <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <div className="field">
              <User size={19} className="shrink-0" style={{ color: 'var(--faint)' }} />
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
          </div>

          <div>
            <label className="field-label">{t('profile.lastName')}</label>
            <div className="field">
              <UserRound size={19} className="shrink-0" style={{ color: 'var(--faint)' }} />
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="field-label">
              {t('profile.phone')} <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <div className="field">
              <Phone size={19} className="shrink-0" style={{ color: 'var(--faint)' }} />
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+998 90 123 45 67"
                required
              />
            </div>
          </div>
        </div>

        <button type="submit" disabled={loading} className="btn-primary mt-8 w-full py-4">
          {loading ? t('common.saving') : t('common.save')}
        </button>
      </form>
    </>
  )
}
