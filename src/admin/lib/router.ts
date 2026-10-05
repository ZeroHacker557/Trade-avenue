import { useCallback, useEffect, useState } from 'react'

/**
 * Eng sodda hash-router.
 *
 * react-router qo'shilmadi — admin panel bitta sahifada ishlaydi va
 * kerak bo'lgan narsa faqat "qaysi bo'lim ochiq". Hash ishlatiladi,
 * chunki /admin Vercel'da bitta statik faylga qayta yoziladi: hash
 * serverga umuman bormaydi, ya'ni har qanday yo'l ishonchli ochiladi.
 */
export type Route =
  | 'dashboard'
  | 'orders'
  | 'map'
  | 'products'
  | 'categories'
  | 'sections'
  | 'promotions'
  | 'ads'
  | 'banners'
  | 'reports'
  | 'customers'
  | 'broadcast'
  | 'channel'
  | 'daily'
  | 'support'
  | 'cash'
  | 'staff'
  | 'promocodes'
  | 'settings'
  | 'linko'
  | 'linko-orders'
  | 'audit'
  | 'backups'

export const ROUTES: Route[] = [
  'dashboard',
  'orders',
  'map',
  'products',
  'categories',
  'sections',
  'promotions',
  'ads',
  'banners',
  'reports',
  'customers',
  'broadcast',
  'channel',
  'daily',
  'support',
  'cash',
  'staff',
  'promocodes',
  'settings',
  'linko',
  'linko-orders',
  'audit',
  'backups',
]

const DEFAULT: Route = 'dashboard'

function parse(hash: string): { route: Route; param: string | null } {
  const clean = hash.replace(/^#\/?/, '')
  const [first, second] = clean.split('/')
  const route = (ROUTES as string[]).includes(first) ? (first as Route) : DEFAULT
  return { route, param: second ? decodeURIComponent(second) : null }
}

export function useRoute() {
  const [state, setState] = useState(() => parse(window.location.hash))

  useEffect(() => {
    const onChange = () => setState(parse(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = useCallback((route: Route, param?: string) => {
    window.location.hash = param ? `#/${route}/${encodeURIComponent(param)}` : `#/${route}`
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  return { ...state, navigate }
}
