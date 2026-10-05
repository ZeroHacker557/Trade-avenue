import type { VercelRequest, VercelResponse } from '@vercel/node'
import { LOW_STOCK_AT, bumpOrdersSignal, notifyLowStock, notifyNewOrder } from './_lib/actions/orders.js'
import { pushOrderSafe } from './_lib/actions/linko-orders.js'
import { readReceipt, uploadReceipt } from './_lib/receipts.js'
import { adminAuth, adminDb } from './_lib/firebase-admin.js'
import { fail, requirePost } from './_lib/http.js'
import { isSource } from './_lib/campaigns.js'
import { bestPromotion, promoPrice, readPromotion } from './_lib/promotions.js'
import { formatDailyNumber, tashkentDay } from './_lib/order-number.js'
import { formatPhone, readShop, shopOpen, shopPhones, type ShopDoc } from './_lib/shops.js'

type IncomingItem = {
  productId: number | string
  quantity: number
  size?: string
  color?: string
}

type IncomingOrder = {
  /** Qaysi do'kon nomidan (foydalanuvchi bir nechta do'konga ulangan bo'lishi mumkin). */
  shopId: string
  items: IncomingItem[]
  customer: {
    name: string
    phone: string
    address: string
    location: { lat: number; lng: number } | null
    comment: string
    paymentMethod: 'Naqd' | 'Karta'
    /** Buyurtmani boshqa odam oladigan bo'lsa. */
    recipientName?: string
    recipientPhone?: string
  }
  promoCode?: string
  /** Takroriy buyurtmani to'sish uchun mijoz yaratadigan noyob kalit. */
  clientOrderId?: string
  /** Mijoz qaysi kanal e'loni / ommaviy xabardan kelgan (campaigns.ts). */
  source?: string
}

/** Mijoz yuborgan ma'lumotni tozalaymiz — narx, jami va status bu yerdan kelmaydi. */
function readOrder(body: unknown): IncomingOrder {
  const b = body as Partial<IncomingOrder> | undefined
  const items = Array.isArray(b?.items) ? b.items : []
  if (items.length === 0) throw new Error("Savat bo'sh")
  if (items.length > 50) throw new Error("Savatda juda ko'p mahsulot")

  const customer = b?.customer
  if (!customer) throw new Error("Mijoz ma'lumoti yo'q")

  const shopId = String(b?.shopId || '').trim()
  if (!shopId) throw new Error('SHOP_REQUIRED')

  // Mas'ul shaxs (buyurtma bergan odam). Manzil — do'konniki, serverda qo'yiladi.
  const name = String(customer.name || '').trim()
  const phone = String(customer.phone || '').trim()
  if (!name || !phone) throw new Error("Ism va telefon to'ldirilishi shart")

  const paymentMethod = customer.paymentMethod === 'Karta' ? 'Karta' : 'Naqd'

  return {
    shopId: shopId.slice(0, 80),
    items: items.map((item) => {
      const quantity = Math.floor(Number(item.quantity))
      if (!Number.isFinite(quantity) || quantity < 1 || quantity > 99) {
        throw new Error("Mahsulot miqdori noto'g'ri")
      }
      return {
        productId: item.productId,
        quantity,
        size: item.size ? String(item.size).slice(0, 40) : undefined,
        color: item.color ? String(item.color).slice(0, 40) : undefined,
      }
    }),
    customer: {
      name: name.slice(0, 120),
      phone: phone.slice(0, 40),
      // Do'kon manzili bilan almashtiriladi (pastda)
      address: '',
      location: null,
      comment: String(customer.comment || '').slice(0, 500),
      paymentMethod,
      recipientName: String(customer.recipientName || '').trim().slice(0, 120),
      recipientPhone: String(customer.recipientPhone || '').trim().slice(0, 40),
    },
    promoCode: b?.promoCode ? String(b.promoCode).trim().toUpperCase().slice(0, 40) : undefined,
    clientOrderId: b?.clientOrderId ? String(b.clientOrderId).slice(0, 64) : undefined,
    source: isSource(b?.source) ? b.source : undefined,
  }
}

/**
 * POST /api/orders
 * Authorization: Bearer <Firebase ID token>
 *
 * Buyurtmani SERVER yaratadi. Mijoz faqat qaysi mahsulotdan nechta
 * olishini aytadi — narx, chegirma va jami Firestore'dagi haqiqiy
 * qiymatlardan qayta hisoblanadi (F-04, F-18).
 */
