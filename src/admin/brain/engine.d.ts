/** engine.js uchun turlar — dvigatel oddiy JavaScript'da (Canvas + Web Audio). */

export type BrainProduct = {
  id: string
  name: string
  category: string
  sectionId: string | null
  stock: number | null
  price: number
  order: number
  thumb: string
}

export type BrainOrder = {
  id: string
  number: string
  status: string
  total: number
  createdAt: string
  payment: string
  customerId: string | null
  courierId: string | null
  courierName: string | null
  items: { id: string; name: string; q: number }[]
}

export type BrainData = {
  categories: { id: string; name: string; order: number }[]
  sections: { id: string; name: string; category: string; order: number }[]
  products: BrainProduct[]
  /** Galaktikada ko'rsatiladigan oxirgi buyurtmalar. */
  orders: BrainOrder[]
  customers: { id: string; name: string; phone?: string }[]
  staff: { id: string; name: string; role: 'owner' | 'admin' | 'courier'; active?: boolean }[]
  totalOrders: number
  totalCustomers: number
  hiddenOrders: number
  hiddenCustomers: number
}

export type Brain = {
  setData: (data: BrainData) => void
  destroy: () => void
}

export function createBrain(root: HTMLElement, options?: { onNavigate?: (hash: string) => void }): Brain
