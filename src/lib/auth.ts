import { getAuth, signInWithCustomToken, onAuthStateChanged, type User } from 'firebase/auth'
import { app } from './firebase'
import { getTelegram } from '../utils/telegram'

export const auth = getAuth(app)

/**
 * Telegram initData ni serverga yuborib, Firebase Custom Token oladi
 * va shu bilan tizimga kiradi. Shundan keyin Firestore Rules'da
 * request.auth.uid — ishonchli Telegram id'si (F-02).
 *
 * Bir seansda faqat bir marta bajariladi.
 */
let signInPromise: Promise<User | null> | null = null

export function ensureSignedIn(): Promise<User | null> {
  if (signInPromise) return signInPromise

  signInPromise = (async () => {
    if (auth.currentUser) return auth.currentUser

    const initData = getTelegram()?.initData
    if (!initData) {
      // Telegram tashqarisida (dev brauzeri) shaxsiy bo'limlar ishlamaydi
      console.warn('[Auth] initData yo‘q — faqat ochiq katalog mavjud')
      return null
    }

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
      })

      if (!response.ok) {
        const detail = await response.json().catch(() => ({}))
        throw new Error(detail.error || `HTTP ${response.status}`)
      }

      const { token } = (await response.json()) as { token: string }
      const credential = await signInWithCustomToken(auth, token)
      return credential.user
    } catch (error) {
      console.error('[Auth] tizimga kirib bo‘lmadi:', error)
      // Keyingi urinishga yo'l ochamiz
      signInPromise = null
      return null
    }
  })()

  return signInPromise
}

/** Joriy foydalanuvchining ID tokeni — API so'rovlari uchun. */
export async function getIdToken(): Promise<string | null> {
  const user = auth.currentUser ?? (await ensureSignedIn())
  if (!user) return null
  return user.getIdToken()
}

export function onAuthChanged(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback)
}
