import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './admin.css'
import { AdminApp } from './AdminApp'
import { initAdminTelegram } from './lib/telegram'

/**
 * Admin panel kirish nuqtasi (admin.html).
 *
 * Mini appdan mustaqil: oddiy brauzerda email/parol bilan ochiladi.
 * Botdagi «🛠 Admin panel» tugmasi orqali Telegram ichida ham
 * ochilishi mumkin — o'sha holatda oyna to'liq ekranga chiqariladi
 * (src/admin/lib/telegram.ts). Kirish ikkala holatda ham bir xil.
 */
// Render'dan OLDIN: Telegram oynasi o'lchamini darhol to'g'rilaydi
initAdminTelegram()

createRoot(document.getElementById('admin-root')!).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
)
