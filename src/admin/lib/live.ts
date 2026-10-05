import { collection, doc, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from './auth'
import { useSharedSnapshot } from './shared-snapshot'
import { readBanners, type HomeBanner } from '../../config/banners'
import { DEFAULT_CONTACT, readContact, type ContactInfo } from '../../config/contact'
import type { Category, Order, Product, PromoCode, Section } from '../../types/domain'
import { readPromotion, type Promotion } from '../../utils/promotions'
import { tashkentToday } from '../../utils/order-label'
import { EMPTY_AD, readSplashAd, type SplashAd } from '../../utils/splash-ad'
import {
  readMessage, readThread, type SupportMessage, type SupportThread,
} from '../../types/support'

/**
 * Firestore'dan jonli ma'lumot.
 *
 * Admin panel hamma narsani onSnapshot orqali oladi: buyurtma holati
 * o'zgarganda yoki yangi buyurtma tushganda ekran o'zi yangilanadi,
 * sahifani qayta yuklash shart emas.
 */

function parseTime(value: unknown): number {
  const time = Date.parse(String(value ?? ''))
  return Number.isNaN(time) ? 0 : time
}

export type AdminOrder = Order & {
  /** Toshkent sanasi — raqam har kuni #0001 dan boshlanadi. */
  orderDay?: string
  courierId?: string | null
  courierName?: string | null
  statusUpdatedAt?: string
  /** Naqd pul: kuryerda / topshirilgan / kassa qabul qilgan. */
  cashStatus?: 'held' | 'pending' | 'settled'
  /** Kuryer bosgan muammo tugmalari. */
  problems?: { code: string; at: string }[]
}

/** Sukut bo'yicha nechta kunlik buyurtma jonli kuzatiladi. */
export const ORDERS_WINDOW_DAYS = 30

/**
 * `days` kun oldingi mahalliy yarim tun — ISO. Kun boshiga yaxlitlanadi:
 * bir vaqtda ochiq sahifalar AYNAN bir xil so'rov yuboradi va Firestore
 * SDK ularni bitta tinglovchiga birlashtiradi (hujjatlar ikki marta
 * o'qilmaydi).
 */
function windowStart(days: number): string {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (days - 1))
  return start.toISOString()
}

/** Umumiy obunalarning boshlang'ich qiymatlari — barqaror havolalar. */
const NO_ORDERS: AdminOrder[] = []
const NO_PRODUCTS: ProductRow[] = []
const NO_CUSTOMERS: CustomerRow[] = []
const NO_CATEGORIES: Category[] = []
const NO_SECTIONS: Section[] = []
const NO_PROMOTIONS: (Promotion & { createdAt?: string })[] = []

/**
 * Buyurtmalar. Kuryerga faqat o'ziga biriktirilganlari ko'rinadi —
 * bu Firestore Rules bilan ham takrorlanadi, bu yerdagi filtr esa
 * keraksiz ma'lumotni umuman yuklamaslik uchun.
 *
 * `days` — faqat oxirgi N kun (sukut bo'yicha 30). Ilgari panel har
 * sahifada BUTUN tarixni yuklardi: buyurtmalar ko'paygan sari sekinlashib,
 * Firestore o'qishlari o'sib borardi. Butun tarix kerak bo'lgan joylar
 * (mijozlar, tahlil) `'all'` beradi.
 */
export function useOrders(courierId?: string, days: number | 'all' = ORDERS_WINDOW_DAYS) {
  // Umumiy obuna — sahifalar orasida qayta o'qilmaydi (shared-snapshot.ts)
  const { value: orders, loading, error } = useSharedSnapshot<AdminOrder[]>(
    `orders:${courierId ?? ''}:${days}`,
    NO_ORDERS,
    (emit, fail) => {
      const ref = collection(db, 'orders')
      const since = days === 'all' || courierId ? null : windowStart(days)
      // Kuryer: faqat o'zinikilar (oz) — sana filtri qo'shilmaydi, aks holda
      // Firestore murakkab indeks talab qilardi
      const q = courierId
        ? query(ref, where('courierId', '==', courierId))
        : since
          ? query(ref, where('createdAt', '>=', since))
          : ref
      return onSnapshot(
        q,
        (snapshot) => {
          const rows = snapshot.docs.map((doc) => {
            const data = doc.data()
            return {
              ...data,
              id: doc.id,
              orderNumber: data.orderNumber || `#${doc.id.slice(0, 6)}`,
              createdAt: data.createdAt || '',
            } as AdminOrder
          })
          rows.sort((a, b) => parseTime(b.createdAt) - parseTime(a.createdAt))
          emit(rows)
        },
        (err) => {
          console.error('[admin] buyurtmalarni o‘qib bo‘lmadi:', err)
          fail(err)
        },
      )
    },
  )
  return { orders, loading, error: error ? 'Buyurtmalarni yuklab bo‘lmadi. Firestore Rules tekshiring.' : null }
}

