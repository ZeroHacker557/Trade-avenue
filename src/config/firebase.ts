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
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyDy7Wjb_PPi-itFallEin4RPUsWRe2wdgU',
  authDomain: 'trade-avenue-e0e85.firebaseapp.com',
  projectId: 'trade-avenue-e0e85',
  storageBucket: 'trade-avenue-e0e85.firebasestorage.app',
  messagingSenderId: '274940114788',
  appId: '1:274940114788:web:aea7325afb056905526c71',
  measurementId: 'G-M8D6R3C98R',
}
