/**
 * Summa so'z bilan (nakladnoy uchun): 143 500 → «Bir yuz qirq uch ming besh yuz so‘m».
 */
const ONES = ['', 'bir', 'ikki', 'uch', 'to‘rt', 'besh', 'olti', 'yetti', 'sakkiz', 'to‘qqiz']
const TENS = ['', 'o‘n', 'yigirma', 'o‘ttiz', 'qirq', 'ellik', 'oltmish', 'yetmish', 'sakson', 'to‘qson']
const SCALES = ['', 'ming', 'million', 'milliard', 'trillion']

/** 0–999 → so'zlar. */
function triple(n: number): string[] {
  const words: string[] = []
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  if (hundreds) words.push(ONES[hundreds], 'yuz')
  if (rest >= 10) words.push(TENS[Math.floor(rest / 10)])
  if (rest % 10) words.push(ONES[rest % 10])
  return words
}

export function numberToWords(value: number): string {
  let n = Math.floor(Math.abs(value))
  if (n === 0) return 'nol'
  const parts: string[] = []
  let scale = 0
  while (n > 0 && scale < SCALES.length) {
    const chunk = n % 1000
    if (chunk) parts.unshift([...triple(chunk), SCALES[scale]].filter(Boolean).join(' '))
    n = Math.floor(n / 1000)
    scale++
  }
  return parts.join(' ')
}

export function sumInWords(value: number): string {
  const words = numberToWords(value)
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} so‘m`
}