/**
 * Kuryerlar qo'lidagi (kassaga topshirilmagan) naqd buyurtmalar — sanaga
 * qaramay: kuryer pulni bir oy topshirmasa ham kassada ko'rinib tursin.
 */
export function useHeldCashOrders(enabled = true) {
  const [orders, setOrders] = useState<AdminOrder[]>([])

  useEffect(() => {
    if (!enabled) return
    return onSnapshot(
      query(collection(db, 'orders'), where('cashStatus', '==', 'held')),
      (snapshot) => setOrders(snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as AdminOrder)),
      (err) => console.error('[admin] kassa buyurtmalari o‘qilmadi:', err),
    )
  }, [enabled])

  return enabled ? orders : []
}

/** Firestore hujjat identifikatori — tahrir va o'chirish shu bo'yicha. */
export type ProductRow = Product & { docId: string }

export function useProducts() {
  const { value: products, loading } = useSharedSnapshot<ProductRow[]>('products', NO_PRODUCTS, (emit, fail) =>
    onSnapshot(
      collection(db, 'products'),
      (snapshot) => {
        const rows = snapshot.docs
          // Nomsiz yozuv — mahsulot emas (eski Linko sinxroni qoldig'i):
          // ro'yxatlarda bo'sh qator bo'lib, saralashni yiqitardi
          .filter((doc) => typeof doc.data().name === 'string' && doc.data().name.trim() !== '')
          .map((doc) => {
            const data = doc.data()
            return {
              ...data,
              id: typeof data.id === 'number' ? data.id : Number(data.id) || 0,
              docId: doc.id,
            } as ProductRow
          })
        // Admin belgilagan tartib (src/admin/lib/sort.ts)
        rows.sort(
          (a, b) =>
            (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER),
        )
        emit(rows)
      },
      fail,
    ),
  )
  return { products, loading }
}

export type CustomerRow = {
  id: string
  first_name?: string
  last_name?: string
  username?: string | null
  phone?: string
  photo_url?: string | null
  language?: string
  /** Oxirgi marta mini ilovani ochgan vaqt. */
  lastActive?: string
  /** Birinchi marta ochgan vaqt (2026-10 dan; eskilarida yo'q). */
  firstSeenAt?: string
  visitCount?: number
  /** Oxirgi 30 ta kirish, yangisi birinchi. */
  visits?: string[]
  /** Savat — ilova sinxronlaydi (key: `${productId}_${size}_${color}`). */
  cart?: { key: string; quantity: number; size?: string; color?: string }[]
  cartUpdatedAt?: string
  /** Ulangan do'konlar (server yozadi). */
  shopIds?: string[]
}

export function useCustomers() {
  const { value: customers, loading } = useSharedSnapshot<CustomerRow[]>('users', NO_CUSTOMERS, (emit, fail) =>
    onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        const rows = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as CustomerRow)
        rows.sort((a, b) => parseTime(b.lastActive) - parseTime(a.lastActive))
        emit(rows)
      },
      fail,
    ),
  )
  return { customers, loading }
}

