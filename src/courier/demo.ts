import type { CashHandover, CourierOrder, CourierOverview, ProblemCode } from './api'

/*
 * FAQAT dev rejimi uchun soxta ma'lumot (`?courierDemo`). Kuryer
 * sahifasini Telegram va serversiz ko'rib chiqish uchun. api.ts uni
 * `import.meta.env.DEV` sharti ostida dinamik yuklaydi — production
 * bundlega kirmaydi.
 */

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

// Do'kondagi haqiqiy mahsulotlarning kichik rasmlari
const STORAGE = 'https://firebasestorage.googleapis.com/v0/b/musa-onlineshop.firebasestorage.app/o/products%2F'
const IMG = {
  pelmeni: STORAGE + '1789381730766_6zc9cc_thumb.webp?alt=media&token=a7de0881-f0ed-4254-818d-0687836215d1',
  sirok: STORAGE + '102422_0_2f12e069_thumb.webp?alt=media&token=abf82cb0-a473-41f9-8e20-233e51f078b8',
  pitsa: STORAGE + '1790152868913_uaalcp_thumb.webp?alt=media&token=efc5ce4f-b6c8-4c7d-a8c0-6bf5270dcbbb',
}

function order(
  id: string, n: number, address: string, lat: number, lng: number,
  total: number, pay: string, minutes: number, extra: Partial<CourierOrder> = {},
): CourierOrder {
  return {
    id,
    number: '#' + String(n - 1030).padStart(4, '0'),
    status: 'Qabul qilindi',
    createdAt: minutesAgo(minutes),
    takenAt: null,
    deliveredAt: null,
    assignedToMe: false,
    customer: {
      name: ['Dilnoza', 'Jasur', 'Malika', 'Sardor', 'Aziza', 'Bekzod'][n % 6],
      phone: '+998 90 123 45 ' + String(10 + (n % 80)),
      address,
      comment: n % 3 === 0 ? 'Domofon ishlamaydi, qo‘ng‘iroq qiling' : '',
      recipientName: '',
      recipientPhone: '',
      location: { lat, lng },
    },
    items: [
      { name: 'Musa Muzlatilgan Chuchvara Pelmeni 1 kg', quantity: 2, price: 52600, size: '1 kg', image: IMG.pelmeni },
      { name: 'Yarim Tayyor pitsa 550 gr 2 dona', quantity: 1, price: 18000, size: '550gr 2dona', image: IMG.pitsa },
      { name: 'Sirok Musa Banan', quantity: 6, price: 4000, size: '45gr', image: IMG.sirok },
      // Rasmsiz mahsulot — o'rniga belgi chiqishi tekshiriladi
      { name: 'Musa Kartoshkali Somsa 12 dona', quantity: 1, price: 38000, size: '12 dona', image: null },
    ],
    total,
    paymentMethod: pay,
    orderDay: new Date().toISOString().slice(0, 10),
    subtotal: total - 15000,
    discount: 0,
    promoCode: null,
    deliveryFee: 15000,
    paymentStatus: pay === 'Karta' ? 'Tolangan' : null,
    courierName: 'Komiljon Karimov',
    arrivedAt: null,
    etaAt: null,
    cashStatus: null,
    problems: [],
    ...extra,
  }
}

let available: CourierOrder[] = [
  order('d1', 1051, 'Yunusobod 19-kvartal, 12-uy', 41.3645, 69.2851, 92400, 'Naqd', 6),
  order('d2', 1052, 'Chilonzor 9-kvartal, 3-uy', 41.2858, 69.2034, 143500, 'Karta', 14, { assignedToMe: true }),
  order('d3', 1053, 'Sergeli 5-mavze, 44-uy', 41.2275, 69.2233, 61000, 'Naqd', 21),
  order('d4', 1054, 'Mirzo Ulug‘bek, Buyuk Ipak Yo‘li 158', 41.3269, 69.3312, 118000, 'Naqd', 3),
  order('d5', 1055, 'Olmazor, Qorasaroy ko‘chasi 7', 41.3462, 69.2211, 77500, 'Karta', 33),
]
let active: CourierOrder[] = [
  order('d6', 1048, 'Shayxontohur, Navoiy ko‘chasi 30', 41.3240, 69.2489, 54000, 'Naqd', 48,
    { status: 'Yetkazilmoqda', takenAt: minutesAgo(20), assignedToMe: true }),
  order('d7', 1049, 'Yakkasaroy, Shota Rustaveli 41', 41.2885, 69.2573, 210000, 'Karta', 40,
    { status: 'Yetkazilmoqda', takenAt: minutesAgo(18), assignedToMe: true }),
]
let done: CourierOrder[] = [
  order('d8', 1041, 'Mirobod, Amir Temur 99', 41.3006, 69.2798, 88000, 'Naqd', 190,
    { status: 'Yetkazildi', deliveredAt: minutesAgo(95), assignedToMe: true, cashStatus: 'held' }),
  order('d9', 1043, 'Yashnobod, Parkent 12', 41.3157, 69.3120, 132000, 'Karta', 150,
    { status: 'Yetkazildi', deliveredAt: minutesAgo(60), assignedToMe: true }),
]

