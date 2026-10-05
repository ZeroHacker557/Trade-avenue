/**
 * Koordinatadan manzil matnini olish (teskari geokodlash).
 *
 * NEGA KERAK: mijozlar «To'liq manzil» maydonida adashib qolishardi —
 * ba'zilari faqat «Uy» deb yozar, ba'zilari mo'ljalni tushunarsiz
 * yozardi va kuryer topa olmasdi. Endi xaritadan joy belgilangach
 * ko'cha va uy raqami o'zi yoziladi, mijozga faqat tekshirish (va
 * xohlasa tahrirlash) qoladi.
 *
 * Xizmat: OpenStreetMap Nominatim — xarita plitkalari ham o'sha yerdan
 * olinadi, ya'ni yangi ta'minotchi qo'shilmayapti. Kalit talab qilmaydi.
 *
 * MUHIM: bu QULAYLIK, majburiyat emas. Xizmat javob bermasa yoki
 * internet sekin bo'lsa — jim `null` qaytadi va mijoz qo'lda yozadi.
 * Nominatim siyosati bo'yicha soniyada bittadan ko'p so'ramaymiz:
 * chaqiruvchi tanlovni kutib (debounce) so'raydi va eskisini bekor qiladi.
 */

const ENDPOINT = 'https://nominatim.openstreetmap.org/reverse'

type NominatimAddress = {
  road?: string
  house_number?: string
  neighbourhood?: string
  suburb?: string
  quarter?: string
  residential?: string
  city?: string
  town?: string
  village?: string
  county?: string
}

/** Uzun rasmiy satrdan kuryerga kerakli qismini yig'amiz. */
function compose(a: NominatimAddress): string {
  const street = [a.road, a.house_number].filter(Boolean).join(' ')
  const area = a.neighbourhood || a.quarter || a.residential || a.suburb
  const city = a.city || a.town || a.village || a.county
  return [street, area, city].filter(Boolean).join(', ')
}

export async function reverseGeocode(
  lat: number,
  lng: number,
  lang: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const url =
    `${ENDPOINT}?format=jsonv2&zoom=18&addressdetails=1` +
    `&lat=${lat.toFixed(6)}&lon=${lng.toFixed(6)}&accept-language=${encodeURIComponent(lang)}`

  try {
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const data = (await res.json()) as { address?: NominatimAddress; display_name?: string }
    const text = data.address ? compose(data.address) : ''
    if (text) return text
    // Ba'zi nuqtalarda tarkibiy qismlar bo'lmaydi — to'liq satrning
    // boshidagi uch bo'lagi ham mo'ljal sifatida yetarli
    const fallback = (data.display_name || '').split(',').slice(0, 3).join(',').trim()
    return fallback || null
  } catch {
    // AbortError ham shu yerga tushadi — bu kutilgan hol
    return null
  }
}