export function useCategories() {
  const { value: categories, loading } = useSharedSnapshot<Category[]>('categories', NO_CATEGORIES, (emit, fail) =>
    onSnapshot(
      collection(db, 'categories'),
      (snapshot) => {
        const rows = snapshot.docs.map(
          (d) => ({ ...d.data(), id: d.id }) as unknown as Category & { id: string },
        )
        // Admin belgilagan tartib; belgilanmaganlari nom bo'yicha
        rows.sort(
          (a, b) =>
            (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) ||
            String(a.name).localeCompare(String(b.name)),
        )
        emit(rows as unknown as Category[])
      },
      fail,
    ),
  )
  return { categories, loading }
}

/** Bo'limlar — kategoriya ichidagi guruhlar, tartibi bilan. */
export function useSections() {
  const { value: sections, loading } = useSharedSnapshot<Section[]>('sections', NO_SECTIONS, (emit, fail) =>
    onSnapshot(
      collection(db, 'sections'),
      (snapshot) => {
        const rows = snapshot.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            name: String(data.name || ''),
            nameRu: String(data.nameRu || ''),
            category: String(data.category || ''),
            order: typeof data.order === 'number' ? data.order : undefined,
          }
        })
        rows.sort(
          (a, b) =>
            (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) ||
            a.name.localeCompare(b.name),
        )
        emit(rows)
      },
      fail,
    ),
  )
  return { sections, loading }
}

/** Vaqtli aksiyalar — yangilari tepada. */
export function usePromotions() {
  const { value: promotions, loading, error } = useSharedSnapshot<(Promotion & { createdAt?: string })[]>(
    'promotions',
    NO_PROMOTIONS,
    (emit, fail) =>
      onSnapshot(
        collection(db, 'promotions'),
        (snapshot) => {
          const rows = snapshot.docs.map((d) => ({ ...readPromotion(d.id, d.data()), createdAt: String(d.data().createdAt || '') }))
          rows.sort((a, b) => b.startsAt.localeCompare(a.startsAt))
          emit(rows)
        },
        (err) => {
          // Ko'pincha sabab — Firestore qoidalarida `promotions` hali yo'q.
          // Jim qolsak admin «aksiya saqlanmadi» deb o'ylaydi.
          console.error('[admin] aksiyalarni o‘qib bo‘lmadi:', err)
          fail(err)
        },
      ),
  )
  const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: string }).code : null
  return { promotions, loading, error: error ? (code === 'permission-denied' ? 'rules' : 'other') : null }
}

/** Ochilish reklamasi (`ads/splash`). Hujjat hali yo'q bo'lsa — bo'sh, o'chirilgan reklama. */
export function useSplashAd() {
  const [ad, setAd] = useState<SplashAd>(EMPTY_AD)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<'rules' | 'other' | null>(null)

  useEffect(
    () =>
      onSnapshot(
        doc(db, 'ads', 'splash'),
        (snapshot) => {
          setAd(snapshot.exists() ? readSplashAd(snapshot.data()) : EMPTY_AD)
          setLoading(false)
          setError(null)
        },
        (err) => {
          console.error('[admin] reklamani o‘qib bo‘lmadi:', err)
          setError((err as { code?: string }).code === 'permission-denied' ? 'rules' : 'other')
          setLoading(false)
        },
      ),
    [],
  )

  return { ad, loading, error }
}

export type PromoRow = PromoCode & { id: string; maxUses?: number; expiresAt?: string | null }

export function usePromocodes() {
  const [promocodes, setPromocodes] = useState<PromoRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(
    () =>
      onSnapshot(
        collection(db, 'promocodes'),
        (snapshot) => {
          setPromocodes(snapshot.docs.map((d) => ({ ...d.data(), id: d.id }) as PromoRow))
          setLoading(false)
        },
        () => setLoading(false),
      ),
    [],
  )

  return { promocodes, loading }
}

export type StaffRow = {
  uid: string
  email: string
  name: string
  role: 'owner' | 'admin' | 'courier'
  telegramId?: number | null
  phone?: string | null
  active: boolean
  /** Panelga kira oladimi. false — faqat Telegram orqali ishlaydigan kuryer. */
  webAccess?: boolean
  /** Ega/admin kuryer sifatida ham ishlaydi. */
  canDeliver?: boolean
  /**
   * Smena: «Ishdaman» — yangi buyurtma xabarlari keladi. Kechagi smena
   * hisoblanmaydi (Toshkent 00:00 da yopiladi — server bilan bir xil).
   */
  onShift?: boolean
  shiftSince?: string
  /** Mijozlar bahosi yig'indisi va soni. */
  ratingSum?: number
  ratingCount?: number
}

