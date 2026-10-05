import type { App } from 'firebase-admin/app'
import type { Auth } from 'firebase-admin/auth'
import type { Firestore } from 'firebase-admin/firestore'

/**
 * Serverless funksiyalar uchun firebase-admin.
 *
 * MUHIM: firebase-admin faqat KERAK BO'LGANDA yuklanadi (dynamic import).
 * Modul darajasida import qilinsa, kutubxona yuklanishida yuzaga kelgan
 * har qanday muammo butun funksiyani ishga tushmaydigan qilib qo'yadi va
 * Vercel FUNCTION_INVOCATION_FAILED qaytaradi — mijoz esa hech qanday
 * tushunarli xato ko'rmaydi.
 *
 * Service account JSON butunligicha FIREBASE_SERVICE_ACCOUNT env
 * o'zgaruvchisida saqlanadi.
 */

let cachedApp: App | null = null

async function createApp(): Promise<App> {
  if (cachedApp) return cachedApp

  const { cert, getApps, initializeApp } = await import('firebase-admin/app')

  const existing = getApps()
  if (existing.length) {
    cachedApp = existing[0]
    return cachedApp
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT sozlanmagan')
  }

  let parsed: Record<string, string>
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT yaroqli JSON emas')
  }

  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT to‘liq emas')
  }

  cachedApp = initializeApp({
    credential: cert({
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      // Env o'zgaruvchida yangi qatorlar \n ko'rinishida qolgan bo'lishi mumkin
      privateKey: parsed.private_key.replace(/\\n/g, '\n'),
    }),
  })

  return cachedApp
}

export async function adminAuth(): Promise<Auth> {
  const { getAuth } = await import('firebase-admin/auth')
  return getAuth(await createApp())
}

let cachedDb: Firestore | null = null

export async function adminDb(): Promise<Firestore> {
  if (cachedDb) return cachedDb

  const { getFirestore } = await import('firebase-admin/firestore')
  const db = getFirestore(await createApp())

  // Serverless muhitda gRPC ishlamaydi: bundler @google-cloud/firestore
  // ning protobuf fayllarini tashlab ketadi va har qanday so'rov
  // tushunarsiz xato bilan yiqiladi. REST rejimi bu muammoni chetlab o'tadi.
  db.settings({ preferRest: true })

  cachedDb = db
  return cachedDb
}

/**
 * Storage savati (zaxira nusxalar uchun). Nomi `FIREBASE_STORAGE_BUCKET`
 * dan, bo'lmasa loyiha standarti: `<project_id>.firebasestorage.app`
 * (bot/config.py dagi bilan bir xil).
 */
export async function adminBucket() {
  const { getStorage } = await import('firebase-admin/storage')
  const app = await createApp()
  let name = process.env.FIREBASE_STORAGE_BUCKET || ''
  if (!name) {
    const projectId = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}').project_id
    name = `${projectId}.firebasestorage.app`
  }
  return getStorage(app).bucket(name)
}
