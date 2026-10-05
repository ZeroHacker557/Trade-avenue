import type { AdminOrder, ProductRow } from './live'
import { datedNumber } from '../../utils/order-label'
import type { SheetSpec } from './xlsx'
import { isCashPayment } from '../../utils/payment'

/**
 * Savdo hisoboti — hisob-kitob.
 *
 * Qoidalar hisobotning boshidan oxirigacha bir xil:
 *   - «Bekor qilingan» va «Rad etildi» tushumga kirmaydi, alohida sanaladi;
 *   - tushum = buyurtmaning yakuniy summasi (chegirma ayirilgan, yetkazish qo'shilgan);
 *   - kun — admin kompyuterining mahalliy vaqti bo'yicha (Toshkent).
 */

export type Period = { from: Date; to: Date }

const CANCELLED = new Set(['Bekor qilingan', 'Rad etildi'])
const DAY = 24 * 60 * 60 * 1000

export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const dayLabel = (d: Date) => d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
const time = (o: AdminOrder) => Date.parse(String(o.createdAt)) || 0

export type Report = ReturnType<typeof buildReport>

export function buildReport(orders: AdminOrder[], products: ProductRow[], period: Period) {
  const from = period.from.getTime()
  const to = period.to.getTime()
  const inPeriod = orders.filter((o) => time(o) >= from && time(o) < to)
  const valid = inPeriod.filter((o) => !CANCELLED.has(o.status))
  const cancelled = inPeriod.filter((o) => CANCELLED.has(o.status))

  const revenue = valid.reduce((s, o) => s + (Number(o.total) || 0), 0)
  const delivered = valid.filter((o) => o.status === 'Yetkazildi')
  const units = valid.reduce((s, o) => s + (o.products || []).reduce((u, p) => u + (p.quantity || 0), 0), 0)
  const promoDiscount = valid.reduce((s, o) => s + (Number(o.discount) || 0), 0)
  const actionDiscount = valid.reduce(
    (s, o) => s + (o.products || []).reduce((u, p) => {
      const original = Number((p.product as { originalPrice?: number }).originalPrice) || 0
      return u + (original ? (original - Number(p.product.price)) * (p.quantity || 0) : 0)
    }, 0),
    0,
  )
  const deliveryIncome = valid.reduce((s, o) => s + (Number(o.deliveryFee) || 0), 0)

  // Yangi mijoz — birinchi (bekor qilinmagan) buyurtmasi shu davrga to'g'ri kelgan
  const firstOrder = new Map<string, number>()
  for (const o of orders) {
    if (CANCELLED.has(o.status) || !o.userId) continue
    const key = String(o.userId)
    firstOrder.set(key, Math.min(firstOrder.get(key) ?? Infinity, time(o)))
  }
  const buyers = new Set(valid.map((o) => String(o.userId ?? '')).filter(Boolean))
  const newCustomers = [...buyers].filter((id) => {
    const first = firstOrder.get(id) ?? 0
    return first >= from && first < to
  }).length

  // Oldingi xuddi shunday davr — o'sish/pasayishni ko'rsatish uchun
  const span = to - from
  const previous = orders.filter((o) => time(o) >= from - span && time(o) < from && !CANCELLED.has(o.status))
  const prevRevenue = previous.reduce((s, o) => s + (Number(o.total) || 0), 0)

  // Kunlar
  const days: { key: string; label: string; orders: number; revenue: number; cancelled: number }[] = []
  for (let t = from; t < to; t += DAY) {
    const d = new Date(t)
    days.push({ key: dayKey(d), label: dayLabel(d), orders: 0, revenue: 0, cancelled: 0 })
  }
  const dayIndex = new Map(days.map((d, i) => [d.key, i]))
  for (const o of inPeriod) {
    const row = days[dayIndex.get(dayKey(new Date(time(o)))) ?? -1]
    if (!row) continue
    if (CANCELLED.has(o.status)) row.cancelled++
    else { row.orders++; row.revenue += Number(o.total) || 0 }
  }

  // Mahsulotlar va kategoriyalar
  const categoryOf = new Map(products.map((p) => [String(p.id), p.category]))
  const byProduct = new Map<string, { name: string; category: string; units: number; revenue: number }>()
  const byCategory = new Map<string, { units: number; revenue: number; orders: Set<string> }>()
  for (const o of valid) {
    for (const line of o.products || []) {
      const id = String(line.product?.id ?? '')
      const qty = line.quantity || 0
      const sum = (Number(line.product?.price) || 0) * qty
      const category = line.product?.category || categoryOf.get(id) || 'Boshqa'
      const p = byProduct.get(id) ?? { name: line.product?.name || '—', category, units: 0, revenue: 0 }
      p.units += qty; p.revenue += sum
      byProduct.set(id, p)
      const c = byCategory.get(category) ?? { units: 0, revenue: 0, orders: new Set() }
      c.units += qty; c.revenue += sum; c.orders.add(o.id)
      byCategory.set(category, c)
    }
  }
  const goods = [...byProduct.values()].reduce((s, p) => s + p.revenue, 0) || 1
  const topProducts = [...byProduct.entries()]
    .map(([id, p]) => ({ id, ...p, share: (p.revenue / goods) * 100 }))
    .sort((a, b) => b.revenue - a.revenue)
  const categories = [...byCategory.entries()]
    .map(([name, c]) => ({ name, units: c.units, revenue: c.revenue, orders: c.orders.size, share: (c.revenue / goods) * 100 }))
    .sort((a, b) => b.revenue - a.revenue)

  /*
   * Kuryerlar — samaradorlik.
   *
   *   O'rtacha vaqt — «Olaman» dan «Yetkazdim» gacha (daqiqa)
   *   Vaqtida       — mijozga aytilgan taxminiy vaqtdan kechikmagan
   *                   (5 daqiqa bardosh bilan); vaqti bor buyurtmalar ichidan
   *   Reyting       — mijozlar bahosi (1–5)
   *   Muammo        — kuryer «Muammo bormi?» tugmasini bosgan buyurtmalar
   */
  const LATE_GRACE = 5 * 60_000
  type CourierRow = {
    name: string; delivered: number; cash: number; card: number
    minutes: number[]; withEta: number; onTime: number; arrived: number
    problems: number
  }
  const byCourier = new Map<string, CourierRow>()
  const rowOf = (o: AdminOrder) => {
    const key = o.courierId || 'none'
    const row = byCourier.get(key) ?? {
      name: o.courierName || (o.courierId ? 'Kuryer' : 'Biriktirilmagan'),
      delivered: 0, cash: 0, card: 0, minutes: [], withEta: 0, onTime: 0, arrived: 0, problems: 0,
    }
    byCourier.set(key, row)
    return row
  }
  for (const o of delivered) {
    const row = rowOf(o)
    row.delivered++
    // Karta — naqdsiz
    if (isCashPayment(o.paymentMethod)) row.cash += Number(o.total) || 0
    else row.card += Number(o.total) || 0

    const taken = Date.parse(o.takenAt || '')
    const done = Date.parse(o.deliveredAt || '')
    if (Number.isFinite(taken) && Number.isFinite(done) && done > taken) row.minutes.push((done - taken) / 60_000)
    const eta = Date.parse(o.etaAt || '')
    if (Number.isFinite(eta) && Number.isFinite(done)) {
      row.withEta++
      if (done <= eta + LATE_GRACE) row.onTime++
    }
    if (o.arrivedAt) row.arrived++
  }
  // Muammolar — yetkazilmaganlar (masalan rad etilgan) ham hisobga kiradi
  for (const o of inPeriod) if (o.courierId && o.problems?.length) rowOf(o).problems += o.problems.length

  const avg = (list: number[]) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null)
  const couriers = [...byCourier.values()]
    .filter((c) => c.delivered > 0 || c.problems > 0)
    .map((c) => ({
      name: c.name,
      delivered: c.delivered,
      cash: c.cash,
      card: c.card,
      avgMinutes: avg(c.minutes),
      onTimeRate: c.withEta ? (c.onTime / c.withEta) * 100 : null,
      late: c.withEta - c.onTime,
      arrivedRate: c.delivered ? (c.arrived / c.delivered) * 100 : null,
      problems: c.problems,
    }))
    .sort((a, b) => b.delivered - a.delivered)

  const payments = (['Naqd', 'Karta'] as const).map((method) => {
    const list = valid.filter((o) => (o.paymentMethod || 'Naqd') === method)
    return { method, orders: list.length, revenue: list.reduce((s, o) => s + (Number(o.total) || 0), 0) }
  })

  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: 0 }))
  for (const o of valid) hours[new Date(time(o)).getHours()].orders++

  return {
    period,
    orders: inPeriod,
    valid,
    revenue,
    count: valid.length,
    average: valid.length ? Math.round(revenue / valid.length) : 0,
    delivered: delivered.length,
    cancelled: cancelled.length,
    cancelRate: inPeriod.length ? (cancelled.length / inPeriod.length) * 100 : 0,
    units,
    newCustomers,
    buyers: buyers.size,
    promoDiscount,
    actionDiscount,
    deliveryIncome,
    revenueDelta: prevRevenue ? ((revenue - prevRevenue) / prevRevenue) * 100 : null,
    days,
    topProducts,
    categories,
    couriers,
    payments,
    hours,
  }
}