/**
 * Xodimlar ro'yxati — faqat egaga ko'rinadi (Firestore Rules).
 * Boshqa rollarda so'rov rad etiladi va bo'sh ro'yxat qaytadi.
 */
export function useStaff(enabled: boolean) {
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Ruxsat bo'lmasa obuna umuman ochilmaydi — Firestore so'rovni
    // rad etardi va konsolda keraksiz xato chiqardi.
    if (!enabled) return
    return onSnapshot(
      collection(db, 'staff'),
      (snapshot) => {
        const today = tashkentToday()
        const rows = snapshot.docs.map((d) => {
          const row = { ...d.data(), uid: d.id } as StaffRow
          const since = Date.parse(row.shiftSince || '')
          row.onShift = row.onShift === true && Number.isFinite(since) && tashkentToday(since) === today
          return row
        })
        const rank = { owner: 0, admin: 1, courier: 2 }
        rows.sort((a, b) => rank[a.role] - rank[b.role] || a.name.localeCompare(b.name))
        setStaff(rows)
        setLoading(false)
      },
      () => setLoading(false),
    )
  }, [enabled])

  return { staff: enabled ? staff : [], loading: enabled ? loading : false }
}

export type CourierSettings = {
  /** Buyurtma qayerga tushadi: kuryerlarning shaxsiy chatiga yoki guruhga. */
  channel: 'couriers' | 'group'
  groupChatId: string | null
  notifyAdmins: boolean
  /** Eski sozlamalar bilan mos qolish uchun. */
  toGroup?: boolean
}

export type LinkoSettings = {
  baseUrl: string
  priceListId: number
  stockIds: number[]
  /** Buyurtmalar Linko'ga yuborilsinmi va kim nomidan. */
  sendOrders: boolean
  agentId: number
  deliveryManId: number
  orderStockId: number
  currencyId: number
  /** Botdan kelgan mijozning Linko'dagi turi (Telegram bot B2C). */
  marketTypeId?: number
  lastSyncAt: string | null
  lastReport: string | null
  /** Avtomatik qayta yuborishning oxirgi natijasi (api/linko-cron.ts). */
  lastOrderPush?: { at: string; sent: number; failed: number; skipped: number; checked: number; errors?: string[] } | null
}

export type AllSettings = {
  payment: {
    cardNumber: string
    cardOwner: string
    /** Karta orqali to'lov (o'tkazma) yoqilganmi. */
    transfer?: boolean
  }
  delivery: { fee: number; freeFrom: number; minOrder: number }
  courier: CourierSettings
  linko: LinkoSettings
  /** Kompaniya rekvizitlari — nakladnoy uchun (Sozlamalar → Rekvizitlar). */
  company: CompanySettings
  /** «Biz bilan aloqa» — mini app «Yordam» sahifasi va bot. */
  contact: ContactInfo
}

export type CompanySettings = {
  legalName: string
  inn: string
  address: string
  phone: string
  bank: string
  account: string
  mfo: string
  director: string
}

const SETTINGS_FALLBACK: AllSettings = {
  payment: { cardNumber: '', cardOwner: '' },
  delivery: { fee: 0, freeFrom: 0, minOrder: 0 },
  courier: { channel: 'couriers', groupChatId: null, notifyAdmins: true },
  linko: {
    baseUrl: '', priceListId: 0, stockIds: [],
    sendOrders: false, agentId: 0, deliveryManId: 0, orderStockId: 0, currencyId: 1,
    lastSyncAt: null, lastReport: null,
  },
  company: { legalName: '', inn: '', address: '', phone: '', bank: '', account: '', mfo: '', director: '' },
  contact: DEFAULT_CONTACT,
}

/** Linko katalogining nusxasi — `linko_products` (server yozadi). */
export type LinkoRow = {
  linkoId: number
  name: string
  code?: string
  vendorCode?: string
  typeName?: string
  measurement?: string
  price: number
  stock: number
  /** Bog'langan do'kon mahsulotlari — bittadan ko'p bo'lishi mumkin. */
  productIds: string[]
  /** Narx shu pozitsiyadan olinadimi (bir mahsulotga bir nechtasi bog'lanadi). */
  primary?: boolean
  updatedAt?: string
}

