import type { FirebaseApp } from 'firebase/app'
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore'

/**
 * Firestore — qurilmada saqlanadigan kesh bilan (IndexedDB).
 *
 * NEGA: har ochilishda butun katalog (150+ mahsulot, bo'limlar…) serverdan
 * qayta o'qilardi — har biri pulli o'qish. Kesh bilan obuna oldingi
 * holatdan davom etadi: ~30 daqiqa ichida qayta ochilsa faqat O'ZGARGAN
 * hujjatlar o'qiladi, ma'lumot ham ekranda darhol paydo bo'ladi.
 *
 * Kesh ishlamasa (IndexedDB yopiq, eski WebView) — oddiy ulanish:
 * ilova hech qachon shu sabab to'xtamasligi kerak.
 */
export function createFirestore(app: FirebaseApp): Firestore {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
  } catch {
    // Allaqachon yaratilgan (HMR) yoki kesh qo'llab-quvvatlanmaydi
    return getFirestore(app)
  }
}
