import { useContext } from 'react'
import { I18nContext, type I18nValue } from './context'

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n faqat I18nProvider ichida ishlaydi')
  return ctx
}

/** Qisqa yozuv: const t = useT() */
export function useT() {
  return useI18n().t
}
