import type { Category, Order, Product, Shop } from '../types/domain'

/*
 * FAQAT dev rejimi uchun soxta ma'lumot (`?demo`). Do'konga kirgandan
 * keyingi ekranlarni Telegram va serversiz ko'rib chiqish uchun.
 * use-shop-store.ts uni `import.meta.env.DEV` sharti ostida dinamik
 * yuklaydi — production bundlega kirmaydi.
 */

export const DEMO_SHOPS: Shop[] = [
  {
    id: 'demo-1',
    name: '«Baraka» oziq-ovqat do‘koni',
    address: 'Toshkent, Chilonzor tumani, Bunyodkor ko‘chasi 12',
    location: { lat: 41.28, lng: 69.2 },
    phones: ['+998 90 123 45 67'],
    agentName: 'Sardor Aliyev',
    priceListId: 1,
  },
  {
    id: 'demo-2',
    name: '«Baraka» — 2-filial',
    address: 'Toshkent, Yunusobod, 4-kvartal',
    location: null,
    phones: ['+998 90 765 43 21'],
    agentName: 'Sardor Aliyev',
    priceListId: 1,
  },
]

export const DEMO_CATEGORIES: Category[] = [
  { id: 1, name: 'Ichimliklar', nameRu: 'Напитки', icon: 'drinks', order: 1 },
  { id: 2, name: 'Bakaleya', nameRu: 'Бакалея', icon: 'grocery', order: 2 },
  { id: 3, name: 'Shirinliklar', nameRu: 'Сладости', icon: 'sweets', order: 3 },
  { id: 4, name: 'Maishiy kimyo', nameRu: 'Бытовая химия', icon: 'chemicals', order: 4 },
  { id: 5, name: 'Gigiyena', nameRu: 'Гигиена', icon: 'hygiene', order: 5 },
  { id: 6, name: 'Sut mahsulotlari', nameRu: 'Молочные', icon: 'dairy', order: 6 },
  { id: 7, name: 'Choy va qahva', nameRu: 'Чай и кофе', icon: 'coffee', order: 7 },
  { id: 8, name: 'Sneklar', nameRu: 'Снеки', icon: 'snacks', order: 8 },
]

function product(id: number, name: string, category: string, unitPrice: number, pack: number, stock: number, extra: Partial<Product> = {}): Product {
  return {
    id,
    name,
    category,
    price: unitPrice * pack,
    ...(pack > 1 ? { pack, unitPrice } : {}),
    images: [],
    rating: 5,
    reviews: 0,
    stock: Math.floor(stock / pack),
    sizes: [],
    ...extra,
  }
}

export const DEMO_PRODUCTS: Product[] = [
  product(101, 'Coca-Cola 1,5 L', 'Ichimliklar', 13000, 6, 480, { popular: true, order: 1 }),
  product(102, 'Fanta apelsin 1 L', 'Ichimliklar', 10500, 12, 240, { popular: true, order: 2 }),
  product(103, 'Hydrolife suv 1,5 L', 'Ichimliklar', 3500, 6, 900),
  product(104, 'Makfa makaron 400 gr', 'Bakaleya', 6600, 20, 400, { popular: true, order: 3 }),
  product(105, 'Guruch «Lazer» 1 kg', 'Bakaleya', 17000, 10, 150),
  product(106, 'Kungaboqar yog‘i 1 L', 'Bakaleya', 19500, 15, 0),
  product(107, 'Snickers 50 gr', 'Shirinliklar', 7000, 40, 800, { popular: true, order: 4 }),
  product(108, 'Alpen Gold shokolad 85 gr', 'Shirinliklar', 11000, 21, 210),
  product(109, 'Ariel kir yuvish kukuni 3 kg', 'Maishiy kimyo', 96000, 1, 35),
  product(110, 'Fairy idish yuvish 500 ml', 'Maishiy kimyo', 18000, 12, 96),
  product(111, 'Colgate tish pastasi 100 ml', 'Gigiyena', 16000, 24, 120),
  product(112, 'Lipton choy 100 paket', 'Choy va qahva', 32000, 12, 60, { popular: true, order: 5 }),
  product(113, 'Nescafe Gold 95 gr', 'Choy va qahva', 64000, 6, 30),
  product(114, 'Lays chips 90 gr', 'Sneklar', 12000, 24, 192),
  product(115, 'Nestle sut 1 L', 'Sut mahsulotlari', 14000, 12, 48),
]

export function demoOrders(shop: Shop): Order[] {
  const at = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString()
  const line = (p: Product, quantity: number) => ({ product: p, quantity })
  const [cola, fanta, , makfa, , , snickers] = DEMO_PRODUCTS
  return [
    {
      id: 'demo-o1',
      orderNumber: '#0007',
      orderDay: at(2).slice(0, 10),
      createdAt: at(2),
      products: [line(cola, 4), line(makfa, 2)],
      subtotal: cola.price * 4 + makfa.price * 2,
      total: cola.price * 4 + makfa.price * 2,
      status: 'Qabul qilindi',
      paymentMethod: 'Naqd',
      customer: { name: 'Akmal', phone: '+998 90 123 45 67', address: shop.address, location: null, comment: '', paymentMethod: 'Naqd' },
      shopId: shop.id,
    },
    {
      id: 'demo-o2',
      orderNumber: '#0012',
      orderDay: at(50).slice(0, 10),
      createdAt: at(50),
      products: [line(fanta, 2), line(snickers, 1)],
      subtotal: fanta.price * 2 + snickers.price,
      total: fanta.price * 2 + snickers.price,
      status: 'Yetkazildi',
      paymentMethod: 'Karta',
      paymentStatus: 'Tolangan',
      customer: { name: 'Akmal', phone: '+998 90 123 45 67', address: shop.address, location: null, comment: '', paymentMethod: 'Karta' },
      shopId: shop.id,
    },
  ]
}
