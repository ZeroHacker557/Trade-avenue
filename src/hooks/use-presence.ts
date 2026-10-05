import { useEffect, useState } from 'react'

/**
 * Yopilish animatsiyasi uchun elementni biroz ushlab turadi.
 *
 * `{open && <X/>}` ko'rinishida element `open` false bo'lishi bilan DOMdan
 * darhol olib tashlanadi — ochilish animatsiyasi bor-u, yopilishi keskin.
 * Bu hook `open` o'chgandan keyin ham `exitMs` davomida `mounted: true`
 * qaytaradi, `leaving: true` esa CSS'ga «hozir yopilish animatsiyasini
 * o'ynat» deydi.
 *
 * Yopish qaysi yo'l bilan bo'lishidan qat'i nazar ishlaydi: × tugmasi,
 * fonga bosish, Telegram orqaga tugmasi, sahifa almashishi.
 */
export function usePresence(open: boolean, exitMs: number) {
  const [mounted, setMounted] = useState(open)
  const [prevOpen, setPrevOpen] = useState(open)

  // Ochilish darhol — render paytida (effekt kutib bir kadr kechikmasin)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setMounted(true)
  }

  useEffect(() => {
    if (open || !mounted) return
    const timer = window.setTimeout(() => setMounted(false), exitMs)
    return () => window.clearTimeout(timer)
  }, [open, mounted, exitMs])

  return { mounted, leaving: mounted && !open }
}
