/**
 * Admin panelga kira olmasangiz — sababini topadi.
 *
 * Hech narsani o'zgartirmaydi, faqat o'qiydi:
 *   • Qaysi Firebase loyihasiga ulanayotgani
 *   • Email/Password kirish yoqilganmi
 *   • Qaysi domenlardan kirishga ruxsat berilgan
 *   • Hisob, rol (custom claim) va staff hujjati joyidami
 *
 * Ishlatish:
 *   node scripts/check-admin.mjs [email]
 */
import { connect } from './_firebase.mjs'

const email = process.argv[2]
const { projectId, key, auth, db } = connect()

const ok = (m) => console.log(`  ✅ ${m}`)
const bad = (m) => console.log(`  ❌ ${m}`)
const info = (m) => console.log(`     ${m}`)

/** Service account bilan qisqa muddatli access token oladi. */
async function accessToken() {
  const { GoogleAuth } = await import('google-auth-library')
  const googleAuth = new GoogleAuth({
    credentials: {
      client_email: key.client_email,
      private_key: key.private_key.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/firebase'],
  })
  const client = await googleAuth.getClient()
  const token = await client.getAccessToken()
  return token.token
}

// ── 1–2. Kirish usuli va domenlar ──
console.log('1. Kirish usuli')
try {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`,
    { headers: { Authorization: `Bearer ${await accessToken()}` } },
  )
  const config = await response.json()

  if (config?.signIn?.email?.enabled) {
    ok('Email/Password yoqilgan')
  } else {
    bad('Email/Password YOQILMAGAN — kirish shu sababdan ishlamaydi')
    info('Firebase Console → Authentication → Sign-in method → Email/Password → Enable')
  }

  console.log('\n2. Ruxsat etilgan domenlar')
  const domains = config?.authorizedDomains || []
  info(domains.join(', ') || '(bo‘sh)')
  if (domains.length && !domains.includes('localhost')) {
    bad('localhost yo‘q — lokal sinovda kirish ishlamaydi')
  }
} catch (error) {
  bad(`Sozlamani o‘qib bo‘lmadi: ${error.message}`)
}

// ── 3. Xodimlar ──
console.log('\n3. Xodimlar')
const staffSnap = await db.collection('staff').get()
if (staffSnap.empty) {
  bad('staff kolleksiyasi bo‘sh — hech kim qo‘shilmagan')
  info('node scripts/create-staff.mjs <email> <parol> owner "<ism>"')
} else {
  for (const doc of staffSnap.docs) {
    const data = doc.data()
    console.log(`\n  ${data.email}  (${data.role})`)
    try {
      const user = await auth.getUser(doc.id)
      ok(`Auth hisobi bor${user.disabled ? ' — LEKIN BLOKLANGAN' : ''}`)
      const claimRole = user.customClaims?.role
      if (claimRole === data.role) ok(`Rol custom claim'da: ${claimRole}`)
      else bad(`Custom claim roli mos emas: ${claimRole ?? '(yo‘q)'} ≠ ${data.role}`)
    } catch {
      bad('Auth hisobi yo‘q — faqat Firestore hujjati qolgan')
    }
    if (data.active === false) bad('staff hujjatida active: false')
  }
}

// ── 4. Aniq email ──
if (email) {
  console.log(`\n4. «${email}»`)
  try {
    const user = await auth.getUserByEmail(email)
    ok(`Topildi, UID: ${user.uid}`)
    const staff = await db.collection('staff').doc(user.uid).get()
    if (staff.exists) ok('staff hujjati bor')
    else bad('staff hujjati YO‘Q — panel «ruxsat yo‘q» deydi')
  } catch {
    bad(`«${projectId}» loyihasida bunday email yo‘q`)
    info('Kirishda aynan shu emailni yozganingizga ishonch hosil qiling')
  }
}

console.log('')
process.exit(0)
