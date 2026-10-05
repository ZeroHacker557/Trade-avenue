import { useEffect, useMemo, useRef } from 'react'
import { datedNumber } from '../../utils/order-label'
import { createBrain, type Brain, type BrainData } from '../brain/engine.js'
import '../brain/brain.css'
import { useCategories, useCustomers, useOrders, useProducts, useSections, useStaff } from '../lib/live'
import type { Staff } from '../lib/auth'
import { productThumb } from '../../utils/product-image'

/** Galaktikada alohida yulduz bo'lib chiqadigan buyurtmalar soni — qolganlari hisobda. */
const MAX_ORDERS = 80
/** Buyurtmasi bo'lmagan mijozlardan eng oxirgi faollari. */
const MAX_IDLE_CUSTOMERS = 40

/**
 * «Miya» — butun tizimning 3D galaktika ko'rinishi.
 *
 * Chizish, parvoz va ovoz — brain/engine.js da (React'dan mustaqil).
 * Bu sahifa faqat jonli Firestore ma'lumotini galaktika tushunadigan
 * shaklga keltirib uzatadi. Ma'lumot o'zgarsa galaktika qayta quriladi,
 * kamera esa joyida qoladi; yangi buyurtma yoki holat o'zgarishi
 * simlar bo'ylab impuls bo'lib yuguradi.
 */
export function BrainPage({ staff }: { staff: Staff }) {
  const host = useRef<HTMLDivElement>(null)
  const brain = useRef<Brain | null>(null)

  const { products, loading: l1 } = useProducts()
  const { categories, loading: l2 } = useCategories()
  const { sections, loading: l3 } = useSections()
  // Tahlil butun tarix bo'yicha
  const { orders, loading: l4 } = useOrders(undefined, 'all')
  const { customers, loading: l5 } = useCustomers()
  // Xodimlar ro'yxati faqat egaga ochiq (Firestore Rules)
  const { staff: team, loading: l6 } = useStaff(staff.role === 'owner')
  const ready = !l1 && !l2 && !l3 && !l4 && !l5 && !l6

  const data = useMemo<BrainData | null>(() => {
    // Hammasi kelmaguncha galaktika qurilmaydi: aks holda keyinroq kelgan
    // buyurtmalar «yangi buyurtma» deb impuls va ovoz chiqarib yuborardi
    if (!ready) return null

    const recent = orders.slice(0, MAX_ORDERS)
    const buyers = new Set(recent.map((o) => String(o.userId ?? '')).filter(Boolean))
    const idle = customers.filter((c) => !buyers.has(c.id)).slice(0, MAX_IDLE_CUSTOMERS)
    const shownCustomers = [...customers.filter((c) => buyers.has(c.id)), ...idle]
    const knownCustomers = new Set(shownCustomers.map((c) => c.id))

    // Admin (ega emas) xodimlar ro'yxatini ko'rmaydi — kuryerlarni buyurtmalardan olamiz
    const people = new Map<string, BrainData['staff'][number]>()
    for (const person of team) {
      people.set(person.uid, { id: person.uid, name: person.name, role: person.role, active: person.active })
    }
    for (const o of recent) {
      if (o.courierId && !people.has(o.courierId)) {
        people.set(o.courierId, { id: o.courierId, name: o.courierName || 'Kuryer', role: 'courier', active: true })
      }
    }

    return {
      categories: categories.map((c, i) => ({ id: String(c.id), name: c.name, order: c.order ?? i })),
      sections: sections.map((s, i) => ({ id: s.id, name: s.name, category: s.category, order: s.order ?? i })),
      products: products.map((p) => ({
        id: p.docId,
        name: p.name,
        category: p.category,
        sectionId: p.sectionId || null,
        stock: typeof p.stock === 'number' ? p.stock : null,
        price: Number(p.price) || 0,
        order: p.order ?? Number.MAX_SAFE_INTEGER,
        thumb: productThumb(p),
      })),
      orders: recent.map((o) => ({
        id: o.id,
        number: datedNumber(o.orderNumber, o.orderDay, o.createdAt),
        status: o.status,
        total: Number(o.total) || 0,
        createdAt: String(o.createdAt || ''),
        payment: o.paymentMethod || 'Naqd',
        customerId: o.userId && knownCustomers.has(String(o.userId)) ? String(o.userId) : null,
        courierId: o.courierId || null,
        courierName: o.courierName || null,
        items: (o.products || []).map((item) => ({
          id: String(item.product?.id ?? ''),
          name: item.product?.name || '',
          q: item.quantity || 1,
        })),
      })),
      customers: shownCustomers.map((c) => ({
        id: c.id,
        name:
          [c.first_name, c.last_name].filter(Boolean).join(' ') ||
          (c.username ? `@${c.username}` : 'Mijoz'),
        phone: c.phone,
      })),
      staff: [...people.values()],
      totalOrders: orders.length,
      totalCustomers: customers.length,
      hiddenOrders: Math.max(0, orders.length - recent.length),
      hiddenCustomers: Math.max(0, customers.length - shownCustomers.length),
    }
  }, [ready, products, categories, sections, orders, customers, team])

  useEffect(() => {
    if (!host.current) return
    const instance = createBrain(host.current, {
      onNavigate: (hash) => { window.location.hash = hash },
    })
    brain.current = instance
    return () => {
      instance.destroy()
      brain.current = null
    }
  }, [])

  useEffect(() => {
    if (data) brain.current?.setData(data)
  }, [data])

  return <div ref={host} className="brain" />
}