let onShift = true
let handovers: CashHandover[] = [
  { id: 'h0', amount: 412000, count: 5, status: 'confirmed', createdAt: minutesAgo(60 * 26), decidedAt: minutesAgo(60 * 25), note: null },
]

const sum = (list: CourierOrder[], card: boolean) =>
  list.filter((o) => (o.paymentMethod === 'Karta') === card).reduce((s, o) => s + o.total, 0)

export function demoOverview(): Promise<CourierOverview> {
  const today = { delivered: done.length, cash: sum(done, false), card: sum(done, true) }
  return new Promise((resolve) =>
    setTimeout(() => resolve({
      profile: {
        name: 'Komiljon Karimov', phone: '+998 90 555 12 34', telegramId: 1, onShift,
        rating: { count: 23, average: 4.8 },
      },
      reviews: [
        { number: '#0013', at: minutesAgo(60), stars: 5, tags: ['fast', 'polite'], comment: 'Juda tez olib keldi, rahmat!' },
        { number: '#0011', at: minutesAgo(95), stars: 4, tags: ['careful'], comment: '' },
      ],
      location: { at: new Date(Date.now() - 20 * 60_000).toISOString(), source: 'app', liveUntil: null },
      cash: {
        held: {
          amount: done.filter((o) => o.cashStatus === 'held').reduce((s, o) => s + o.total, 0),
          count: done.filter((o) => o.cashStatus === 'held').length,
        },
        pending: {
          amount: done.filter((o) => o.cashStatus === 'pending').reduce((s, o) => s + o.total, 0),
          count: done.filter((o) => o.cashStatus === 'pending').length,
        },
        handovers: [...handovers],
      },
      available: [...available],
      active: [...active],
      done: [...done],
      recent: [...done],
      stats: {
        today,
        week: { delivered: 38, cash: 2_840_000, card: 1_920_000 },
        month: { delivered: 146, cash: 11_350_000, card: 7_410_000 },
        total: 412,
      },
      serverTime: new Date().toISOString(),
    }), 350),
  )
}

export async function demoTake(id: string) {
  const found = available.find((o) => o.id === id)
  if (!found) return { outcome: 'taken' as const, courierName: 'Ali' }
  available = available.filter((o) => o.id !== id)
  active = [...active, { ...found, status: 'Yetkazilmoqda', takenAt: new Date().toISOString(), assignedToMe: true }]
  return { outcome: 'claimed' as const, courierName: null }
}

export async function demoDeliver(id: string) {
  const found = active.find((o) => o.id === id)
  if (!found) return { outcome: 'not_found' as const }
  active = active.filter((o) => o.id !== id)
  done = [{
    ...found, status: 'Yetkazildi', deliveredAt: new Date().toISOString(),
    cashStatus: found.paymentMethod === 'Karta' ? null : 'held',
  }, ...done]
  return { outcome: 'done' as const }
}

export async function demoArrive(id: string) {
  active = active.map((o) => (o.id === id ? { ...o, arrivedAt: new Date().toISOString() } : o))
  return { outcome: 'done' }
}

export async function demoShift(on: boolean) {
  onShift = on
  return { onShift }
}

export async function demoProblem(id: string, code: ProblemCode) {
  active = active.map((o) => (o.id === id ? { ...o, problems: [...o.problems, code] } : o))
  const { demo } = await import('./support-demo')
  const label = { no_answer: '📵 Mijoz javob bermayapti', no_address: '🗺 Manzil topilmadi', refused: '✋ Mijoz buyurtmani rad etdi' }[code]
  const threadId = await demo.open(id, `⚠️ ${label}`)
  return { threadId, customerNotified: code === 'no_answer' }
}

export async function demoHandover() {
  const held = done.filter((o) => o.cashStatus === 'held')
  if (!held.length) throw new Error('Topshiriladigan naqd pul yo‘q')
  const amount = held.reduce((s, o) => s + o.total, 0)
  done = done.map((o) => (o.cashStatus === 'held' ? { ...o, cashStatus: 'pending' } : o))
  handovers = [{
    id: 'h' + Date.now(), amount, count: held.length, status: 'pending',
    createdAt: new Date().toISOString(), decidedAt: null, note: null,
  }, ...handovers]
  return { amount, count: held.length }
}

/** Chat uchun: tanlangan buyurtmaning raqami va sanasi (serverda buni api o'zi topadi). */
export function demoOrderById(id: string): CourierOrder | undefined {
  return [...available, ...active, ...done].find((o) => o.id === id)
}
