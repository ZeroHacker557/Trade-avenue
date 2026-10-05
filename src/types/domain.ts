export type AppPage =
  | 'home' | 'catalog' | 'favorites' | 'orders' | 'profile'
  | 'detail' | 'checkout' | 'addresses' | 'profile_edit'
  | 'notifications' | 'language' | 'support' | 'receipt'

/**
 * Set tarkibidagi bitta qator. Katalogda `productId` bor; buyurtmada esa
 * nomi saqlanadi (mahsulot keyin o'chirilsa ham chekda ko'rinsin).
 */
export type BundleLine = { productId?: string; quantity: number; name?: string }

export type Product = {
  id: number
  name: string
  price: number
  oldPrice?: number
  /**
   * Set (to'plam) bo'lsa — ichidagi mahsulotlar. Narx setning o'z narxi
   * (`price`), tarkib unga ta'sir qilmaydi.
   */
  bundle?: BundleLine[]
  /** Ilovada hisoblanadi: tarkibdagi mahsulotlar (joriy ma'lumot bilan). */
  bundleItems?: { product: Product; quantity: number }[]
  /** Ilovada hisoblanadi: tarkibni alohida sotib olsa qancha bo'lardi. */
  bundleValue?: number
  category: string
  color?: string
  colors?: string[]
  rating: number
  reviews: number
  /** Tarjimalar — bo'sh bo'lsa o'zbekcha `name` / `description` ko'rsatiladi. */
  nameRu?: string
  /**
   * Asl o'zbekcha nom. Ruscha ko'rinishda `name` tarjimaga almashadi
   * (use-shop-store.ts), asl nom esa qidiruvda kerak bo'ladi.
   */
  nameUz?: string
  descriptionUz?: string
  /** Kategoriyaning ruscha nomi — faqat qidiruv uchun. */
  categoryRu?: string
  nameEn?: string
  descriptionRu?: string
  descriptionEn?: string
  /** Hozir amal qilayotgan vaqtli aksiya (ilovada hisoblanadi). */
  promotion?: { id: string; title: string; percent: number; endsAt: string } | null
  /**
   * O'ram (quti) — mahsulot shuncha donadan sotiladi, masalan ichimlik blokda 6 tadan.
   * Bazada `price` va `stock` DONA hisobida (Linko shunday beradi); mini
   * app yuklashda narxni o'ramga ko'paytiradi, qoldiqni o'ramga bo'ladi.
   * 1 yoki yo'q — oddiy mahsulot.
   */
  pack?: number
  /** `false` — admin o'chirgan: mijozlarga ko'rinmaydi, buyurtma qilib bo'lmaydi. Yo'q — faol. */
  active?: boolean
  /** Mini app: bitta donaning narxi (o'ramli mahsulotda). */
  unitPrice?: number
  images: string[]
  /**
   * Siqilgan nusxalar — `images` bilan bir xil tartibda.
   *   thumbs    — ~480px WebP: kartochka, savat, ro'yxatlar
   *   optimized — ~1200px WebP: mahsulot sahifasi
   * Bo'sh satr yoki yo'q bo'lsa asl `images[i]` ishlatiladi
   * (utils/product-image.ts). Asl rasm kattalashtirish uchun saqlanadi.
   */
  thumbs?: string[]
  optimized?: string[]
  /**
   * Nusxalar QAYSI asl rasmlardan yasalgani. Nusxa faqat
   * `variantSources[i] === images[i]` bo'lsa ishlatiladi — rasm
   * almashtirilgan-u nusxa yangilanmagan bo'lsa, eski mahsulot rasmi
   * ko'rinib qolmasin.
   */
  variantSources?: string[]
  description?: string
  discount?: string
  sizes?: string[]
  /** Ombordagi qoldiq. undefined — hisob yuritilmaydi (eski mahsulotlar). */
  stock?: number
  /** Ro'yxatdagi tartib — admin panelda belgilanadi. Kichik raqam oldinda. */
  order?: number
  /** Kategoriya ichidagi bo'lim (masalan «Coca-Cola», «Pepsi»). */
  sectionId?: string | null
  /** Bosh sahifadagi «Mashhur mahsulotlar» qatorida ko'rsatiladi. */
  popular?: boolean
}

/**
 * Bo'lim — kategoriya ichidagi guruh.
 *
 * Katalogda sarlavha bo'lib chiqadi va ostida unga biriktirilgan
 * mahsulotlar turadi. Kategoriyaga NOM bo'yicha bog'lanadi — mahsulotlar
 * ham kategoriyaga shunday bog'langan.
 */
export type Section = {
  id: string
  name: string
  /** Ruscha nomi — bo'sh bo'lsa o'zbekchasi ko'rsatiladi. */
  nameRu?: string
  category: string
  order?: number
}

export type Category = {
  id: number
  /** Filtr kaliti — mahsulotdagi `category` bilan aynan bir xil. */
  name: string
  /** Ruscha nomi — faqat ko'rsatish uchun, filtrga ta'sir qilmaydi. */
  nameRu?: string
  icon: string
  image?: string
  /** Ro'yxatdagi tartib — admin panelda belgilanadi. */
  order?: number
}

export type OrderStatus =
  | 'Yangi' | 'Qabul qilindi' | 'Yetkazilmoqda' | 'Yetkazildi' | 'Bekor qilingan' | 'Rad etildi'