/** O'ramdagi dona soni (setda — 1). Mini app: src/lib/firebase.ts → packOf. */
function packOf(data: FirebaseFirestore.DocumentData): number {
  if (Array.isArray(data.bundle) && data.bundle.length) return 1
  const n = Math.floor(Number(data.pack))
  return Number.isFinite(n) && n > 1 ? Math.min(n, 1000) : 1
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requirePost(req, res)) return

  // ── Kim so'rayapti ─────────────────────────────────────────
  const authHeader = String(req.headers.authorization || '')
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!idToken) return fail(res, 401, 'Avtorizatsiya talab qilinadi')

  let uid: string
  try {
    const decoded = await (await adminAuth()).verifyIdToken(idToken)
    uid = decoded.uid
  } catch {
    return fail(res, 401, 'Sessiya eskirgan, ilovani qayta oching')
  }

  let order: IncomingOrder
  try {
    order = readOrder(req.body)
  } catch (error) {
    if (error instanceof Error && error.message === 'SHOP_REQUIRED') {
      return fail(res, 400, 'Do‘kon tanlanmagan', 'SHOP_REQUIRED')
    }
    return fail(res, 400, error instanceof Error ? error.message : "Ma'lumot noto'g'ri")
  }

  const db = await adminDb()
  const userId = Number(uid)

  /*
   * Do'kon: foydalanuvchi unga ulangan va do'kon ochiq bo'lishi shart.
   * Manba — shops.memberIds (admin uzgan bo'lsa darhol kuchga kiradi).
   */
  const shopSnap = await db.collection('shops').doc(order.shopId).get()
  const shop: ShopDoc | null = shopSnap.exists ? readShop(shopSnap.id, shopSnap.data()) : null
  if (!shop || !shop.memberIds.includes(uid)) return fail(res, 403, 'Siz bu do‘konga ulanmagansiz', 'SHOP_NOT_MEMBER')
  if (!shopOpen(shop)) return fail(res, 403, 'Do‘kon vaqtincha bloklangan', 'SHOP_BLOCKED')
  order.customer.address = shop.address || shop.name
  order.customer.location = shop.location

  /*
   * Karta (o'tkazma): to'lov cheki buyurtma bilan BIRGA keladi — mijoz
   * «Buyurtma berish» ni bosganda chekni yuklaydi, shundan keyingina
   * buyurtma yaratiladi va adminga chek rasmi bilan boradi.
   */
  let receiptUrl: string | null = null
  if (order.customer.paymentMethod === 'Karta') {
    // Admin karta orqali to'lovni o'chirgan (yoki karta kiritilmagan) bo'lsa
    const pay = (await (await adminDb()).collection('settings').doc('payment').get()).data() ?? {}
    if (pay.transfer === false || !String(pay.cardNumber || '').trim()) {
      return fail(res, 400, 'Karta orqali to‘lov hozircha mavjud emas', 'TRANSFER_DISABLED')
    }
    const receipt = readReceipt(req.body?.receipt)
    if (!receipt) return fail(res, 400, 'To‘lov chekini yuklang', 'RECEIPT_REQUIRED')
    try {
      receiptUrl = await uploadReceipt(userId, receipt)
    } catch (error) {
      console.error('[orders] chek saqlanmadi:', error)
      return fail(res, 502, 'Chekni saqlab bo‘lmadi, qayta urinib ko‘ring', 'RECEIPT_UPLOAD')
    }
  }
  try {
    const result = await db.runTransaction(async (tx) => {
      // ── 1. O'qishlar (transaction'da hamma o'qish yozishdan oldin) ──
      const productRefs = order.items.map((item) =>
        db.collection('products').doc(String(item.productId)),
      )
      const productSnaps = await tx.getAll(...productRefs)

      const createdAt = new Date()
      const orderDay = tashkentDay(createdAt)
      const counterRef = db.collection('counters').doc(`orders-${orderDay}`)
      const counterSnap = await tx.get(counterRef)

      const userRef = db.collection('users').doc(uid)
      const userSnap = await tx.get(userRef)

      const deliveryRef = db.collection('settings').doc('delivery')
      const deliverySnap = await tx.get(deliveryRef)

      // Vaqtli aksiyalar — narx faqat shu yerda, Firestore'dagi holatdan
      const promoSnap = await tx.get(db.collection('promotions').where('active', '==', true))
      const promotions = promoSnap.docs.map((doc) => readPromotion(doc.id, doc.data()))
      const now = Date.now()

      // Takroriylikni to'sish: xuddi shu kalit bilan buyurtma allaqachon
      // yaratilgan bo'lsa, yangisini yaratmay o'shani qaytaramiz. Sekin
      // internetda javob yo'qolib, mijoz qayta bosganda ham bitta buyurtma
      // qoladi.
      if (order.clientOrderId) {
        const existing = await tx.get(
          db.collection('orders').where('clientOrderId', '==', order.clientOrderId).limit(1),
        )
        if (!existing.empty) {
          const doc = existing.docs[0]
          const data = doc.data()
          return {
            id: doc.id,
            orderNumber: String(data.orderNumber || ''),
            total: Number(data.total) || 0,
            discount: Number(data.discount) || 0,
            deliveryFee: Number(data.deliveryFee) || 0,
            duplicate: true,
          }
        }
      }

      let promoRef: FirebaseFirestore.DocumentReference | null = null
      let promoData: FirebaseFirestore.DocumentData | null = null
      if (order.promoCode) {
        const promoQuery = await tx.get(
          db.collection('promocodes').where('code', '==', order.promoCode).limit(1),
        )
        if (promoQuery.empty) throw new Error('PROMO_NOT_FOUND')
        promoRef = promoQuery.docs[0].ref
        promoData = promoQuery.docs[0].data()
      }

      // ── 2. Narx va ombor qoldig'ini tekshirish ─────────────
      // Bir mahsulot savatda bir necha variant (o'lcham/rang) bilan
      // turishi mumkin — qoldiqni umumiy miqdor bo'yicha tekshiramiz.
      const requestedByProduct = new Map<string, number>()
      order.items.forEach((item) => {
        const key = String(item.productId)
        requestedByProduct.set(key, (requestedByProduct.get(key) || 0) + item.quantity)
      })

      const stockUpdates: { ref: FirebaseFirestore.DocumentReference; stock: number }[] = []
      // Qoldig'i tugab qolganlar — tranzaksiyadan keyin adminlarga aytiladi
      const lowStock: { id: string; name: string; stock: number }[] = []
      const seenProducts = new Set<string>()

      const products = order.items.map((item, i) => {
        const snap = productSnaps[i]
        if (!snap.exists) throw new Error('PRODUCT_GONE')
        const data = snap.data() as FirebaseFirestore.DocumentData
        // Admin o'chirgan (yashirgan) mahsulot — savatda qolib ketgan bo'lsa ham sotilmaydi
        if (data.active === false) throw new Error('PRODUCT_GONE')

        // O'ram: narx va qoldiq bazada DONADA, mijoz o'ramni oladi (src/lib/firebase.ts bilan bir xil)
        const pack = packOf(data)
        const basePrice = Number(data.price) * pack
        if (!Number.isFinite(basePrice) || basePrice <= 0) throw new Error('PRODUCT_PRICE')

        const promo = bestPromotion(
          promotions,
          { id: snap.id, category: String(data.category || ''), sectionId: data.sectionId ? String(data.sectionId) : null },
          now,
        )
        const price = promo ? promoPrice(basePrice, promo.percent) : basePrice

        const key = String(item.productId)
        if (!seenProducts.has(key) && typeof data.stock === 'number') {
          seenProducts.add(key)
          const requested = (requestedByProduct.get(key) || 0) * pack
          if (data.stock < requested) {
            throw new Error(data.stock <= 0 ? 'OUT_OF_STOCK' : 'NOT_ENOUGH_STOCK')
          }
          const left = data.stock - requested
          stockUpdates.push({ ref: snap.ref, stock: left })
          if (left <= LOW_STOCK_AT) {
            lowStock.push({ id: snap.id, name: String(data.name || ''), stock: left })
          }
        }

        return {
          product: {
            id: Number(data.id ?? snap.id),
            // O'ramli mahsulot nomida dona soni — chek, xabar, kuryer, nakladnoyda shu ko'rinadi
            name: pack > 1 ? `${String(data.name || '')} (${pack} dona)` : String(data.name || ''),
            price,
            ...(pack > 1 ? { pack } : {}),
            // Aksiya bo'lsa — asl narx va qaysi aksiya, hisobot va chek uchun
            ...(promo ? { originalPrice: basePrice, promotion: { id: promo.id, title: promo.title, percent: promo.percent } } : {}),
            images: Array.isArray(data.images) ? data.images : [],
            // Buyurtmalar ro'yxatida kichik nusxa ko'rsatiladi
            thumbs: Array.isArray(data.thumbs) ? data.thumbs : [],
            variantSources: Array.isArray(data.variantSources) ? data.variantSources : [],
            category: String(data.category || ''),
            // Set — tarkibi nomlari bilan (chek, kuryer va admin nimani yig'ishni ko'rsin)
            ...(Array.isArray(data.bundle) && data.bundle.length
              ? {
                  bundle: (data.bundle as { name?: unknown; quantity?: unknown }[]).map((b) => ({
                    name: String(b?.name || ''),
                    quantity: Number(b?.quantity) || 1,
                  })),
                }
              : {}),
          },
          quantity: item.quantity,
          size: item.size ?? null,
          color: item.color ?? null,
        }
      })

      const subtotal = products.reduce((sum, p) => sum + p.product.price * p.quantity, 0)

      // ── 3. Promokod ────────────────────────────────────────
      let discountPercent = 0
      let appliedPromo: string | null = null

      if (promoData && promoRef) {
        if (promoData.active === false) throw new Error('PROMO_INACTIVE')

        const expiresAt = promoData.expiresAt ? Date.parse(String(promoData.expiresAt)) : NaN
        if (!Number.isNaN(expiresAt) && expiresAt < Date.now()) throw new Error('PROMO_EXPIRED')

        const maxUses = Number(promoData.maxUses)
        const usageCount = Number(promoData.usageCount) || 0
        if (Number.isFinite(maxUses) && maxUses > 0 && usageCount >= maxUses) {
          throw new Error('PROMO_USED_UP')
        }

        const usedBy: unknown[] = Array.isArray(promoData.usedBy) ? promoData.usedBy : []
        if (usedBy.includes(userId) || usedBy.includes(uid)) throw new Error('PROMO_ALREADY_USED')

        const minOrderTotal = Number(promoData.minOrderTotal) || 0
        if (subtotal < minOrderTotal) throw new Error('PROMO_MIN_TOTAL')

        discountPercent = Math.min(Math.max(Number(promoData.discountPercent) || 0, 0), 100)
        appliedPromo = String(promoData.code || order.promoCode)
      }

      const discount = Math.round((subtotal * discountPercent) / 100)
      const discountedSubtotal = Math.max(subtotal - discount, 0)

      // ── 4. Yetkazib berish narxi ───────────────────────────
      const delivery = deliverySnap.exists ? deliverySnap.data() : null

      /*
       * Minimal buyurtma summasi. Sozlanmagan yoki 0 bo'lsa — cheklov
       * umuman yo'q, ilova avvalgidek ishlayveradi. Tekshiruv promokod
       * chegirmasidan OLDINGI summa bo'yicha: chegirma do'kon bergan
       * imtiyoz, u minimalni buzmasligi kerak.
       */
      const minOrder = Math.max(Number(delivery?.minOrder) || 0, 0)
      if (minOrder > 0 && subtotal < minOrder) {
        throw new Error(`MIN_ORDER:${minOrder}`)
      }

      const deliveryFee = Math.max(Number(delivery?.fee) || 0, 0)
      const freeFrom = Math.max(Number(delivery?.freeFrom) || 0, 0)
      const appliedDelivery = freeFrom > 0 && discountedSubtotal >= freeFrom ? 0 : deliveryFee

      const total = discountedSubtotal + appliedDelivery

      // ── 5. Yozishlar ───────────────────────────────────────
      const dailyNumber = (counterSnap.exists ? Number(counterSnap.data()?.value) || 0 : 0) + 1
      const orderNumber = formatDailyNumber(dailyNumber)
      tx.set(counterRef, { value: dailyNumber, day: orderDay }, { merge: true })

      if (promoRef) {
        const usedBy = Array.isArray(promoData?.usedBy) ? promoData.usedBy : []
        tx.update(promoRef, {
          usageCount: (Number(promoData?.usageCount) || 0) + 1,
          usedBy: [...usedBy, userId],
        })
      }

      // Ombor qoldig'ini kamaytiramiz — buyurtma bilan bir transactionda
      stockUpdates.forEach(({ ref, stock }) => tx.update(ref, { stock }))

      const userData = userSnap.data() || {}
      const orderRef = db.collection('orders').doc()

      tx.set(orderRef, {
        orderNumber,
        orderDay,
        dailyNumber,
        createdAt: createdAt.toISOString(),
        products,
        subtotal,
        discount,
        discountPercent,
        promoCode: appliedPromo,
        deliveryFee: appliedDelivery,
        total,
        status: 'Yangi',
        paymentMethod: order.customer.paymentMethod,
        paymentStatus: order.customer.paymentMethod === 'Naqd' ? null : 'Kutilmoqda',
        // Karta (o'tkazma) — mijoz yuklagan to'lov cheki
        receipt: receiptUrl ? { url: receiptUrl, uploadedAt: new Date().toISOString() } : null,
        customer: { ...order.customer, promoCode: appliedPromo },
        // Do'kon — buyurtma shu nomidan; nusxa: keyin o'zgarsa ham chekda shu qoladi
        shopId: shop.id,
        shop: {
          id: shop.id,
          name: shop.name,
          address: shop.address,
          location: shop.location,
          phones: shopPhones(shop).map(formatPhone),
          linkoId: shop.linkoId,
          agentId: shop.agentId,
          agentName: shop.agentName,
          priceListId: shop.priceListId,
        },
        clientOrderId: order.clientOrderId ?? null,
        source: order.source ?? null,
        userId,
        username: userData.username ?? null,
        notified: false,
      })

      return {
        id: orderRef.id,
        orderNumber,
        total,
        discount,
        deliveryFee: appliedDelivery,
        duplicate: false,
        lowStock,
      }
    })

    // Xodimlarga xabar — javobni kutmasdan emas, ATAYLAB kutib.
    // Serverless funksiya javob qaytargach to'xtaydi va "orqa fonda"
    // boshlangan ish bajarilmay qolishi mumkin.
    if (!result.duplicate) {
      const snap = await db.collection('orders').doc(result.id).get()
      await notifyNewOrder(result.id, snap.data() || {})
      // Kuryer ilovalari (smenadagilar) ro'yxatni yangilaydi
      await bumpOrdersSignal()
      // Ombor signali — buyurtma xabarnomasidan keyin, alohida xabar
      await notifyLowStock(result.lowStock ?? [])
      /*
       * Linko'ga yuborish — sozlamada yoqilgan bo'lsa. Xato tashlamaydi:
       * tashqi tizim ishlamayotgani mijozning buyurtmasini buzmasligi kerak,
       * yuborilmagani buyurtmada belgilanadi va paneldan qayta yuboriladi.
       */
      await pushOrderSafe(result.id, snap.data() || {})
    }

    // `lowStock` faqat ichki ish uchun — mijozga qaytarilmaydi
    return res.status(200).json({
      id: result.id,
      orderNumber: result.orderNumber,
      total: result.total,
      discount: result.discount,
      deliveryFee: result.deliveryFee,
      duplicate: result.duplicate,
    })
  } catch (error) {
    const raw = error instanceof Error ? error.message : ''

    // MIN_ORDER:150000 — summa xabarga ham, ilovaga ham kerak
    if (raw.startsWith('MIN_ORDER:')) {
      const amount = Number(raw.split(':')[1]) || 0
      return fail(
        res,
        400,
        `Minimal buyurtma summasi ${amount.toLocaleString('uz-UZ')} so'm`,
        'MIN_ORDER',
        { amount },
      )
    }

    const code = raw
    const messages: Record<string, string> = {
      PRODUCT_GONE: 'Savatdagi mahsulotlardan biri endi mavjud emas',
      SHOP_REQUIRED: 'Do‘kon tanlanmagan',
      PRODUCT_PRICE: "Mahsulot narxi noto'g'ri, adminga murojaat qiling",
      PROMO_NOT_FOUND: 'Bunday promokod topilmadi',
      PROMO_INACTIVE: 'Promokod faol emas',
      PROMO_EXPIRED: 'Promokod muddati tugagan',
      PROMO_USED_UP: 'Promokoddan foydalanish chegarasi tugagan',
      PROMO_ALREADY_USED: 'Siz bu promokoddan allaqachon foydalangansiz',
      PROMO_MIN_TOTAL: 'Bu promokod uchun buyurtma summasi yetarli emas',
      OUT_OF_STOCK: 'Savatdagi mahsulotlardan biri sotuvda qolmadi',
      NOT_ENOUGH_STOCK: 'Omborda yetarli miqdor yo‘q, savatdagi sonni kamaytiring',
    }
    if (messages[code]) return fail(res, 400, messages[code], code)

    console.error('[orders] xato:', error)
    return fail(res, 500, "Buyurtma yaratilmadi, qayta urinib ko'ring")
  }
}
