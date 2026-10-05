/**
 * Buyurtmalarni tozalash — sinov ma'lumotlarini olib tashlash uchun.
 *
 * Buyurtma o'chirilganda u mini appdan ham, admin paneldan ham
 * yo'qoladi: ikkalasi ham bitta `orders` kolleksiyasini o'qiydi.
 * Buyurtmaga bog'liq bildirishnomalar ham birga o'chiriladi, aks holda
 * mijozda mavjud bo'lmagan buyurtma haqida xabar qolib ketardi.
 *
 * Ishlatish:
 *   node scripts/clear-orders.mjs           # faqat ro'yxatni ko'rsatadi
 *   node scripts/clear-orders.mjs --delete  # o'chiradi
 *
 * DIQQAT: o'chirilganini qaytarib bo'lmaydi.
 */
import { connect } from './_firebase.mjs'

const doDelete = process.argv.includes('--delete')
const { db } = connect()

const snap = await db.collection('orders').get()

if (snap.empty) {
  console.log('Buyurtma yo‘q — tozalash shart emas.\n')
  process.exit(0)
}

console.log(`Jami ${snap.size} ta buyurtma:\n`)

const money = (v) => Number(v || 0).toLocaleString('ru-RU')

for (const doc of snap.docs) {
  const o = doc.data()
  const when = o.createdAt ? String(o.createdAt).slice(0, 16).replace('T', ' ') : '—'
  console.log(
    `  ${(o.orderNumber || doc.id).padEnd(8)} ${when}  ` +
      `${String(o.customer?.name || '—').padEnd(18)} ` +
      `${money(o.total).padStart(10)} so‘m  ${o.status || '—'}`,
  )
}

if (!doDelete) {
  console.log('\nHech narsa o‘chirilmadi.')
  console.log('O‘chirish uchun: node scripts/clear-orders.mjs --delete\n')
  process.exit(0)
}

console.log('\nO‘chirilmoqda...')

let orders = 0
let history = 0
let notifications = 0

for (const doc of snap.docs) {
  // Holat tarixi — buyurtma ichidagi kolleksiya. Firestore uni hujjat
  // bilan birga o'chirmaydi, shuning uchun qo'lda tozalaymiz.
  const hist = await doc.ref.collection('history').get()
  for (const entry of hist.docs) {
    await entry.ref.delete()
    history++
  }

  await doc.ref.delete()
  orders++
}

// Buyurtmalarga oid bildirishnomalar
const notifSnap = await db.collection('notifications').where('type', '==', 'order').get()
for (const doc of notifSnap.docs) {
  await doc.ref.delete()
  notifications++
}

console.log(`\n✅ ${orders} ta buyurtma o‘chirildi`)
if (history) console.log(`   ${history} ta tarix yozuvi`)
if (notifications) console.log(`   ${notifications} ta bildirishnoma`)
console.log('\nHisoblagich (counters/orders) tegilmadi — keyingi buyurtma')
console.log('raqami davom etadi, takrorlanmaydi.\n')

process.exit(0)
