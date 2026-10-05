import { WifiOff } from 'lucide-react'

/**
 * Serverga ulanib bo'lmaganda ko'rsatiladi.
 *
 * Bu RUXSAT masalasi emas — shuning uchun admin seansdan chiqarilmaydi:
 * tarmoq tiklangach «Qayta urinish» kifoya. Ilgari har qanday xato
 * «Ruxsat berilmadi» ekraniga olib borardi va qaytadan kirishga
 * to'g'ri kelardi.
 */
export function ConnectionError({ reason, onRetry, onLogout }: {
  reason: string
  onRetry: () => void
  onLogout: () => void
}) {
  return (
    <div className="adm-login">
      <div className="adm-login__card text-center">
        <span
          className="mx-auto grid size-14 place-items-center rounded-2xl"
          style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}
        >
          <WifiOff size={26} />
        </span>
        <h1 className="mt-4 text-lg font-extrabold">Ulanib bo‘lmadi</h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>{reason}</p>
        <p className="mt-1 text-xs" style={{ color: 'var(--faint)' }}>
          Seansingiz saqlanib turibdi — internet tiklangach davom ettiring.
        </p>
        <button className="adm-btn adm-btn--primary mt-5 w-full" onClick={onRetry}>
          Qayta urinish
        </button>
        <button className="adm-btn adm-btn--ghost mt-2 w-full" onClick={onLogout}>
          Hisobdan chiqish
        </button>
      </div>
    </div>
  )
}
