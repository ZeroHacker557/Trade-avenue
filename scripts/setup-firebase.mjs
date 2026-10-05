/**
 * Yangi Firebase loyihasini tayyorlash (bir marta, xavfsiz qayta ishga tushirsa bo'ladi):
 *
 *   1. Firestore va Storage xavfsizlik qoidalarini joylaydi
 *      (firestore.rules, storage.rules — Firebase CLI'siz, service account bilan)
 *   2. Boshlang'ich sozlamalar: keshbek o'chiq (0%), yetkazish jadvali.
 *      Mavjud qiymatlarning ustidan YOZILMAYDI.
 *
 *   node scripts/setup-firebase.mjs
 */
import { readFileSync } from 'node:fs'
import { getSecurityRules } from 'firebase-admin/security-rules'
import { connect } from './_firebase.mjs'

const { db, key } = connect()
const rules = getSecurityRules()

const firestore = await rules.releaseFirestoreRulesetFromSource(readFileSync('firestore.rules', 'utf8'))
console.log(`✅ Firestore qoidalari joylandi (${firestore.name})`)

const bucket = key.project_id + '.firebasestorage.app'
try {
  const storage = await rules.releaseStorageRulesetFromSource(readFileSync('storage.rules', 'utf8'), bucket)
  console.log(`✅ Storage qoidalari joylandi (${storage.name})`)
} catch (error) {
  console.log(`⚠️  Storage qoidalari joylanmadi: ${error.message}\n    Firebase Console → Storage → «Get started» ni bosib, qayta ishga tushiring.`)
}

/** Faqat yo'q maydonlarni yozadi — admin paneldan o'zgartirilganlar saqlanadi. */
async function seed(docId, defaults) {
  const ref = db.collection('settings').doc(docId)
  const current = (await ref.get()).data() ?? {}
  const missing = Object.fromEntries(Object.entries(defaults).filter(([k]) => !(k in current)))
  if (Object.keys(missing).length) await ref.set(missing, { merge: true })
  console.log(`✅ settings/${docId}: ${Object.keys(missing).length ? Object.keys(missing).join(', ') : 'o‘zgarishsiz'}`)
}

await seed('cashback', { enabled: false, percent: 0 })
await seed('delivery', { fee: 0, freeFrom: 0, minOrder: 0, cutoff: '17:00', days: [1, 2, 3, 4, 5, 6] })
await seed('payment', { cardNumber: '', cardOwner: '', transfer: true })

console.log('\nTayyor.')
process.exit(0)