export type Order = {
  /** Firestore hujjat identifikatori — barcha texnik havolalar shu bo'yicha. */
  id: string
  /** Foydalanuvchiga ko'rsatiladigan ketma-ket raqam, masalan "#1042". */
  orderNumber: string
  /** Toshkent bo'yicha kun «2026-09-23» — raqam har kuni #0001 dan boshlanadi. */
  orderDay?: string | null
  /** Karta (o'tkazma) — mijoz yuklagan to'lov cheki. */
  receipt?: { url: string; uploadedAt?: string } | null
  /** ISO 8601. Saralash va sana ko'rsatish shu maydondan. */
  createdAt: string
  products: { product: Product; quantity: number; size?: string; color?: string; cartKey?: string }[]
  /** Mahsulotlar jami (chegirmasiz, yetkazishsiz). */
  subtotal?: number
  discount?: number
  discountPercent?: number
  promoCode?: string | null
  deliveryFee?: number
  /** Yakuniy summa: subtotal - discount + deliveryFee. */
  total: number
  status: OrderStatus
  paymentMethod?: 'Naqd' | 'Karta'
  paymentStatus?: 'Tolangan' | 'Kutilmoqda' | 'Rad etildi' | 'Qaytarildi' | 'Tekshirish kerak'
  paidAt?: string | null
  cancelReason?: string | null
  customer: OrderForm
  userId?: number
  username?: string
  /** Bot bu buyurtmani adminga yuborganmi (F-21). */
  notified?: boolean
  /** Eski yozuvlarda formatlangan sana matni bo'lishi mumkin. */
  date?: string
  /** Kuryer (server yozadi). */
  courierId?: string | null
  courierName?: string | null
  courierPhone?: string | null
  takenAt?: string | null
  /** Taxminiy yetib kelish vaqti — kuryer olganda joylashuvidan (admin xaritasi). */
  etaAt?: string | null
  etaMinutes?: number | null
  /** Kuryer «Yetib keldim» bosgan vaqt. */
  arrivedAt?: string | null
  deliveredAt?: string | null
}

/** Firestore'ga yozishdan oldingi buyurtma — id va raqam server tomonda beriladi. */
export type NewOrder = Omit<Order, 'id' | 'orderNumber' | 'createdAt' | 'notified'>

export type PaymentSettings = {
  cardNumber: string
  cardOwner: string
  /** Karta orqali to'lov (o'tkazma) yoqilganmi — admin → Sozlamalar. Yo'q — yoqilgan. */
  transfer?: boolean
}

export type DeliverySettings = {
  /** Yetkazib berish narxi, so'mda. */
  fee: number
  /** Shu summadan yuqori buyurtmalar bepul yetkaziladi. 0 — bepul yetkazish yo'q. */
  freeFrom: number
  /** Minimal buyurtma summasi. 0 — cheklov yo'q. */
  minOrder: number
}

export type OrderForm = {
  name: string
  phone: string
  address: string
  location: { lat: number; lng: number } | null
  comment: string
  paymentMethod: 'Naqd' | 'Karta'
  promoCode?: string
  /**
   * Buyurtmani boshqa odam oladigan bo'lsa — uning ismi va raqami.
   *
   * Ko'pincha buyurtmani uydagilar yoki qo'shni qabul qiladi. Kuryer
   * kimga topshirishini va kim bilan bog'lanishini bilishi kerak.
   */
  recipientName?: string
  recipientPhone?: string
}

export type ProductActions = {
  onOpen: (product: Product) => void
  onAddToCart: (product: Product, size?: string, color?: string) => void
  /** Savatdagi soni — kartochkadagi «−/+» shu bo'yicha chiziladi. */
  cartQtyOf: (product: Product) => number
  /** Kartochkadan sonni o'zgartirish (+1 / −1). */
  onChangeQty: (product: Product, delta: number) => void
  likedIds: number[]
  onToggleLike: (id: number) => void
}

export type CartItem = {
  productId: number
  quantity: number
}

export type Address = {
  id: string
  name: string
  address: string
  location: { lat: number; lng: number }
}

export type UserProfile = {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  phone?: string
  addresses: Address[]
  /** Tanlangan til — qurilmalar orasida sinxron bo'lishi uchun. */
  language?: 'uz' | 'ru'
  /**
   * Savat — qurilmalar orasida saqlanishi uchun profilda ham turadi.
   *
   * MASSIV, xarita emas: savat kaliti `id_o'lcham_rang` ko'rinishida
   * bo'lib, ichida nuqta yoki bo'sh joy bo'lishi mumkin — bunday nom
   * Firestore maydoni sifatida noqulay.
   */
  cart?: CartRow[]
  /** Savat oxirgi marta qachon o'zgargani — bot tashlab ketilgan savatni shu bo'yicha topadi. */
  cartUpdatedAt?: string
  /**
   * Admin panelda kuryer qilib qo'shilgan — ilova kuryer sahifasini
   * ochadi. Faqat server yozadi (api/_lib/courier-staff.ts).
   */
  courier?: boolean
}

/** Profilda saqlanadigan savat qatori. */
export type CartRow = {
  /** `${productId}_${size}_${color}` — ilovadagi savat kaliti. */
  key: string
  quantity: number
  size?: string
  color?: string
}

export type Notification = {
  id: string
  userId: number
  title: string
  body: string
  date: string
  read: boolean
  type: 'order' | 'system' | 'promo'
  /** Buyurtma bildirishnomasida — qaysi buyurtma (eski yozuvlarda yo'q). */
  orderId?: string
  /** Ommaviy xabardagi rasm. */
  image?: string
}

export type PromoCode = {
  id: string
  code: string
  discountPercent: number
  active: boolean
  usageCount: number
}