/** Hisobotning professional Excel ko'rinishi — har bo'lim alohida varaqda. */
export function reportSheets(r: Report): SheetSpec[] {
  const periodText = `Davr: ${dayLabel(r.period.from)} — ${dayLabel(new Date(r.period.to.getTime() - 1))}`
  const made = `Tayyorlandi: ${new Date().toLocaleString('ru-RU')}`
  const title = (name: string) => [`Trade Avenue — ${name}`, `${periodText} · ${made}`]
  const pct = (n: number) => Math.round(n * 10) / 10

  return [
    {
      name: 'Umumiy',
      title: title('savdo hisoboti'),
      headers: ['Ko‘rsatkich', 'Qiymat', 'Izoh'],
      widths: [34, 18, 60],
      styles: ['text', 'money', 'text'],
      rows: [
        ['Tushum (so‘m)', r.revenue, 'Bekor qilinmagan buyurtmalar yakuniy summasi'],
        ['Buyurtmalar soni', r.count, 'Bekor qilinganlar kirmaydi'],
        ['O‘rtacha chek (so‘m)', r.average, 'Tushum ÷ buyurtmalar soni'],
        ['Yetkazildi', r.delivered, ''],
        ['Bekor qilingan / rad etilgan', r.cancelled, `${pct(r.cancelRate)}% barcha buyurtmalardan`],
        ['Sotilgan mahsulot (dona)', r.units, ''],
        ['Xaridorlar', r.buyers, 'Kamida bitta buyurtma bergan'],
        ['Yangi mijozlar', r.newCustomers, 'Birinchi buyurtmasi shu davrda'],
        ['Promokod chegirmasi (so‘m)', r.promoDiscount, ''],
        ['Aksiya chegirmasi (so‘m)', r.actionDiscount, 'Vaqtli aksiyalardagi narx farqi'],
        ['Yetkazish to‘lovlari (so‘m)', r.deliveryIncome, ''],
        ['Oldingi davrga nisbatan tushum', r.revenueDelta === null ? '—' : `${r.revenueDelta >= 0 ? '+' : ''}${pct(r.revenueDelta)}%`, 'Xuddi shunday uzunlikdagi oldingi davr bilan'],
      ],
    },
    {
      name: 'Kunlar',
      title: title('kunlik savdo'),
      headers: ['Sana', 'Buyurtmalar', 'Tushum (so‘m)', 'O‘rtacha chek (so‘m)', 'Bekor qilingan'],
      widths: [14, 13, 18, 20, 15],
      styles: ['text', 'number', 'money', 'money', 'number'],
      totalRow: true,
      rows: [
        ...r.days.map((d) => [d.label, d.orders, d.revenue, d.orders ? Math.round(d.revenue / d.orders) : 0, d.cancelled]),
        ['Jami', r.count, r.revenue, r.average, r.cancelled],
      ],
    },
    {
      name: 'Mahsulotlar',
      title: title('mahsulotlar bo‘yicha'),
      headers: ['№', 'Mahsulot', 'Kategoriya', 'Sotildi (dona)', 'Tushum (so‘m)', 'Ulushi, %'],
      widths: [5, 40, 24, 14, 18, 11],
      styles: ['number', 'text', 'text', 'number', 'money', 'percent'],
      totalRow: true,
      rows: [
        ...r.topProducts.map((p, i) => [i + 1, p.name, p.category, p.units, p.revenue, pct(p.share)]),
        ['', 'Jami', '', r.topProducts.reduce((s, p) => s + p.units, 0), r.topProducts.reduce((s, p) => s + p.revenue, 0), 100],
      ],
    },
    {
      name: 'Kategoriyalar',
      title: title('kategoriyalar bo‘yicha'),
      headers: ['Kategoriya', 'Buyurtmalar', 'Sotildi (dona)', 'Tushum (so‘m)', 'Ulushi, %'],
      widths: [28, 13, 14, 18, 11],
      styles: ['text', 'number', 'number', 'money', 'percent'],
      rows: r.categories.map((c) => [c.name, c.orders, c.units, c.revenue, pct(c.share)]),
    },
    {
      name: 'Kuryerlar',
      title: title('kuryerlar bo‘yicha (yetkazilganlar)'),
      headers: [
        'Kuryer', 'Yetkazdi', 'O‘rtacha vaqt (daq)', 'Vaqtida, %', 'Kechikdi', '«Yetib keldim», %',
        'Muammolar', 'Naqd olingan (so‘m)', 'Karta (so‘m)', 'Jami (so‘m)',
      ],
      widths: [24, 10, 17, 11, 10, 16, 11, 19, 15, 15],
      styles: ['text', 'number', 'number', 'percent', 'number', 'percent', 'number', 'money', 'money', 'money'],
      rows: r.couriers.map((c) => [
        c.name,
        c.delivered,
        c.avgMinutes === null ? '—' : Math.round(c.avgMinutes),
        c.onTimeRate === null ? '—' : pct(c.onTimeRate),
        c.late,
        c.arrivedRate === null ? '—' : pct(c.arrivedRate),
        c.problems,
        c.cash,
        c.card,
        c.cash + c.card,
      ]),
    },
    {
      name: 'To‘lov turlari',
      title: title('to‘lov turlari'),
      headers: ['To‘lov turi', 'Buyurtmalar', 'Tushum (so‘m)'],
      widths: [18, 13, 18],
      styles: ['text', 'number', 'money'],
      rows: r.payments.map((p) => [p.method, p.orders, p.revenue]),
    },
    {
      name: 'Buyurtmalar',
      title: title('barcha buyurtmalar'),
      headers: ['Raqam', 'Sana', 'Vaqt', 'Holat', 'Mijoz', 'Telefon', 'Manzil', 'Mahsulotlar', 'Chegirma (so‘m)', 'Yetkazish (so‘m)', 'Jami (so‘m)', 'To‘lov', 'Kuryer'],
      widths: [9, 12, 7, 15, 22, 16, 36, 50, 14, 14, 14, 9, 18],
      styles: ['text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'money', 'money', 'money', 'text', 'text'],
      rows: [...r.orders].sort((a, b) => time(a) - time(b)).map((o) => {
        const d = new Date(time(o))
        return [
          datedNumber(o.orderNumber, o.orderDay, o.createdAt),
          dayLabel(d),
          d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
          o.status,
          o.customer?.name || '',
          o.customer?.phone || '',
          o.customer?.address || '',
          (o.products || []).map((p) => `${p.product?.name} × ${p.quantity}`).join('; '),
          Number(o.discount) || 0,
          Number(o.deliveryFee) || 0,
          Number(o.total) || 0,
          o.paymentMethod || 'Naqd',
          o.courierName || '',
        ]
      }),
    },
  ]
}
