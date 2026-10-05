/**
 * Firebase mijoz (web) konfiguratsiyasi.
 *
 * Bu qiymatlar MAXFIY EMAS — Firebase ularni brauzerga ataylab ochiq
 * beradi, himoya Firestore Rules va App Check tomonida. Shuning uchun
 * env o'zgaruvchi emas, oddiy konstanta: Vercel'da 7 ta o'zgaruvchini
 * to'ldirish o'rniga shu faylni almashtirish kifoya.
 *
 * Firebase Console → ⚙️ Project Settings → General → "Your apps" →
 * Web app → SDK setup and configuration → Config.
 *
 * DIQQAT: bu yerdagi projectId bot ishlatadigan service account
 * (bot/config.py → FIREBASE_KEY_FILE) bilan BIR XIL loyihaga tegishli
 * bo'lishi shart. Aks holda bot bir bazaga yozadi, ilova boshqasidan
 * o'qiydi va katalog bo'sh ko'rinadi.
 *
 * TODO(Trade Avenue): yangi Firebase loyihasi ochilgach shu qiymatlarni
 * to'ldiring. Hozirgilari — hech qayerga ulanmaydigan shablon.
 */
export const firebaseConfig = {
  apiKey: 'TODO-firebase-api-key',
  authDomain: 'trade-avenue.firebaseapp.com',
  projectId: 'trade-avenue',
  storageBucket: 'trade-avenue.firebasestorage.app',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:0000000000000000000000',
}