export function useLinkoProducts() {
  const [rows, setRows] = useState<LinkoRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(
    () =>
      onSnapshot(
        collection(db, 'linko_products'),
        (snapshot) => {
          const list = snapshot.docs.map((d) => {
            const data = d.data()
            return {
              linkoId: Number(data.linkoId) || Number(d.id) || 0,
              name: String(data.name || ''),
              code: String(data.code || ''),
              vendorCode: String(data.vendorCode || ''),
              typeName: String(data.typeName || ''),
              measurement: String(data.measurement || ''),
              price: Number(data.price) || 0,
              stock: Number(data.stock) || 0,
              // Eski yozuvlarda bitta `productId` edi
              productIds: Array.isArray(data.productIds)
                ? data.productIds.map(String)
                : data.productId
                  ? [String(data.productId)]
                  : [],
              primary: data.primary === true,
              updatedAt: String(data.updatedAt || ''),
            }
          })
          list.sort((a, b) => a.name.localeCompare(b.name))
          setRows(list)
          setLoading(false)
        },
        // Ruxsat yo'q yoki hali sinxronlanmagan — sahifa bo'sh ro'yxat bilan ishlaydi
        () => setLoading(false),
      ),
    [],
  )

  return { rows, loading }
}


/** «Biz bilan aloqa» — chek va nakladnoy pastida. */
export function useContact() {
  const [contact, setContact] = useState<ContactInfo>(DEFAULT_CONTACT)
  useEffect(
    () => onSnapshot(doc(db, 'settings', 'contact'), (snap) => setContact(readContact(snap.data())), () => {}),
    [],
  )
  return contact
}

export function useSettings() {
  const [settings, setSettings] = useState<AllSettings>(SETTINGS_FALLBACK)

  useEffect(() => {
    const sections = ['payment', 'delivery', 'courier', 'linko', 'company', 'contact'] as const
    const unsubs = sections.map((section) =>
      onSnapshot(
        doc(db, 'settings', section),
        (snap) => {
          if (!snap.exists()) return
          setSettings((current) => ({
            ...current,
            [section]: { ...current[section], ...snap.data() },
          }))
        },
        () => {},
      ),
    )
    return () => unsubs.forEach((unsub) => unsub())
  }, [])

  return settings
}

/**
 * Kuryerlarning qo'llab-quvvatlash murojaatlari — jonli.
 * Oxirgi yozilgani birinchi. `enabled` — faqat adminga (Rules ham shunday).
 */
export function useSupportThreads(enabled: boolean) {
  const [threads, setThreads] = useState<SupportThread[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!enabled) return
    return onSnapshot(
      collection(db, 'support_threads'),
      (snapshot) => {
        const list = snapshot.docs.map((d) => readThread(d.id, d.data()))
        list.sort((a, b) => b.lastAt.localeCompare(a.lastAt))
        setThreads(list)
        setLoading(false)
      },
      () => setLoading(false),
    )
  }, [enabled])

  return { threads: enabled ? threads : [], loading: enabled ? loading : false }
}

/** Bitta murojaatning xabarlari — jonli, vaqt bo'yicha. */
export function useSupportMessages(threadId: string | null) {
  const [messages, setMessages] = useState<SupportMessage[]>([])

  useEffect(() => {
    if (!threadId) return
    return onSnapshot(
      query(collection(db, 'support_threads', threadId, 'messages'), orderBy('at')),
      (snapshot) => setMessages(snapshot.docs.map((d) => readMessage(d.id, d.data()))),
    )
  }, [threadId])

  return threadId ? messages : []
}

/** Kuryerlar kassasi — naqd pulni topshirishlar (api/_lib/actions/cash.ts). */
export type CashHandoverRow = {
  id: string
  courierUid: string
  courierName: string
  orderIds: string[]
  orderNumbers: string[]
  amount: number
  status: 'pending' | 'confirmed' | 'rejected'
  createdAt: string
  decidedAt: string | null
  decidedBy: string | null
  note: string | null
}

