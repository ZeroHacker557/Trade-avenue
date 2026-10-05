import { BrandLogo } from '../brand/BrandLogo'
import { BOT_URL, BRAND } from '../../config/brand'

/**
 * Ilova Telegram tashqarisida ochilganda ko'rsatiladi.
 * Bu yerda hech qanday Firestore so'rovi yuborilmaydi (F-06).
 *
 * I18nProvider'dan tashqarida ishlashi mumkin, shuning uchun
 * matn ikkala tilda ham beriladi.
 */
export function TelegramGate() {
  return (
    <main className="grid min-h-[100dvh] place-items-center px-6" style={{ background: 'var(--bg)' }}>
      <div
        className="w-full max-w-sm rounded-[24px] p-8 text-center"
        style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-md)' }}
      >
        <BrandLogo size={64} markOnly className="justify-center" />

        <h1 className="wordmark mt-6 text-3xl" style={{ color: 'var(--ink)' }}>
          {BRAND.name}
        </h1>
        <p
          className="mt-2 text-[0.68rem] font-bold uppercase"
          style={{ letterSpacing: '0.22em', color: 'var(--brand)' }}
        >
          {BRAND.tagline}
        </p>

        <p className="mt-5 text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
          {BRAND.name} do&rsquo;koni Telegram ilovasi ichida ishlaydi. Botni oching va
          &laquo;Katalogni ochish&raquo; tugmasini bosing.
        </p>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--faint)' }}>
          Магазин {BRAND.name} работает внутри Telegram. Откройте бота и нажмите
          &laquo;Открыть каталог&raquo;.
        </p>

        <a href={BOT_URL} className="btn-primary mt-7 w-full py-4">
          Telegram
        </a>
      </div>
    </main>
  )
}
