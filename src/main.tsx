import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App'
import { TelegramGate } from './components/ui/TelegramGate'
import { I18nProvider } from './i18n'
import { applySafeArea, isTelegramEnvironment, waitForTelegram } from './utils/telegram'
import { applyTheme, getStoredTheme } from './utils/theme'

const root = createRoot(document.getElementById('root')!)

// Ochilish animatsiyasi (index.html) tugagach Telegram paneli ilova rangiga qaytadi
window.addEventListener('musa:splash-done', () => applyTheme(getStoredTheme()))

function render(insideTelegram: boolean) {
  // Tema birinchi bo'yoqdan oldin qo'llanadi — chaqnash bo'lmaydi
  applyTheme(getStoredTheme())
  applySafeArea()

  root.render(
    <StrictMode>
      {insideTelegram ? (
        <I18nProvider>
          <App />
        </I18nProvider>
      ) : (
        <TelegramGate />
      )}
    </StrictMode>,
  )
}

if (isTelegramEnvironment() || import.meta.env.DEV) {
  render(true)
} else {
  // SDK skripti hali yuklanmagan bo'lishi mumkin — shoshilmaymiz
  waitForTelegram().then(() => render(isTelegramEnvironment()))
}
