import { useEffect } from 'react'

/**
 * Klaviatura ochilganda sahifani ko'rinadigan qilib turadi.
 *
 * MUAMMO: mijoz «Manzil nomi» maydoniga yozgandan keyin pastdagi
 * elementlar (xarita, «Saqlash» tugmasi) klaviatura ostida qolardi —
 * shikoyat shundan. Telegram WebView'da sahifa balandligi o'zgarmaydi,
 * faqat ko'rinadigan oyna (visualViewport) kichrayadi, shuning uchun
 * brauzer o'zi hech narsani surmaydi.
 *
 * YECHIM: klaviatura balandligi `--kb` o'zgaruvchisiga yoziladi —
 * `.kb-safe` klassi bo'lgan forma pastdan shuncha bo'sh joy oladi va
 * oxirigacha scroll qilish mumkin bo'ladi. Ustiga fokusdagi maydon
 * ko'rinish markaziga suriladi.
 *
 * Bir marta — App'da chaqiriladi.
 */
export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const root = document.documentElement
    let open = false

    const centerActive = () => {
      const el = document.activeElement
      if (!el || !(el instanceof HTMLElement)) return
      if (!el.matches('input, textarea, select, [contenteditable="true"]')) return
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }

    const apply = () => {
      // Oyna pasti bilan ko'rinadigan qism pasti orasidagi farq
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      // 120 px dan kichik farq — Telegram paneli yoki manzil satri,
      // klaviatura emas
      const next = inset > 120 ? Math.round(inset) : 0
      root.style.setProperty('--kb', `${next}px`)
      const nowOpen = next > 0
      if (nowOpen !== open) {
        open = nowOpen
        root.classList.toggle('kb-open', nowOpen)
        if (nowOpen) window.setTimeout(centerActive, 60)
      }
    }

    // Maydonga bosilganda: klaviatura chiqib bo'lgach markazga suramiz
    const onFocus = (e: FocusEvent) => {
      const el = e.target
      if (!(el instanceof HTMLElement)) return
      if (!el.matches('input, textarea, select, [contenteditable="true"]')) return
      window.setTimeout(centerActive, 320)
    }

    apply()
    vv.addEventListener('resize', apply)
    vv.addEventListener('scroll', apply)
    document.addEventListener('focusin', onFocus)

    return () => {
      vv.removeEventListener('resize', apply)
      vv.removeEventListener('scroll', apply)
      document.removeEventListener('focusin', onFocus)
      root.style.removeProperty('--kb')
      root.classList.remove('kb-open')
    }
  }, [])
}
