import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { sortCategories } from '../config/categories'
import { subscribeToCategories, subscribeToHomeBanners, subscribeToProducts, subscribeToPromotions, subscribeToSections, subscribeToShopOrders, subscribeToMyShops, subscribeToUserProfile, subscribeToUserNotifications, markNotificationsAsRead, markOrderNotificationsAsRead, updateUserProfile } from '../lib/firebase'
import type { ReceiptUpload } from '../components/checkout/ReceiptSheet'
import { ensureSignedIn, onAuthChanged, auth, claimedShops, refreshClaims } from '../lib/auth'
import { apiPost } from '../lib/api'
import { apiErrorText } from '../utils/api-error'
import { formatPrice } from '../data'
import { track } from '../lib/track'
import { captureCampaign, currentCampaign } from '../lib/campaign'
import { launchParams } from '../utils/launch'
import { searchProducts } from '../utils/search'
import { countUnseenOrders } from '../utils/notifications'
import { bestPromotion, isRunning, promoPrice, type Promotion } from '../utils/promotions'
import { useI18n } from '../i18n'
import type { HomeBanner } from '../config/banners'
import type { AppPage, CartRow, Category, Order, OrderForm, Product, Section, Shop, UserProfile, Notification } from '../types/domain'
import { hapticError, hapticFeedback, hapticSuccess, initTelegram } from '../utils/telegram'
import { applyTheme, getStoredTheme, storeTheme, type ThemeMode } from '../utils/theme'
import { heroTransition } from '../utils/view-transition'
import { useT } from '../i18n'

/** Pastki menyudagi asosiy sahifalar — ularga o'tganda tarix tozalanadi. */
const ROOT_PAGES: AppPage[] = ['home', 'catalog', 'favorites', 'orders', 'profile']

const LIKES_KEY = 'taLikes'
const CART_KEY = 'taCart'
/** Tanlangan do'kon (filiallar orasida) — shu qurilmada eslab qolinadi. */
const SHOP_KEY = 'taShop'

function loadShopId(): string | null {
  try { return localStorage.getItem(SHOP_KEY) } catch { return null }
}

type CartItems = Record<string, { quantity: number; size?: string; color?: string }>

function loadLikes(): number[] {
  try {
    return JSON.parse(localStorage.getItem(LIKES_KEY) || '[]')
  } catch { return [] }
}

function saveLikes(ids: number[]) {
  localStorage.setItem(LIKES_KEY, JSON.stringify(ids))
}

/** Savat saqlanadi: Telegram mini app'ni yopib-ochganda yo'qolmasligi uchun (F-14). */
/** Takroriy buyurtmani to'sish uchun noyob kalit. */
function newOrderKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** Profildagi massiv ⇄ ilovadagi xarita. */
function toCartRows(items: CartItems): CartRow[] {
  return Object.entries(items).map(([key, item]) => ({
    key,
    quantity: item.quantity,
    ...(item.size ? { size: item.size } : {}),
    ...(item.color ? { color: item.color } : {}),
  }))
}

function fromCartRows(rows: CartRow[]): CartItems {
  const items: CartItems = {}
  for (const row of rows) {
    if (!row?.key || !Number.isFinite(row.quantity) || row.quantity <= 0) continue
    items[row.key] = { quantity: row.quantity, size: row.size, color: row.color }
  }
  return items
}

function loadCart(): CartItems {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY) || '{}')
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    return raw as CartItems
  } catch { return {} }
}

/**
 * Havola bilan ochiladigan boshlang'ich sahifa: `?page=orders`.
 *
 * Botdagi «Buyurtmalarim» tugmasi mini appni shu ko'rinishda ochadi —
 * buyurtmalar botda emas, ilovada ko'riladi.
 *
 * Query ishlatiladi, hash emas: Telegram mini appni ochganda
 * fragmentga o'z parametrlarini (`tgWebAppData` va boshqalar) qo'shadi,
 * query esa o'zgarmay qoladi.
 */
/**
 * Botdagi tugmadan kelgan havola (ommaviy xabar → «Ilovada ochish»):
 *   ?cat=<kategoriya nomi>  — katalog shu kategoriyada;
 *   ?sec=<bo'lim id>        — katalog shu bo'limga suriladi;
 *   ?product=<mahsulot id>  — mahsulot sahifasi.
 * Server tomoni: api/_lib/actions/people.ts → appLink.
 */
const DEEP_LINK = (() => {
  try {
    const q = launchParams()
    return { cat: q.get('cat'), sec: q.get('sec'), product: q.get('product'), page: q.get('page') }
  } catch {
    return { cat: null, sec: null, product: null, page: null }
  }
})()

/** Dev namunasi (`?demo`): do'kon va katalog serversiz — src/dev/demo.ts. Productionda `false`. */
const DEMO = import.meta.env.DEV && new URLSearchParams(location.search).has('demo')

function initialPage(): AppPage {
  if (DEEP_LINK.cat !== null || DEEP_LINK.sec) return 'catalog'
  try {
    const requested = DEEP_LINK.page
    const allowed: AppPage[] = ['home', 'catalog', 'favorites', 'orders', 'profile']
    if (requested && (allowed as string[]).includes(requested)) return requested as AppPage
  } catch {
    // URL o'qilmasa — oddiy bosh sahifa
  }
  return 'home'
}

