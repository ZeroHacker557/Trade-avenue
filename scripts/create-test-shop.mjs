/**
 * Sinov do'koni — mini app'ga telefon + kod bilan kirib ko'rish uchun.
 *
 *   node scripts/create-test-shop.mjs [telefon] [kod]
 *
 * Standart: +998 99 999 99 99 va TEST26. Qayta ishga tushirsa — o'sha
 * do'kon yangilanadi (ulangan akkauntlar saqlanadi). Admin → Do'konlar
 * da «Qo'lda» belgisi bilan ko'rinadi; kerak bo'lmasa o'sha yerdan o'chiriladi.
 */
import { connect } from './_firebase.mjs'

const ALPHABET = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/
const [, , phoneArg = '998999999999', codeArg = 'TEST26'] = process.argv
const digits = phoneArg.replace(/\D/g, '')
const phone = digits.length === 9 ? `998${digits}` : digits
const code = codeArg.toUpperCase()
if (phone.length !== 12 || !phone.startsWith('998')) throw new Error('Telefon: 998XXXXXXXXX')
if (!ALPHABET.test(code)) throw new Error('Kod: 6 belgi, 0/O/1/I/L siz')

const { db } = connect()
const id = 'm_test_shop'
const now = new Date().toISOString()

const taken = await db.collection('shop_codes').where('code', '==', code).get()
if (taken.docs.some((d) => d.id !== id)) throw new Error(`«${code}» kodi boshqa do'konda band`)

const ref = db.collection('shops').doc(id)
const exists = (await ref.get()).exists
await ref.set({
  linkoId: 0,
  name: 'Test do‘koni',
  phones: [],
  extraPhones: [phone],
  address: 'Toshkent, sinov manzili',
  location: null,
  agentId: 0,
  agentName: 'Sinov agenti',
  priceListId: 0,
  priceListName: '',
  marketTypeName: '',
  note: 'Sinov uchun — scripts/create-test-shop.mjs',
  deliveryDays: [],
  active: true,
  linkoActive: true,
  hasCode: true,
  codeIssuedAt: now,
  source: 'manual',
  // Nasiyani sinash uchun chegara (admin → Do'konlar da o'zgartiriladi)
  creditLimit: 5_000_000,
  creditDays: 7,
  updatedAt: now,
  ...(exists ? {} : { createdAt: now, memberIds: [], balance: 0, cashback: 0, syncedAt: null }),
}, { merge: true })
await db.collection('shop_codes').doc(id).set({ code, issuedAt: now, issuedBy: 'create-test-shop' })

const pretty = `+${phone.slice(0, 3)} ${phone.slice(3, 5)} ${phone.slice(5, 8)} ${phone.slice(8, 10)} ${phone.slice(10)}`
console.log(`✅ Sinov do'koni ${exists ? 'yangilandi' : 'yaratildi'}`)
console.log(`   Telefon: ${pretty}`)
console.log(`   Kod:     ${code}`)
process.exit(0)
