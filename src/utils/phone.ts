/** «+998905551234» → «+998 90 555 12 34»; boshqa ko'rinish o'zgarmaydi. */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  const m = /^998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(digits)
  return m ? `+998 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : phone
}

/** Qo'ng'iroq havolasi — faqat raqam va «+». */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`
