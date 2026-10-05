import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Hujjatni chop etish (nakladnoy, marshrut varaqasi).
 *
 * Hujjat `body` ga portal bilan qo'yiladi, `body[data-print="doc"]`
 * belgilanadi va brauzerning chop etish oynasi ochiladi — admin.css
 * dagi `@media print` faqat shu hujjatni qog'ozga chiqaradi (buyurtma
 * chekiga xalaqit bermaydi). Oyna yopilgach hujjat olib tashlanadi.
 */
export function usePrintDoc() {
  const [doc, setDoc] = useState<ReactNode | null>(null)

  useEffect(() => {
    if (!doc) return
    document.body.dataset.print = 'doc'
    const done = () => {
      delete document.body.dataset.print
      setDoc(null)
    }
    window.addEventListener('afterprint', done, { once: true })
    // Rasm va shriftlar joylashib olsin
    const timer = window.setTimeout(() => window.print(), 60)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('afterprint', done)
      delete document.body.dataset.print
    }
  }, [doc])

  return {
    print: (node: ReactNode) => setDoc(node),
    node: doc ? createPortal(<div className="adm-print">{doc}</div>, document.body) : null,
  }
}