/** `enabled` — faqat adminga: Rules kassani boshqa rolga bermaydi. */
export function useCashHandovers(enabled = true) {
  const [handovers, setHandovers] = useState<CashHandoverRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!enabled) return
    return onSnapshot(
      collection(db, 'cash_handovers'),
      (snapshot) => {
        const rows = snapshot.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            courierUid: String(data.courierUid || ''),
            courierName: String(data.courierName || 'Kuryer'),
            orderIds: Array.isArray(data.orderIds) ? data.orderIds.map(String) : [],
            orderNumbers: Array.isArray(data.orderNumbers) ? data.orderNumbers.map(String) : [],
            amount: Number(data.amount) || 0,
            status: data.status === 'confirmed' || data.status === 'rejected' ? data.status : 'pending',
            createdAt: String(data.createdAt || ''),
            decidedAt: data.decidedAt ? String(data.decidedAt) : null,
            decidedBy: data.decidedBy ? String(data.decidedBy) : null,
            note: data.note ? String(data.note) : null,
          } as CashHandoverRow
        })
        rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        setHandovers(rows)
        setLoading(false)
      },
      () => setLoading(false),
    )
  }, [enabled])

  return { handovers: enabled ? handovers : [], loading: enabled ? loading : false }
}

/** Kuryerlarning oxirgi joylashuvi — admin xaritasi (api/_lib/actions/location.ts). */
export type CourierLocationRow = {
  uid: string
  name: string
  /** Kuryer telefoni — xaritadan qo'ng'iroq qilish uchun. */
  phone: string | null
  lat: number
  lng: number
  heading: number | null
  accuracy: number | null
  /** `live` — Telegram jonli ulashishi (ilova yopiq bo'lsa ham), `app` — ochiq ilova. */
  source: 'live' | 'app'
  at: string
  liveUntil: string | null
}

export function useCourierLocations(enabled = true) {
  const [rows, setRows] = useState<CourierLocationRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!enabled) return
    return onSnapshot(
      collection(db, 'courier_locations'),
      (snapshot) => {
        setRows(
          snapshot.docs
            .map((d) => {
              const data = d.data()
              return {
                uid: d.id,
                name: String(data.name || 'Kuryer'),
                phone: data.phone ? String(data.phone) : null,
                lat: Number(data.lat),
                lng: Number(data.lng),
                heading: Number.isFinite(Number(data.heading)) && data.heading !== null ? Number(data.heading) : null,
                accuracy: Number.isFinite(Number(data.accuracy)) && data.accuracy !== null ? Number(data.accuracy) : null,
                source: data.source === 'live' ? 'live' : 'app',
                at: String(data.at || ''),
                liveUntil: data.liveUntil ? String(data.liveUntil) : null,
              } as CourierLocationRow
            })
            .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng)),
        )
        setLoading(false)
      },
      () => setLoading(false),
    )
  }, [enabled])

  return { rows: enabled ? rows : [], loading: enabled ? loading : false }
}

export type OrderHistoryEntry = {
  id: string
  at: string
  from: string | null
  to: string
  by: { name?: string; role?: string } | null
}

/** Buyurtma holati tarixi — kim, qachon, nimadan nimaga (orders/{id}/history). */
export function useOrderHistory(orderId: string | null) {
  const [entries, setEntries] = useState<OrderHistoryEntry[]>([])

  useEffect(() => {
    if (!orderId) return
    return onSnapshot(
      query(collection(db, 'orders', orderId, 'history'), orderBy('at')),
      (snapshot) =>
        setEntries(
          snapshot.docs.map((d) => {
            const data = d.data()
            return {
              id: d.id,
              at: String(data.at || ''),
              from: data.from ? String(data.from) : null,
              to: String(data.to || ''),
              by: data.by && typeof data.by === 'object' ? (data.by as OrderHistoryEntry['by']) : null,
            }
          }),
        ),
      (err) => console.error('[admin] buyurtma tarixi o‘qilmadi:', err),
    )
  }, [orderId])

  return orderId ? entries : []
}

