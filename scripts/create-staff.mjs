/**
 * Admin panelga xodim qo'shadi (yoki mavjudining parolini/rolini yangilaydi).
 *
 * Birinchi egani shu skript bilan yaratasiz — undan keyin qolganlari
 * admin panelning o'zidan qo'shiladi.
 *
 * Ishlatish (loyiha ildizidan):
 *   node scripts/create-staff.mjs <email> <parol> [rol] [ism] [telegramId]
 *
 * Masalan:
 *   node scripts/create-staff.mjs musa@example.com "Kuchli-Parol-123" owner "Abubakr" 7203124812
 *
 * Rollar: owner | admin | courier   (ko'rsatilmasa — owner)
 *
 * Loyiha src/config/firebase.ts dagi projectId bo'yicha tanlanadi —
 * ildizda bir nechta service account fayli bo'lsa ham to'g'risi olinadi.
 */
import { connect } from './_firebase.mjs'

const ROLES = ['owner', 'admin', 'courier']

const [, , email, password, role = 'owner', name = '', telegramId = ''] = process.argv

if (!email || !password) {
  console.error('Ishlatish: node scripts/create-staff.mjs <email> <parol> [rol] [ism] [telegramId]')
  process.exit(1)
}
if (!ROLES.includes(role)) {
  console.error(`Rol noto'g'ri: ${role}. Ruxsat etilgan: ${ROLES.join(', ')}`)
  process.exit(1)
}
if (password.length < 8) {
  console.error("Parol kamida 8 belgidan iborat bo'lsin.")
  process.exit(1)
}

const { auth, db } = connect()

let user
try {
  user = await auth.getUserByEmail(email)
  await auth.updateUser(user.uid, { password, displayName: name || user.displayName })
  console.log(`Mavjud hisob yangilandi: ${email}`)
} catch (error) {
  if (error.code !== 'auth/user-not-found') throw error
  user = await auth.createUser({ email, password, displayName: name || email })
  console.log(`Yangi hisob yaratildi: ${email}`)
}

// Rol ikki joyda: custom claim (Firestore Rules uchun) va staff hujjati
// (admin panel ro'yxati va darhol bloklash uchun).
await auth.setCustomUserClaims(user.uid, { role })

await db.collection('staff').doc(user.uid).set(
  {
    uid: user.uid,
    email,
    name: name || email.split('@')[0],
    role,
    telegramId: telegramId ? Number(telegramId) : null,
    active: true,
    createdAt: new Date().toISOString(),
  },
  { merge: true },
)

console.log(`Rol: ${role}`)
console.log(`UID: ${user.uid}`)
if (telegramId) console.log(`Telegram ID: ${telegramId}`)
console.log('\nEndi /admin manzilidan shu email va parol bilan kiring.')
process.exit(0)
