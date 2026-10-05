import { initializeApp } from 'firebase/app'
import { DEFAULT_CONTACT, readContact, type ContactInfo } from '../config/contact'
import { readVoices, type VoiceItem } from '../config/voices'
import { collection, onSnapshot, query, where, doc, updateDoc, writeBatch, getDocs, getDoc } from 'firebase/firestore'
import { createFirestore } from '../config/firestore-cache'
import { getStorage } from 'firebase/storage'
import { firebaseConfig } from '../config/firebase'
import { parseDate } from '../utils/date'
import { readPromotion, type Promotion } from '../utils/promotions'
import { readSplashAd, type SplashAd } from '../utils/splash-ad'
import { readBanners, type HomeBanner } from '../config/banners'
import type { Product, Category, Section, Order, PaymentSettings, DeliverySettings, Notification, UserProfile } from '../types/domain'

// Initialize Firebase
export const app = initializeApp(firebaseConfig)
// Qurilmadagi kesh bilan — qayta ochilganda katalog qayta o'qilmaydi (pulli o'qishlar)
export const db = createFirestore(app)
export const storage = getStorage(app)

// Real-time Firestore Listeners
export function subscribeToProducts(callback: (products: Product[]) => void, onError?: (err: unknown) => void) {
  console.log('[Firebase] Subscribing to products collection...')
  const productsRef = collection(db, 'products')
  return onSnapshot(productsRef, (snapshot) => {
    console.log(`[Firebase] Products snapshot received: ${snapshot.size} documents`)
    // Nomsiz yozuv — mahsulot emas (eski Linko sinxroni qoldig'i), katalogda chiqmasin
    const products: Product[] = snapshot.docs
      .filter((doc) => typeof doc.data().name === 'string' && doc.data().name.trim() !== '')
      .map((doc) => {
      const data = doc.data()
      const rawId = data.id || doc.id
      const numId = typeof rawId === 'number' ? rawId : (parseInt(String(rawId), 10) || Math.abs(hashString(doc.id)))
      
      /*
       * O'ram: bazada narx va qoldiq DONADA. Mijoz o'ramni ko'radi va
       * o'ramni savatga qo'yadi — narx ×pack, qoldiq ÷pack. Server ham
       * xuddi shunday hisoblaydi (api/orders.ts). Setda o'ram yo'q.
       */
      const isSet = Array.isArray(data.bundle) && data.bundle.length > 0
      const pack = !isSet ? packOf(data.pack) : 1
      const unitPrice = Number(data.price) || 0
      return {
        id: numId,
        name: data.name || '',
        price: unitPrice * pack,
        oldPrice: data.oldPrice ? Number(data.oldPrice) * pack : undefined,
        ...(pack > 1 ? { pack, unitPrice } : {}),
        category: data.category || '',
        images: data.images || [],
        rating: data.rating || 5,
        reviews: data.reviews || 0,
        sizes: data.sizes || [],
        // Set tarkibi — bo'sh bo'lsa oddiy mahsulot
        bundle: Array.isArray(data.bundle) && data.bundle.length
          ? data.bundle
              .map((b: { productId?: unknown; quantity?: unknown; name?: unknown }) => ({
                productId: String(b?.productId ?? ''),
                quantity: Math.max(1, Number(b?.quantity) || 1),
                name: String(b?.name || ''),
              }))
              .filter((b: { productId: string }) => b.productId)
          : undefined,
        color: data.color || '',
        description: data.description || '',
        nameRu: data.nameRu || '',
        nameEn: data.nameEn || '',
        descriptionRu: data.descriptionRu || '',
        descriptionEn: data.descriptionEn || '',
        discount: data.discount || '',
        stock: typeof data.stock === 'number' ? Math.floor(data.stock / pack) : undefined,
        thumbs: Array.isArray(data.thumbs) ? data.thumbs : undefined,
        optimized: Array.isArray(data.optimized) ? data.optimized : undefined,
        variantSources: Array.isArray(data.variantSources) ? data.variantSources : undefined,
        // Ilgari bu maydonlar o'qilmasdi — admin panelda belgilangan
        // tartib ilovaga umuman yetib bormasdi.
        order: typeof data.order === 'number' ? data.order : undefined,
        sectionId: data.sectionId ? String(data.sectionId) : null,
        popular: data.popular === true,
        active: data.active !== false,
      }
    })
    callback(products)
  }, (error) => {
    console.error('[Firebase] Products snapshot ERROR:', error)
    console.error('[Firebase] This usually means Firestore Security Rules are blocking read access.')
    console.error('[Firebase] Go to Firebase Console → Firestore → Rules and set: allow read: if true;')
    if (onError) onError(error)
  })
}