/** Bosh sahifa bannerlari (settings/home) — jonli, hammasi (o'chiqlari ham). */
export function useHomeBanners() {
  const [banners, setBanners] = useState<HomeBanner[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(
    () =>
      onSnapshot(
        doc(db, 'settings', 'home'),
        (snap) => {
          setBanners(readBanners(snap.data()?.banners))
          setLoading(false)
        },
        () => setLoading(false),
      ),
    [],
  )
  return { banners, loading }
}

/* ─── Do'konlar ──────────────────────────────────────────────── */

export type ShopRow = {
  id: string
  linkoId: number
  name: string
  phones: string[]
  extraPhones: string[]
  address: string
  location: { lat: number; lng: number } | null
  agentId: number
  agentName: string
  priceListId: number
  priceListName: string
  marketTypeName: string
  note: string
  /** Admin bloki. */
  active: boolean
  /** Linko'da faolmi. */
  linkoActive: boolean
  memberIds: string[]
  hasCode: boolean
  codeIssuedAt: string | null
  source: 'linko' | 'manual'
  createdAt: string
  syncedAt: string | null
}

const NO_SHOPS: ShopRow[] = []

function readShopRow(id: string, d: Record<string, unknown>): ShopRow {
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : [])
  const loc = d.location as { lat?: unknown; lng?: unknown } | null | undefined
  return {
    id,
    linkoId: Number(d.linkoId) || 0,
    name: String(d.name || ''),
    phones: list(d.phones),
    extraPhones: list(d.extraPhones),
    address: String(d.address || ''),
    location: loc && Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lng))
      ? { lat: Number(loc.lat), lng: Number(loc.lng) }
      : null,
    agentId: Number(d.agentId) || 0,
    agentName: String(d.agentName || ''),
    priceListId: Number(d.priceListId) || 0,
    priceListName: String(d.priceListName || ''),
    marketTypeName: String(d.marketTypeName || ''),
    note: String(d.note || ''),
    active: d.active !== false,
    linkoActive: d.linkoActive !== false,
    memberIds: list(d.memberIds),
    hasCode: d.hasCode === true,
    codeIssuedAt: typeof d.codeIssuedAt === 'string' ? d.codeIssuedAt : null,
    source: d.source === 'manual' ? 'manual' : 'linko',
    createdAt: String(d.createdAt || ''),
    syncedAt: typeof d.syncedAt === 'string' ? d.syncedAt : null,
  }
}

/** Hamma do'konlar — admin → «Do'konlar». */
export function useShops() {
  const { value: shops, loading } = useSharedSnapshot<ShopRow[]>('shops', NO_SHOPS, (emit, fail) =>
    onSnapshot(
      collection(db, 'shops'),
      (snapshot) => {
        const rows = snapshot.docs.map((d) => readShopRow(d.id, d.data()))
        rows.sort((a, b) => a.name.localeCompare(b.name))
        emit(rows)
      },
      fail,
    ),
  )
  return { shops, loading }
}

/** Kirish kodlari: shopId → kod. Faqat adminga (Rules: shop_codes). */
export function useShopCodes(enabled = true) {
  const [codes, setCodes] = useState<Map<string, string>>(() => new Map())
  useEffect(() => {
    if (!enabled) return
    return onSnapshot(
      collection(db, 'shop_codes'),
      (snapshot) => setCodes(new Map(snapshot.docs.map((d) => [d.id, String(d.data().code || '')]))),
      () => {},
    )
  }, [enabled])
  return codes
}

/** Linko do'konlar sinxronining oxirgi natijasi. */
export function useShopsSyncInfo() {
  const [info, setInfo] = useState<{ lastSyncAt: string | null; lastReport: string | null }>({ lastSyncAt: null, lastReport: null })
  useEffect(
    () =>
      onSnapshot(
        doc(db, 'settings', 'shops'),
        (snap) => setInfo({
          lastSyncAt: typeof snap.data()?.lastSyncAt === 'string' ? snap.data()?.lastSyncAt : null,
          lastReport: typeof snap.data()?.lastReport === 'string' ? snap.data()?.lastReport : null,
        }),
        () => {},
      ),
    [],
  )
  return info
}
