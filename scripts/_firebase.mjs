/**
 * Skriptlar uchun Firebase Admin ulanishi.
 *
 * MUHIM: service account faylini "ildizdagi birinchi mos fayl" deb
 * tanlash MUMKIN EMAS. Loyiha ildizida eski V7 kalitlari ham yotibdi
 * (`ecommercytest`, `v7-savdo`) va alifbo bo'yicha birinchisi noto'g'ri
 * loyihaga olib boradi — natijada hisob boshqa bazada yaratiladi va
 * admin panelga kirib bo'lmaydi.
 *
 * Shuning uchun loyiha `src/config/firebase.ts` dagi `projectId` bo'yicha
 * tanlanadi: ilova va skript doim bitta bazaga qaraydi.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { cert, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

/** src/config/firebase.ts dan projectId ni o'qiydi. */
export function expectedProjectId() {
  const source = readFileSync(resolve(process.cwd(), 'src/config/firebase.ts'), 'utf8')
  const match = source.match(/projectId:\s*['"]([^'"]+)['"]/)
  if (!match) throw new Error("src/config/firebase.ts da projectId topilmadi")
  return match[1]
}

/** Shu loyihaga tegishli service account faylini topadi. */
export function findServiceAccount(projectId) {
  const candidates = readdirSync(process.cwd()).filter(
    (f) => f.includes('firebase-adminsdk') && f.endsWith('.json'),
  )

  if (!candidates.length) {
    throw new Error(
      'Service account JSON topilmadi. Firebase Console → Project Settings →\n' +
        'Service accounts → Generate new private key, va faylni loyiha ildiziga qo‘ying.',
    )
  }

  for (const file of candidates) {
    const data = JSON.parse(readFileSync(resolve(process.cwd(), file), 'utf8'))
    if (data.project_id === projectId) return { file, key: data }
  }

  const found = candidates
    .map((f) => {
      const data = JSON.parse(readFileSync(resolve(process.cwd(), f), 'utf8'))
      return `  • ${f} → ${data.project_id}`
    })
    .join('\n')

  throw new Error(
    `«${projectId}» loyihasining kaliti topilmadi.\nIldizdagi kalitlar:\n${found}\n\n` +
      'Kerakli kalitni yuklab oling yoki eski loyihalarning kalitlarini o‘chiring.',
  )
}

/** Firebase Admin'ni to'g'ri loyiha bilan ishga tushiradi. */
export function connect() {
  const projectId = expectedProjectId()
  const { file, key } = findServiceAccount(projectId)

  initializeApp({
    credential: cert({
      projectId: key.project_id,
      clientEmail: key.client_email,
      privateKey: key.private_key.replace(/\\n/g, '\n'),
    }),
  })

  console.log(`Loyiha: ${projectId}`)
  console.log(`Kalit:  ${file}\n`)

  return { projectId, key, auth: getAuth(), db: getFirestore() }
}