/** O'ramdagi dona soni: 1–1000 butun son, aks holda 1. */
function packOf(value: unknown): number {
  const n = Math.floor(Number(value))
  return Number.isFinite(n) && n > 1 ? Math.min(n, 1000) : 1
}

export function subscribeToCategories(callback: (categories: Category[]) => void, onError?: (err: unknown) => void) {
  console.log('[Firebase] Subscribing to categories collection...')
  const categoriesRef = collection(db, 'categories')
  return onSnapshot(categoriesRef, (snapshot) => {
    console.log(`[Firebase] Categories snapshot received: ${snapshot.size} documents`)
    const categories: Category[] = snapshot.docs.map((doc) => {
      const data = doc.data()
      const rawId = data.id || doc.id
      const numId = typeof rawId === 'number' ? rawId : (parseInt(String(rawId), 10) || Math.abs(hashString(doc.id)))
      
      return {
        id: numId,
        name: data.name || '',
        nameRu: data.nameRu || '',
        icon: data.icon || 'package',
        order: typeof data.order === 'number' ? data.order : undefined,
      }
    })
    callback(categories)
  }, (error) => {
    console.error('[Firebase] Categories snapshot ERROR:', error)
    console.error('[Firebase] This usually means Firestore Security Rules are blocking read access.')
    if (onError) onError(error)
  })
}

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return hash
}

// ── ORDERS ───────────────────────────────────────────────────

// Buyurtmani mijoz emas, SERVER yaratadi: POST /api/orders.
// Narx, chegirma va jami Firestore'dagi haqiqiy qiymatlardan
// qayta hisoblanadi, shuning uchun bu yerda addDoc yo'q (F-04).

// ── PAYMENT SETTINGS ─────────────────────────────────────────

const PAYMENT_FALLBACK: PaymentSettings = {
  cardNumber: '',
  cardOwner: '',
}

const DELIVERY_FALLBACK: DeliverySettings = { fee: 0, freeFrom: 0, minOrder: 0 }

/** Yetkazib berish narxi — settings/delivery hujjatidan. */
export async function getDeliverySettings(): Promise<DeliverySettings> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'delivery'))
    if (!snap.exists()) return DELIVERY_FALLBACK
    const data = snap.data()
    return {
      fee: Math.max(Number(data.fee) || 0, 0),
      freeFrom: Math.max(Number(data.freeFrom) || 0, 0),
      minOrder: Math.max(Number(data.minOrder) || 0, 0),
    }
  } catch (error) {
    console.error("[Firebase] Yetkazish sozlamalarini o'qib bo'lmadi:", error)
    return DELIVERY_FALLBACK
  }
}

/** Karta ma'lumoti yagona manbadan — settings/payment hujjatidan (F-07). */
export async function getPaymentSettings(): Promise<PaymentSettings> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'payment'))
    if (!snap.exists()) return PAYMENT_FALLBACK
    const data = snap.data()
    return {
      cardNumber: String(data.cardNumber || PAYMENT_FALLBACK.cardNumber),
      cardOwner: String(data.cardOwner || PAYMENT_FALLBACK.cardOwner),
      transfer: data.transfer !== false,
      online: data.online === true,
      onlineProviders: Array.isArray(data.onlineProviders) ? data.onlineProviders.map(String) : [],
      onlineTestOnly: data.onlineTestOnly === true,
      onlineTesters: Array.isArray(data.onlineTesters) ? data.onlineTesters.map(Number) : [],
    }
  } catch (error) {
    console.error("[Firebase] To'lov sozlamalarini o'qib bo'lmadi:", error)
    return PAYMENT_FALLBACK
  }
}

// Foydalanuvchi hujjatini /api/auth yaratadi va yangilaydi.

export function subscribeToUserProfile(userId: number, callback: (profile: UserProfile | null) => void) {
  const userRef = doc(db, 'users', String(userId))
  
  return onSnapshot(userRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.data() as UserProfile)
    } else {
      callback(null)
    }
  }, (error) => {
    console.error("Error fetching user profile:", error)
  })
}

