/**
 * Linko'ni ulash va birinchi sinxron — kompyuterdan, bir buyruq bilan.
 *
 *   ./node_modules/.bin/tsx scripts/connect-linko.ts <server-manzil> [narx-royxati-id]
 *
 * Token `.env.local` dagi LINKO_TOKEN dan (git'ga tushmaydi; Vercel'ga ham
 * xuddi shu qiymat qo'yiladi). Firebase kaliti — loyiha ildizidagi
 * `*-firebase-adminsdk-*.json`.
 *
 * 1-qadam (narx ro'yxati berilmasa): ulanadi va narx ro'yxatlari, skladlar,
 *   agentlarni chiqaradi — qaysi biri ULGURJI ekanini tanlash uchun.
 * 2-qadam (narx ro'yxati berilsa): sozlamani saqlaydi, do'konlarni va
 *   katalogni Linko'dan tortadi. Buyurtma yuborish YOQILMAYDI — u admin
 *   panel → Linko'da alohida, ko'rib chiqilgandan keyin yoqiladi.
 */
import { readdirSync, readFileSync } from 'node:fs'

function loadEnv() {
  try {
    for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(line)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
    }
  } catch {
    // .env.local yo'q — env dan
  }
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    const file = readdirSync('.').find((f) => f.includes('firebase-adminsdk') && f.endsWith('.json'))
    if (!file) throw new Error('Firebase kaliti (*-firebase-adminsdk-*.json) topilmadi')
    process.env.FIREBASE_SERVICE_ACCOUNT = readFileSync(file, 'utf8')
  }
  if (!process.env.LINKO_TOKEN) throw new Error('.env.local ga LINKO_TOKEN=... yozing')
}

loadEnv()
const [, , baseArg, listArg] = process.argv
if (!baseArg) throw new Error('Server manzilini bering: https://nom.linko.uz')
const baseUrl = baseArg.trim().replace(/\/+$/, '')

const { adminDb } = await import('../api/_lib/firebase-admin.js')
const { linkoStatus, linkoSettingsSave, linkoPull } = await import('../api/_lib/actions/linko.js')
const { shopsSync } = await import('../api/_lib/actions/shops.js')

await linkoSettingsSave(null, { baseUrl })
const status = (await linkoStatus()) as {
  connected: boolean
  reason?: string
  products?: number
  priceLists?: { id: number; name: string }[]
  stocks?: { id: number; name: string }[]
  users?: { id: number; name: string; job: string }[]
}
if (!status.connected) throw new Error(`Ulanmadi: ${status.reason}`)

console.log(`✅ Linko ulandi: ${baseUrl} — ${status.products} ta mahsulot`)
console.log('\nNarx ro‘yxatlari:')
for (const p of status.priceLists ?? []) console.log(`  ${p.id}\t${p.name}`)
console.log('\nSkladlar:')
for (const s of status.stocks ?? []) console.log(`  ${s.id}\t${s.name}`)
console.log(`\nXodimlar (agentlar): ${(status.users ?? []).length} ta`)

if (!listArg) {
  console.log('\nKeyingi qadam: ulgurji ro‘yxat raqami bilan qayta ishga tushiring.')
  process.exit(0)
}

const priceListId = Number(listArg)
if (!(status.priceLists ?? []).some((p) => p.id === priceListId)) throw new Error(`#${priceListId} narx ro‘yxati topilmadi`)
await linkoSettingsSave(null, { priceListId })
console.log(`\n✅ Asosiy narx ro‘yxati: #${priceListId}`)

const shops = await shopsSync(null, { full: true })
console.log(`✅ Do‘konlar: ${shops.report}`)
const pull = await linkoPull(null, { full: true })
console.log(`✅ Katalog: ${pull.report}`)

const db = await adminDb()
const linko = (await db.collection('settings').doc('linko').get()).data() ?? {}
console.log(`\nBuyurtma yuborish: ${linko.sendOrders ? 'YOQIQ' : 'o‘chiq (admin panel → Linko da yoqiladi)'}`)
process.exit(0)