export function useShopStore() {
  const t = useT()
  const { lang } = useI18n()
  const [page, setPage] = useState<AppPage>(initialPage)
  // Kanal e'loni / ommaviy xabar tugmasidan kelgan bo'lsa — bosish sanaladi (lib/campaign.ts)
  useEffect(() => { captureCampaign() }, [])
  // Telegram BackButton shu tarix bo'yicha ishlaydi (D-03)
  const [history, setHistory] = useState<AppPage[]>([])
  // Bosh sahifadan tanlangan kategoriya katalogga uzatiladi (F-16)
  const [catalogCategory, setCatalogCategory] = useState<string | null>(DEEP_LINK.cat)
  /** Katalog ochilganda shu bo'limga surib boriladi (reklama tugmasidan). */
  const [catalogSection, setCatalogSection] = useState<string | null>(null)
  /** Firestore'dagi xom mahsulotlar. Ekranda — pastdagi `products` (til va aksiya qo'llangan). */
  const [rawProducts, setProducts] = useState<Product[]>([])
  const [promotions, setPromotions] = useState<Promotion[]>([])
  // Aksiya o'zi boshlanib-tugashi uchun vaqt har 30 soniyada yangilanadi
  const [clock, setClock] = useState(() => Date.now())
  const [categories, setCategories] = useState<Category[]>([])
  const [sections, setSections] = useState<Section[]>([])
  /** Bosh sahifa bannerlari (admin qo'shgan, faollari). */
  const [homeBanners, setHomeBanners] = useState<HomeBanner[]>([])

  /*
   * Ekrandagi mahsulotlar:
   *   - nomi va tavsifi tanlangan tilda (tarjima bo'lmasa — o'zbekcha);
   *   - vaqtli aksiya bo'lsa narxi chegirmali, eski narxi chizilgan.
   * Narxni baribir server qayta hisoblaydi (api/_lib/promotions.ts) —
   * bu yerda faqat mijozga to'g'ri ko'rsatish uchun.
   */
  const products = useMemo(() => {
    const shown = localizeAndPromote()
    /*
     * Setlar: tarkibdagi mahsulotlar joriy holati bilan (nomi tanlangan
     * tilda, narxi aksiya bilan) va «alohida olsangiz» summasi. Tarkibdagi
     * mahsulot o'chirilgan bo'lsa — shunchaki ko'rsatilmaydi.
     */
    // Set tarkibi o'chirilgan (admin yashirgan) mahsulotni ham ko'rsataveradi —
    // shuning uchun qidiruv hammasidan, ro'yxatdan esa faqat faollari chiqadi
    const byId = new Map(shown.map((p) => [String(p.id), p]))
    return shown.filter((p) => p.active !== false).map((p) => {
      if (!p.bundle?.length) return p
      const bundleItems = p.bundle
        .map((line) => ({ product: byId.get(String(line.productId)), quantity: line.quantity }))
        .filter((line): line is { product: Product; quantity: number } => !!line.product)
      const bundleValue = bundleItems.reduce((sum, line) => sum + (line.product.price / (line.product.pack || 1)) * line.quantity, 0)
      return { ...p, bundleItems, bundleValue }
    })

    function localizeAndPromote(): Product[] {
    // Kategoriyaning ruscha nomi — qidiruvda ishlatiladi
    const categoryRuByName = new Map(
      categories.filter((c) => c.nameRu).map((c) => [c.name.trim().toLowerCase(), c.nameRu as string]),
    )
    return rawProducts.map((p) => {
    /*
     * Ko'rsatiladigan nom tanlangan tilga o'tadi, asl nomlar esa
     * `nameUz`/`descriptionUz` da qoladi: qidiruv ikkala tilda ham
     * ishlashi kerak (utils/search.ts).
     */
    const localized = {
      nameUz: p.name,
      descriptionUz: p.description,
      categoryRu: categoryRuByName.get(p.category.trim().toLowerCase()),
      ...(lang === 'ru'
        ? { name: p.nameRu || p.name, description: p.descriptionRu || p.description }
        : {}),
    }
    const promo = bestPromotion(
      promotions,
      { id: String(p.id), category: p.category, sectionId: p.sectionId },
      clock,
    )
    if (!promo) return { ...p, ...localized, promotion: null }
    return {
      ...p,
      ...localized,
      price: promoPrice(p.price, promo.percent),
      oldPrice: p.price,
      discount: `-${promo.percent}%`,
      promotion: { id: promo.id, title: promo.title, percent: promo.percent, endsAt: promo.endsAt },
    }
    })
    }
  }, [rawProducts, promotions, clock, lang, categories])

  /** Hozir ishlayotgan aksiyalar — bosh sahifadagi banner uchun. */
  const runningPromotions = useMemo(
    () => promotions.filter((promo) => isRunning(promo, clock)).sort((a, b) => b.percent - a.percent),
    [promotions, clock],
  )
  const [loading, setLoading] = useState(true)
  const [likedIds, setLikedIds] = useState<number[]>(loadLikes)
  const [cartItems, setCartItems] = useState<CartItems>(loadCart)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [isSearchOpen, setSearchOpen] = useState(false)
  const [isCartOpen, setCartOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  /**
   * Savatga qo'shilgandan keyingi so'rov: «Rasmiylashtirasizmi?».
   *
   * Oddiy bildirishnomadan ajratilgan — chunki bu javob kutadi va
   * o'zi yo'qolib ketmasligi kerak (uzoqroq turadi).
   */
  const [cartPrompt, setCartPrompt] = useState<string | null>(null)
  const toastTimer = useRef<number | null>(null)
  /** Do'kon buyurtmalari — qaysi do'konniki ekani bilan (almashganda eskisi ko'rinmasin). */
  const [shopOrders, setShopOrders] = useState<{ shopId: string | null; list: Order[] }>({ shopId: null, list: [] })
  const [checkoutDone, setCheckoutDone] = useState(false)
  const checkoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** «Buyurtma qabul qilindi» oynasi — kutmasdan yopiladi. */
  const dismissCheckout = useCallback(() => {
    if (checkoutTimer.current) clearTimeout(checkoutTimer.current)
    checkoutTimer.current = null
    setCheckoutDone(false)
  }, [])
  const [isSubmitting, setSubmitting] = useState(false)
  const [authReady, setAuthReady] = useState(false)
  const [theme, setThemeState] = useState<ThemeMode>(getStoredTheme)
  // Bitta rasmiylashtirish uchun bitta kalit. Xato bo'lsa saqlanadi —
  // qayta urinishda server yangi buyurtma yaratmaydi.
  const orderKeyRef = useRef<string | null>(null)
  const [isAuthenticated, setAuthenticated] = useState(false)
  const [orderForm, setOrderForm] = useState<OrderForm>({
    name: '', phone: '', address: '', location: null, comment: '', paymentMethod: 'Naqd',
    recipientName: '', recipientPhone: '',
  })
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  /**
   * Ulangan do'konlar (filiallar). `shopsReady` — birinchi javob keldimi:
   * kelguncha kirish ekrani ko'rsatilmaydi (ulangan do'konchi uni
   * bir lahza ko'rib qolmasin).
   */
  const [shops, setShops] = useState<Shop[]>([])
  const [shopsReady, setShopsReady] = useState(false)
  const [selectedShopId, setSelectedShopId] = useState<string | null>(loadShopId)
  /**
   * Token do'kon claim'larini o'z ichiga oladimi. Katalog Rules'da faqat
   * shunda ochiladi — undan oldin obuna bo'lsak «ruxsat yo'q» bilan
   * yopilib qolardi.
   */
  const [claimsFor, setClaimsFor] = useState('')
  /** Faol do'kon: tanlangani, u yo'q bo'lsa birinchisi. */
  const activeShop = useMemo(
    () => shops.find((shop) => shop.id === selectedShopId) ?? shops[0] ?? null,
    [shops, selectedShopId],
  )
  const shopKey = shops.map((shop) => shop.id).join('|')
  /** Token shu do'konlar ro'yxatini tasdiqlagan — katalog ochiq (Rules: `shops` claim). */
  const catalogAccess = shopKey !== '' && claimsFor === shopKey
  const [notifications, setNotifications] = useState<Notification[]>([])
  /** Cheki ochilgan buyurtma. */
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0)

  // «Buyurtmalar» nishoni — holati o'zgargan, hali ko'rilmagan buyurtmalar
  const unseenOrdersCount = useMemo(() => countUnseenOrders(notifications), [notifications])

  useEffect(() => { initTelegram() }, [])

  /*
   * Katalog — faqat do'konga ulangan foydalanuvchiga (Rules: `shops` claim).
   * Ulgurji narxlar begonaga ko'rinmasligi uchun.
   */
  useEffect(() => {
    if (!catalogAccess || DEMO) return

    const unsubProds = subscribeToProducts(
      (fbProducts) => {
        // Faqat dev (`?setDemo`): mavjud mahsulotlardan namuna set — productionda kesiladi
        if (import.meta.env.DEV && new URLSearchParams(location.search).has('setDemo') && fbProducts.length >= 3) {
          const parts = fbProducts.filter((p) => p.images?.length).slice(0, 3)
          fbProducts = [{
            ...parts[0],
            id: 999001,
            name: 'Oilaviy set (namuna)',
            nameRu: 'Семейный набор (пример)',
            category: 'Setlar',
            price: 199000,
            oldPrice: undefined,
            discount: '',
            stock: 12,
            sizes: [],
            popular: true,
            bundle: parts.map((p, i) => ({ productId: String(p.id), quantity: i + 1, name: p.name })),
          }, ...fbProducts]
        }
        setProducts(fbProducts)
        setLoading(false)
      },
      () => setLoading(false),
    )

    const unsubCats = subscribeToCategories(
      (fbCats) => setCategories(sortCategories(fbCats)),
      () => {},
    )

    let sectionLinkHandled = !DEEP_LINK.sec
    const unsubSections = subscribeToSections((list) => {
      setSections(list)
      // Botdagi «bo'limni ochish» tugmasi — birinchi kelganda bir marta
      if (sectionLinkHandled || !list.length) return
      sectionLinkHandled = true
      const section = list.find((s) => s.id === DEEP_LINK.sec)
      if (section) {
        setCatalogCategory(section.category)
        setCatalogSection(section.id)
      }
    })
    const unsubPromotions = subscribeToPromotions(setPromotions)
    const timer = window.setInterval(() => setClock(Date.now()), 30_000)

    return () => {
      unsubProds()
      unsubCats()
      unsubSections()
      unsubPromotions()
      window.clearInterval(timer)
    }
  }, [catalogAccess])

  /*
   * Do'konlar keldi — token ularni bilishi shart. Boshqa qurilmada kirgan
   * yoki admin hozirgina ulagan bo'lsa, eski tokenda claim yo'q: bir marta
   * majburan yangilanadi.
   */
  useEffect(() => {
    if (!shopKey || DEMO) return
    let alive = true
    void (async () => {
      const ids = shopKey.split('|')
      let claimed = await claimedShops().catch(() => [] as string[])
      if (!ids.every((id) => claimed.includes(id))) claimed = await refreshClaims().catch(() => claimed)
      if (alive && claimed.length > 0) setClaimsFor(shopKey)
    })()
    return () => { alive = false }
  }, [shopKey])

  // Faol do'kon buyurtmalari — shu do'konning hamma akkauntlari bir ro'yxatni ko'radi
  const activeShopId = activeShop?.id ?? null
  useEffect(() => {
    if (!activeShopId || !catalogAccess || DEMO) return
    return subscribeToShopOrders(activeShopId, (list) => setShopOrders({ shopId: activeShopId, list }))
  }, [activeShopId, catalogAccess])
  const myOrders = useMemo(
    () => (activeShopId && shopOrders.shopId === activeShopId ? shopOrders.list : []),
    [activeShopId, shopOrders],
  )
  /**
   * Buyurtmalarning BIRINCHI javobi keldimi — kelguncha skelet («0 ta
   * buyurtma» bir lahza ham ko'rinmasin). Do'kon yo'q bo'lsa — tayyor.
   */
  const ordersReady = activeShopId ? shopOrders.shopId === activeShopId : shopsReady

  /*
   * Savat qurilmalar orasida: profildagi nusxa bir marta tiklanadi
   * (`restored`), o'zgarish esa profilga qayta yoziladi. `lastSent` —
   * oxirgi yuborilgan holat, bir xil ma'lumot ikki marta ketmasin.
   */
  const cartSync = useRef({ restored: false, lastSent: '' })

  // Shaxsiy ma'lumot: faqat Telegram imzosi tekshirilgandan keyin (F-02).
  // Tizimga kirmagan holatda Rules bu kolleksiyalarni bermaydi, shuning
  // uchun umuman obuna bo'lmaymiz.
  useEffect(() => {
    if (DEMO) {
      let alive = true
      void import('../dev/demo').then((demo) => {
        if (!alive) return
        setAuthReady(true)
        setAuthenticated(true)
        setShops(demo.DEMO_SHOPS)
        setShopsReady(true)
        setClaimsFor(demo.DEMO_SHOPS.map((shop) => shop.id).join('|'))
        setProducts(demo.DEMO_PRODUCTS)
        setCategories(demo.DEMO_CATEGORIES)
        setLoading(false)
        setShopOrders({ shopId: demo.DEMO_SHOPS[0].id, list: demo.demoOrders(demo.DEMO_SHOPS[0]) })
      })
      return () => { alive = false }
    }
    ensureSignedIn()

    let unsubShops: (() => void) | undefined
    let unsubProfile: (() => void) | undefined
    let unsubNotifications: (() => void) | undefined
    let unsubBanners: (() => void) | undefined

    const stopAll = () => {
      unsubShops?.()
      unsubProfile?.()
      unsubNotifications?.()
      unsubBanners?.()
      unsubBanners = undefined
      unsubShops = undefined
      unsubProfile = undefined
      unsubNotifications = undefined
    }

    const unsubAuth = onAuthChanged((user) => {
      stopAll()

      if (!user) {
        setAuthReady(true)
        setAuthenticated(false)
        setUserProfile(null)
        setShops([])
        setShopsReady(true)
        setNotifications([])
        setUnreadNotificationsCount(0)
        return
      }

      const userId = Number(user.uid)
      setAuthReady(true)
      setAuthenticated(true)

      setShopsReady(false)
      unsubShops = subscribeToMyShops(
        user.uid,
        (list) => {
          setShops(list)
          setShopsReady(true)
        },
        // O'qib bo'lmadi — kirish ekrani chiqadi, qayta kirish hammasini tiklaydi
        () => setShopsReady(true),
      )
      unsubProfile = subscribeToUserProfile(userId, (profile) => {
        if (profile) setUserProfile(profile as UserProfile)

        /*
         * Profildagi savat — boshqa qurilmada to'ldirilgani. Faqat BIR
         * MARTA va faqat shu qurilmadagi savat bo'sh bo'lsa olinadi:
         * aks holda ochiq turgan savat eski ro'yxat bilan almashardi.
         */
        if (!cartSync.current.restored) {
          cartSync.current.restored = true
          const saved = profile?.cart
          if (Array.isArray(saved) && saved.length > 0) {
            setCartItems((current) => (Object.keys(current).length ? current : fromCartRows(saved)))
          }
        }
      })
      unsubBanners = subscribeToHomeBanners(setHomeBanners)
      unsubNotifications = subscribeToUserNotifications(userId, (notifs) => {
        setNotifications(notifs)
        setUnreadNotificationsCount(notifs.filter((n: Notification) => !n.read).length)
      })
    })

    return () => {
      unsubAuth()
      stopAll()
    }
  }, [])

  // «Buyurtmalar» ochiq — yangilanishlar ko'rildi. Mijoz shu bo'limda turganda
  // kelgan yangi holat ham darhol ko'rilgan hisoblanadi: nishon chiqib o'tirmaydi.
  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (page === 'orders' && unseenOrdersCount > 0 && uid) void markOrderNotificationsAsRead(Number(uid))
  }, [page, unseenOrdersCount])

  // Savat har o'zgarganda saqlanadi (F-14)
  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cartItems))
    } catch (error) {
      console.warn("[Savat] saqlab bo'lmadi:", error)
    }
  }, [cartItems])

  /*
   * Savat profilda ham turadi — telefon almashsa yoki brauzer keshi
   * tozalansa yo'qolmaydi. Profildagi nusxa faqat BIR MARTA va faqat
   * shu qurilmadagi savat bo'sh bo'lsa olinadi: aks holda ochiq turgan
   * savatni boshqa qurilmadagi eski ro'yxat bosib ketardi.
   */
  useEffect(() => {
    if (!cartSync.current.restored || !isAuthenticated) return
    const uid = auth.currentUser?.uid
    if (!uid) return

    const rows = toCartRows(cartItems)
    const payload = JSON.stringify(rows)
    if (payload === cartSync.current.lastSent) return

    // Har bosishda emas — mijoz «−1+» tugmasini tez bossa bitta yozuv
    const timer = setTimeout(() => {
      cartSync.current.lastSent = payload
      updateUserProfile(Number(uid), {
        cart: rows,
        cartUpdatedAt: new Date().toISOString(),
      }).catch((error) => console.warn('[Savat] profilga yozilmadi:', error))
    }, 1500)
    return () => clearTimeout(timer)
  }, [cartItems, isAuthenticated])

  const cartCount = Object.values(cartItems).reduce((total, item) => total + item.quantity, 0)

  const cartTotal = useMemo(() => {
    return Object.entries(cartItems).reduce((sum, [key, item]) => {
      const pId = Number(key.split('_')[0])
      const p = products.find((pr) => String(pr.id) === String(pId))
      return sum + (p ? p.price * item.quantity : 0)
    }, 0)
  }, [cartItems, products])

  const cartProducts = useMemo(() => {
    return Object.entries(cartItems)
      .map(([key, item]) => {
        const pId = Number(key.split('_')[0])
        const p = products.find((pr) => String(pr.id) === String(pId))
        return p ? { product: p, quantity: item.quantity, size: item.size, color: item.color, cartKey: key } : null
      })
      .filter(Boolean) as { product: Product; quantity: number; size?: string; color?: string; cartKey: string }[]
  }, [cartItems, products])

  const searchResults = useMemo(
    () => searchProducts(products, query),
    [query, products],
  )

  /*
   * ── Do'konga kirish va filiallar ──
   *
   * Server kod + telefonni tekshirib akkauntni do'konga bog'laydi va
   * claim'larni yangilaydi; shundan keyin token majburan yangilanadi —
   * katalog shu zahoti ochiladi. Xato bo'lsa — mijoz tilidagi matn.
   */
  const loginShop = useCallback(async (phone: string, code: string): Promise<string | null> => {
    try {
      const result = await apiPost<{ shop: Shop; shops: Shop[] }>('/api/shop', { action: 'login', phone, code })
      await refreshClaims()
      setShops((current) => (current.some((s) => s.id === result.shop.id) ? current : result.shops))
      setSelectedShopId(result.shop.id)
      try { localStorage.setItem(SHOP_KEY, result.shop.id) } catch { /* xotira yopiq */ }
      hapticSuccess()
      return null
    } catch (error) {
      hapticError()
      return apiErrorText(error, t, 'shop.loginFailed', formatPrice)
    }
  }, [t])

  const switchShop = useCallback((shopId: string) => {
    setSelectedShopId(shopId)
    try { localStorage.setItem(SHOP_KEY, shopId) } catch { /* xotira yopiq */ }
    hapticFeedback('medium')
  }, [])

  /** Shu do'kondan chiqish — akkaunt uziladi (kodni qayta kiritib ulanish mumkin). */
  const leaveShop = useCallback(async (shopId: string): Promise<string | null> => {
    try {
      await apiPost('/api/shop', { action: 'leave', shopId })
      await refreshClaims()
      setShops((current) => current.filter((s) => s.id !== shopId))
      return null
    } catch (error) {
      hapticError()
      return apiErrorText(error, t, 'error.saveFailed', formatPrice)
    }
  }, [t])

  /*
   * ── Sahifa qayerdan boshlanadi ──  /*
   * ── Sahifa qayerdan boshlanadi ──
   *
   * Brauzer sahifa almashganda surilish joyini SAQLAB qoladi. Shuning uchun
   * katalogni pastga surib mahsulot ochilganda, mahsulot sahifasi ham o'sha
   * balandlikdan ochilardi: rasm tepada qolib, mijoz uni ko'rish uchun
   * yuqoriga surishga majbur bo'lardi.
   *
   * Endi yangi sahifa doim tepadan boshlanadi, «orqaga» bilan qaytilganda
   * esa ro'yxat mijoz qolgan joyidan ochiladi. `behavior: 'instant'` —
   * silliq surilish yarim yo'lda uzilib qolardi (sahifa allaqachon
   * almashgan bo'lardi), bu yerda esa sakrash ko'rinmaydi.
   */
  const scrollMemory = useRef<Record<string, number>>({})
  const restoreScroll = useRef<number | null>(null)

  const rememberScroll = useCallback((from: AppPage) => {
    scrollMemory.current[from] = window.scrollY
  }, [])

  useLayoutEffect(() => {
    const target = restoreScroll.current ?? 0
    restoreScroll.current = null
    // Yangi sahifa chizilib bo'lgach — aks holda sahifa hali past bo'ladi
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: target, behavior: 'instant' as ScrollBehavior })
    })
    return () => cancelAnimationFrame(frame)
  }, [page, selectedProduct?.id])

  const navigate = useCallback((nextPage: AppPage) => {
    const uid = auth.currentUser?.uid
    if (nextPage === 'notifications' && uid) {
      markNotificationsAsRead(Number(uid))
    }

    setPage((current) => {
      if (current === nextPage) return current
      // Asosiy bo'limga o'tilsa tarix tozalanadi, ichki sahifada esa
      // qayerdan kelganimiz eslab qolinadi.
      setHistory((h) =>
        ROOT_PAGES.includes(nextPage) ? [] : [...h.slice(-19), current],
      )
      return nextPage
    })

    setCartOpen(false)
    setSearchOpen(false)
    // Menyudan kirilgan katalog reklamadagi bo'limga qayta surilmasin
    // («orqaga» bilan qaytilganda esa bo'lim eslab qolinadi — goBack tegmaydi)
    setCatalogSection(null)
    rememberScroll(page)
  }, [page, rememberScroll])

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode)
    storeTheme(mode)
    applyTheme(mode)
    hapticFeedback('light')
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next: ThemeMode = current === 'dark' ? 'light' : 'dark'
      storeTheme(next)
      applyTheme(next)
      return next
    })
    hapticFeedback('light')
  }, [])

  /**
   * Katalogni kategoriya bo'yicha ochadi. Bo'sh kategoriya — «Barchasi».
   * `sectionId` berilsa, katalog o'sha bo'limga surib boriladi.
   */
  const openCategory = useCallback((category: string, sectionId: string | null = null) => {
    setCatalogCategory(category)
    setCatalogSection(sectionId)
    setPage((current) => {
      setHistory(() => (current === 'catalog' ? [] : []))
      return 'catalog'
    })
    setCartOpen(false)
    setSearchOpen(false)
    rememberScroll(page)
    hapticFeedback('light')
  }, [page, rememberScroll])

  /**
   * Orqaga: avval ochiq oyna yopiladi, keyin sahifa tarixi.
   *
   * Ildiz sahifalarda (katalog, sevimlilar, buyurtmalar) tarix ataylab
   * tozalanadi — aks holda pastdagi menyudan yurganda tarix cheksiz
   * o'sib ketardi. Lekin tarix bo'sh bo'lgani orqaga tugmasi ishlamasligi
   * degani emas: bunday holatda bosh sahifaga qaytamiz.
   */
  const goBack = useCallback(() => {
    if (isSearchOpen) {
      setSearchOpen(false)
      return
    }
    if (isCartOpen) {
      setCartOpen(false)
      return
    }
    const back = () => {
    scrollMemory.current[page] = window.scrollY
    setHistory((h) => {
      // Qaytilgan sahifa mijoz qolgan joyidan ochiladi
      const target = h.length === 0 ? 'home' : h[h.length - 1]
      restoreScroll.current = scrollMemory.current[target] ?? 0
      if (h.length === 0) {
        setPage((current) => (current === 'home' ? current : 'home'))
        return h
      }
      setPage(target)
      return h.slice(0, -1)
    })
    }
    if (page === 'detail' && selectedProduct) {
      const target = history.length ? history[history.length - 1] : 'home'
      heroTransition(back, { scrollTop: scrollMemory.current[target] ?? 0, backTo: selectedProduct.id })
    } else back()
  }, [isSearchOpen, isCartOpen, page, history, selectedProduct])

  /** Buyurtma cheki — «Buyurtmalarim» dagi kartochka bosilganda. */
  const openReceipt = useCallback((order: Order) => {
    setSelectedOrder(order)
    setPage((current) => {
      setHistory((h) => [...h.slice(-19), current])
      return 'receipt'
    })
    rememberScroll(page)
    hapticFeedback('light')
  }, [page, rememberScroll])

  const openProduct = useCallback((product: Product) => {
    // Katalogdagi joy eslab qolinadi, mahsulot esa rasmdan — tepadan — ochiladi
    rememberScroll(page)
    hapticFeedback('light')
    heroTransition(() => {
      setSelectedProduct(product)
      setCartOpen(false)
      setPage((current) => {
        setHistory((h) => [...h.slice(-19), current])
        return 'detail'
      })
    }, { scrollTop: 0 })
  }, [page, rememberScroll])

  /** Banner tugmalari uchun: id bo'yicha mahsulot yoki bo'lim ochiladi. */
  const openProductById = useCallback((id: string) => {
    const product = products.find((p) => String(p.id) === id)
    if (product) openProduct(product)
    else openCategory('')
  }, [products, openProduct, openCategory])
  const openSectionById = useCallback((id: string) => {
    const section = sections.find((s) => s.id === id)
    openCategory(section?.category ?? '', section ? id : null)
  }, [sections, openCategory])

  /*
   * Mahsulot havolasi mahsulotlar kelgach bir marta ochiladi (bo'lim
   * havolasi — subscribeToSections ichida). Topilmasa (o'chirilgan) —
   * ilova odatdagidek ochiladi.
   */
  const productLinkHandled = useRef(!DEEP_LINK.product)
  useEffect(() => {
    if (productLinkHandled.current || !products.length) return
    productLinkHandled.current = true
    const product = products.find((p) => String(p.id) === DEEP_LINK.product)
    if (product) openProduct(product)
  }, [products, openProduct])

  const toggleLike = useCallback((id: number) => {
    setLikedIds((current) => {
      const next = current.includes(id) ? current.filter((i) => i !== id) : [...current, id]
      saveLikes(next)
      hapticFeedback('light')
      return next
    })
  }, [])

  const notify = useCallback((message: string) => {
    // Eski taymer bekor qilinadi — aks holda oldingi xabarning
    // taymeri yangisini vaqtidan oldin o'chirib yuborardi.
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }, [])

  const clearToast = useCallback(() => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    setToast(null)
  }, [])

  const addToCart = useCallback((product: Product, size?: string, color?: string) => {
    const s = size || product.sizes?.[0] || 'nosize'
    const c = color || product.color || 'nocolor'
    const key = `${product.id}_${s}_${c}`
    setCartItems((current) => ({
      ...current,
      [key]: {
        quantity: (current[key]?.quantity ?? 0) + 1,
        size: size || product.sizes?.[0],
        color: color || product.color
      }
    }))
    // Bildirishnoma o'rniga so'rov: mijoz savat qayerdaligini
    // qidirib yurmasin, to'g'ridan-to'g'ri rasmiylashtirishga o'ta olsin.
    setCartPrompt(product.name)
    hapticFeedback('medium')
    track('cart_add', product.id)
  }, [])

  /**
   * Kartochkadagi «−/+» ishlaydigan savat kaliti.
   *
   * Kartochkada o'lcham tanlanmaydi, shuning uchun `addToCart` bilan
   * BIR XIL kalit: birinchi o'lcham va asosiy tur. Aks holda «+» boshqa
   * qatorga tushib, kartochkada son o'zgarmay qolardi.
   */
  const defaultCartKey = (product: Product) =>
    `${product.id}_${product.sizes?.[0] || 'nosize'}_${product.color || 'nocolor'}`

  const cartQtyOf = useCallback(
    (product: Product) => cartItems[defaultCartKey(product)]?.quantity ?? 0,
    [cartItems],
  )

  /** Kartochkadan sonni o'zgartirish. 0 ga tushsa mahsulot savatdan chiqadi. */
  const changeCartQty = useCallback((product: Product, delta: number) => {
    const key = defaultCartKey(product)
    setCartItems((current) => {
      const quantity = (current[key]?.quantity ?? 0) + delta
      const next = { ...current }
      if (quantity <= 0) delete next[key]
      else next[key] = { quantity, size: product.sizes?.[0], color: product.color }
      return next
    })
    hapticFeedback('light')
  }, [])

  const updateCartQuantity = useCallback((cartKey: string, nextQuantity: number) => {
    setCartItems((current) => {
      const next = { ...current }
      if (nextQuantity <= 0) delete next[cartKey]
      else next[cartKey] = { ...next[cartKey], quantity: nextQuantity }
      return next
    })
    hapticFeedback('light')
  }, [])

  /**
   * «Rasmiylashtirasizmi?» taklifini yopish.
   *
   * useCallback SHART: CartPrompt 5 soniyalik o'zi-yopilish taymerini shu
   * funksiyaga bog'laydi. Har renderda yangi funksiya bo'lsa, taymer har
   * safar boshidan boshlanib, taklif ekranda uzoq qolib ketardi.
   */
  const dismissCartPrompt = useCallback(() => setCartPrompt(null), [])

  /**
   * «Qayta buyurtma» — eski buyurtmadagi mahsulotlar savatga solinadi.
   *
   * Narx va mavjudlik KATALOGDAN olinadi (buyurtmadagi eski narx emas):
   * o'chirilgan yoki tugagan mahsulot o'tkazib yuboriladi va mijozga
   * aytiladi. Savat darhol ochiladi — ikki bosishda rasmiylashtirish.
   */
  const reorder = useCallback((order: Order) => {
    let added = 0
    let skipped = 0
    const next: CartItems = {}
    for (const line of order.products || []) {
      const product = products.find((p) => p.id === line.product?.id)
      if (!product || product.stock === 0) {
        skipped++
        continue
      }
      const size = line.size || product.sizes?.[0]
      const color = line.color || product.color
      const key = `${product.id}_${size || 'nosize'}_${color || 'nocolor'}`
      const quantity = Math.max(1, Number(line.quantity) || 1)
      next[key] = { quantity: (next[key]?.quantity ?? 0) + quantity, size, color }
      added++
    }
    if (!added) {
      hapticError()
      notify(t('orders.reorderNone'))
      return
    }
    setCartItems((current) => {
      const merged = { ...current }
      for (const [key, item] of Object.entries(next)) {
        merged[key] = { ...item, quantity: (current[key]?.quantity ?? 0) + item.quantity }
      }
      return merged
    })
    hapticSuccess()
    notify(skipped ? t('orders.reorderPartial', { added, skipped }) : t('orders.reorderDone', { count: added }))
    setCartOpen(true)
  }, [products, notify, t])

  // Savat ochildi — unda o'z «Buyurtma berish» tugmasi bor, taklif endi ortiqcha
  const openCart = useCallback(() => {
    setCartOpen(true)
    setCartPrompt(null)
  }, [])
  const closeCart = useCallback(() => setCartOpen(false), [])

  const goToCheckout = useCallback(() => {
    track('checkout_start')
    setCartOpen(false)
    rememberScroll(page)
    // Rasmiylashtirishga o'tildi — taklif vazifasini bajardi, buyurtma sahifasida qolmasin
    setCartPrompt(null)
    setPage((current) => {
      setHistory((h) => [...h.slice(-19), current])
      return 'checkout'
    })
  }, [page, rememberScroll])

  const updateOrderForm = useCallback((field: keyof OrderForm, value: unknown) => {
    setOrderForm((prev) => ({ ...prev, [field]: value }))
  }, [])

  /**
   * Buyurtmani SERVER yaratadi (F-04). Bu yerdan faqat "nimadan nechta"
   * yuboriladi — narx, chegirma va jami serverda qayta hisoblanadi,
   * shuning uchun finalTotal parametri endi kerak emas.
   */
  const submitOrder = useCallback(async (receipt?: ReceiptUpload) => {
    if (isSubmitting) return false

    if (!orderForm.name.trim() || !orderForm.phone.trim()) {
      notify(t('checkout.fillAll'))
      return false
    }
    if (!activeShop) {
      notify(t('error.SHOP_REQUIRED'))
      return false
    }

    if (cartProducts.length === 0) {
      notify(t('checkout.cartEmpty'))
      return false
    }

    if (!orderKeyRef.current) orderKeyRef.current = newOrderKey()

    setSubmitting(true)
    try {
      await apiPost<{ id: string; orderNumber: string; total: number }>('/api/orders', {
        clientOrderId: orderKeyRef.current,
        shopId: activeShop.id,
        // Kanal e'loni / ommaviy xabardan kelgan bo'lsa — natija o'sha e'longa yoziladi
        source: currentCampaign(),
        items: cartProducts.map(({ product, quantity, size, color }) => ({
          productId: product.id,
          quantity,
          size,
          color,
        })),
        customer: {
          name: orderForm.name.trim(),
          phone: orderForm.phone.trim(),
          comment: orderForm.comment,
          paymentMethod: orderForm.paymentMethod,
          // Buyurtmani boshqa odam oladigan bo'lsa
          recipientName: orderForm.recipientName?.trim() || '',
          recipientPhone: orderForm.recipientPhone?.trim() || '',
        },
        promoCode: orderForm.promoCode,
        // Karta (o'tkazma) — to'lov cheki rasmi (buyurtma u bilan birga yaratiladi)
        ...(orderForm.paymentMethod === 'Karta' && receipt ? { receipt } : {}),
      })
    } catch (error) {
      // Buyurtma yaratilmadi — savat SAQLANIB qoladi (F-05)
      console.error('[Buyurtma] yuborilmadi:', error)
      hapticError()
      notify(apiErrorText(error, t, 'checkout.failed', formatPrice))
      return false
    } finally {
      setSubmitting(false)
    }

    orderKeyRef.current = null
    setCartItems({})
    setOrderForm({
      name: '', phone: '', address: '', location: null, comment: '',
      // Keyingi safar ham shu usul tursin (naqd / karta)
      paymentMethod: orderForm.paymentMethod === 'Karta' ? 'Karta' : 'Naqd',
    })

    setCheckoutDone(true)
    hapticSuccess()
    notify(t('checkout.success'))
    // O'zi yopiladi, lekin tugma bosilsa — darhol (dismissCheckout)
    if (checkoutTimer.current) clearTimeout(checkoutTimer.current)
    checkoutTimer.current = setTimeout(() => setCheckoutDone(false), 6000)

    return true
  }, [isSubmitting, orderForm, cartProducts, activeShop, notify, t])

  return {
    page, history,
    // Bosh sahifadan boshqa har qanday sahifada orqaga qaytish mumkin —
    // shuning uchun Telegram'ning o'z orqaga tugmasi ham ko'rinib turadi.
    canGoBack: page !== 'home' || history.length > 0 || isCartOpen || isSearchOpen,
    products, categories, sections, loading, runningPromotions, clock,
    cartItems, cartCount, cartTotal, cartProducts,
    likedIds, selectedProduct,
    isSearchOpen, isCartOpen, query, searchResults, toast, cartPrompt,
    myOrders, ordersReady, checkoutDone, dismissCheckout, reorder,
    isSubmitting, authReady, isAuthenticated, orderForm, userProfile,
    notifications, unreadNotificationsCount, unseenOrdersCount,
    catalogCategory, catalogSection, openCategory, homeBanners, openProductById, openSectionById,
    theme, setTheme, toggleTheme,
    navigate, goBack, openProduct, toggleLike, openReceipt, selectedOrder,
    shops, shopsReady, activeShop, catalogAccess, loginShop, switchShop, leaveShop,
    setSearchOpen, setQuery,
    addToCart, updateCartQuantity, cartQtyOf, changeCartQty,
    openCart, closeCart, goToCheckout,
    updateOrderForm, submitOrder,
    notify, clearToast,
    dismissCartPrompt,
  }
}