/**
 * Profil maydonlarini yangilaydi.
 *
 * XATONI YUTMAYDI — ataylab. Ilgari bu funksiya har qanday xatoni
 * catch qilib, hech narsa qaytarmasdi: chaqiruvchi yozuv muvaffaqiyatli
 * deb o'ylab "saqlandi" xabarini ko'rsatardi, aslida esa bazaga hech
 * narsa tushmagan bo'lardi. Ruxsat yo'qligi yoki seans uzilgani shu
 * tariqa umuman ko'rinmay qolardi.
 *
 * Chaqiruvchi try/catch bilan o'rab, foydalanuvchiga aniq xabar berishi shart.
 */
export async function updateUserProfile(userId: number, data: Partial<UserProfile>) {
  const userRef = doc(db, 'users', String(userId))
  await updateDoc(userRef, data)
}

/**
 * Ochilish reklamasi (`ads/splash`). Jonli kuzatilmaydi — ilova
 * ochilganda bir marta o'qiladi. O'qib bo'lmasa `null`: reklama
 * chiqmaydi, do'kon odatdagidek ochiladi.
 */
export async function fetchSplashAd(): Promise<SplashAd | null> {
  try {
    const snapshot = await getDoc(doc(db, 'ads', 'splash'))
    return snapshot.exists() ? readSplashAd(snapshot.data()) : null
  } catch (error) {
    console.warn('[Firebase] reklamani o‘qib bo‘lmadi:', error)
    return null
  }
}

/** Vaqtli aksiyalar — narx qoidasi src/utils/promotions.ts da. */
/**
 * Bosh sahifa bannerlari (settings/home) — faqat faollari, admin tartibida.
 * `settings` kirgan foydalanuvchiga ochiq, shuning uchun auth'dan keyin ulanadi.
 */
export function subscribeToHomeBanners(callback: (banners: HomeBanner[]) => void) {
  return onSnapshot(
    doc(db, 'settings', 'home'),
    (snap) => callback(readBanners(snap.data()?.banners).filter((b) => b.active)),
    (error) => {
      console.warn("[Firebase] Bannerlarni o'qib bo'lmadi:", error)
      callback([])
    },
  )
}

/** «Biz bilan aloqa» (admin → Sozlamalar). Xato yoki hujjat yo'q — brend standarti. */
export function subscribeToContact(callback: (contact: ContactInfo) => void) {
  return onSnapshot(
    doc(db, 'settings', 'contact'),
    (snap) => callback(readContact(snap.data())),
    () => callback(DEFAULT_CONTACT),
  )
}

/** Kirish ovozlari (admin → «Kirish ovozlari»). Hujjat yo'q yoki o'qib bo'lmadi — null (standart ovoz). */
export function subscribeToVoices(callback: (items: VoiceItem[] | null) => void) {
  return onSnapshot(
    doc(db, 'settings', 'voices'),
    (snap) => callback(snap.exists() ? readVoices(snap.data()?.items) : null),
    () => callback(null),
  )
}

export function subscribeToPromotions(callback: (promotions: Promotion[]) => void) {
  return onSnapshot(
    query(collection(db, 'promotions'), where('active', '==', true)),
    (snapshot) => callback(snapshot.docs.map((d) => readPromotion(d.id, d.data()))),
    (error) => {
      // Aksiyalar o'qilmasa katalog oddiy narxlar bilan ishlayveradi
      console.error('[Firebase] Promotions snapshot ERROR:', error)
      callback([])
    },
  )
}

/** Bo'limlar — kategoriya ichidagi guruhlar (Section). */
export function subscribeToSections(callback: (sections: Section[]) => void) {
  return onSnapshot(
    collection(db, 'sections'),
    (snapshot) => {
      const sections = snapshot.docs.map((d) => {
        const data = d.data()
        return {
          id: d.id,
          name: String(data.name || ''),
          nameRu: String(data.nameRu || ''),
          category: String(data.category || ''),
          order: typeof data.order === 'number' ? data.order : undefined,
        }
      })
      callback(sections)
    },
    (error) => {
      // Bo'limlar bo'lmasa ham katalog oddiy ro'yxat bo'lib ishlaydi
      console.error('[Firebase] Sections snapshot ERROR:', error)
      callback([])
    },
  )
}

// Subscribe to User Orders
export function subscribeToUserOrders(userId: number, callback: (orders: Order[]) => void) {
  const ordersRef = collection(db, 'orders')
  // We only use 'where' to avoid requiring a composite index in Firestore.
  // Sorting will be done on the client side.
  const q = query(ordersRef, where('userId', '==', userId))
  
  return onSnapshot(q, (snapshot) => {
    const orders = snapshot.docs.map((snap) => {
      const data = snap.data()
      return {
        ...data,
        // Haqiqiy kalit — hujjat identifikatori (F-03)
        id: snap.id,
        // Eski buyurtmalarda orderNumber yo'q: o'sha paytdagi "#1234567" ni ko'rsatamiz
        orderNumber: data.orderNumber || data.id || snap.id,
        createdAt: data.createdAt || '',
      } as Order
    })

    orders.sort((a, b) => parseDate(b.createdAt) - parseDate(a.createdAt))

    callback(orders)
  }, (error) => {
    console.error("Error fetching user orders:", error)
    // Xato bo'lsa ham javob beramiz: aks holda sahifa skeletda qotib
    // qolardi. Bo'sh ro'yxat — «buyurtma yo'q» holati.
    callback([])
  })
}

// ── REVIEWS ──────────────────────────────────────────────────
import type { Review } from '../types/domain'

// Sharhni /api/reviews yaratadi — mijoz to'g'ridan-to'g'ri yoza olmaydi.

export function subscribeToProductReviews(productId: number, callback: (reviews: Review[]) => void) {
  const reviewsRef = collection(db, 'reviews')
  const q = query(reviewsRef, where('productId', '==', productId))
  
  return onSnapshot(q, (snapshot) => {
    const reviews: Review[] = snapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id
    } as Review))
    // sort by newest
    reviews.sort((a, b) => parseDate(b.date) - parseDate(a.date))
    callback(reviews)
  }, (error) => {
    console.error("Error fetching product reviews:", error)
  })
}

export function subscribeToUserReviews(userId: number, callback: (reviews: Review[]) => void) {
  const reviewsRef = collection(db, 'reviews')
  const q = query(reviewsRef, where('userId', '==', userId))
  
  return onSnapshot(q, (snapshot) => {
    const reviews: Review[] = snapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id
    } as Review))
    // sort by newest
    reviews.sort((a, b) => parseDate(b.date) - parseDate(a.date))
    callback(reviews)
  }, (error) => {
    console.error("Error fetching user reviews:", error)
  })
}

// ==========================================
// NOTIFICATIONS
// ==========================================

export function subscribeToUserNotifications(userId: number, callback: (notifications: Notification[]) => void) {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId)
  )
  return onSnapshot(q, (snapshot) => {
    const notifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification))
    // ISO sana bo'yicha saralash; eski formatlar oxiriga tushadi (F-10)
    notifs.sort((a, b) => parseDate(b.date) - parseDate(a.date))
    callback(notifs)
  }, (error) => {
    console.error("Error fetching notifications:", error)
  })
}

/**
 * Faqat BUYURTMA bildirishnomalarini o'qilgan qiladi — mijoz «Buyurtmalar»
 * bo'limini ochganda. Aksiya va tizim xabarlari qo'ng'iroqchada qoladi.
 */
export async function markOrderNotificationsAsRead(userId: number) {
  try {
    const snapshot = await getDocs(query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('read', '==', false),
    ))
    const orderDocs = snapshot.docs.filter((d) => d.data().type === 'order')
    if (!orderDocs.length) return
    const batch = writeBatch(db)
    orderDocs.forEach((docSnap) => batch.update(docSnap.ref, { read: true }))
    await batch.commit()
  } catch (e) {
    console.error('Error marking order notifications as read', e)
  }
}

export async function markNotificationsAsRead(userId: number) {
  try {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('read', '==', false)
    )
    const snapshot = await getDocs(q)
    const batch = writeBatch(db)
    snapshot.docs.forEach(docSnap => {
      batch.update(docSnap.ref, { read: true })
    })
    await batch.commit()
  } catch (e) {
    console.error('Error marking notifications as read', e)
  }
}
