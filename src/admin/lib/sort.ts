import { useCallback, useRef, useState } from 'react'

/**
 * Sudrab tartiblashda ro'yxat qo'yib yuborilgan joyida DARHOL turishi uchun.
 *
 * Server javobi va Firestore yangilanishi yarim soniyagacha kechikadi.
 * Shu orada ekranda eski tartib ko'rinsa, qator «orqaga sakrab», keyin
 * yana joyiga qaytardi. Shuning uchun yangi holat mahalliy ushlab turiladi
 * va Firestore'dan xuddi shu holat kelganda qo'yib yuboriladi.
 *
 * Saqlashlar navbat bilan ketadi: ketma-ket ikki sudrashda eskisining
 * javobi yangisidan keyin kelib, tartibni buzib qo'ymaydi.
 *
 *   server    — Firestore'dan kelgan joriy holat
 *   signature — holatni solishtirish uchun qisqa satr
 *   save      — serverga yozadi (xato tashlasa holat bekor qilinadi)
 *   scope     — qaysi ro'yxat (masalan kategoriya). Boshqa ro'yxatga
 *               o'tilganda eski mahalliy holat ko'rsatilmaydi.
 */
export function useOptimisticValue<T>(
  server: T,
  signature: (value: T) => string,
  save: (value: T) => Promise<void>,
  onError: (message: string) => void,
  scope = '',
) {
  const [pending, setPending] = useState<{ value: T; sig: string; version: number; scope: string } | null>(null)
  const version = useRef(0)
  const queue = useRef<Promise<void>>(Promise.resolve())

  // Firestore xuddi shu holatni qaytardi — mahalliy nusxa endi keraksiz
  const serverSig = signature(server)
  if (pending && pending.scope === scope && pending.sig === serverSig) setPending(null)
  const active = pending && pending.scope === scope ? pending : null

  const commit = useCallback(
    (value: T) => {
      const v = ++version.current
      setPending({ value, sig: signature(value), version: v, scope })

      queue.current = queue.current
        .then(() => save(value))
        .then(
          () => {
            // Zaxira: Firestore boshqa shaklda qaytarsa ham abadiy osilib qolmasin
            window.setTimeout(() => {
              setPending((current) => (current && current.version === v ? null : current))
            }, 4000)
          },
          (error: unknown) => {
            setPending((current) => (current && current.version === v ? null : current))
            onError(error instanceof Error ? error.message : 'Tartib saqlanmadi')
          },
        )
    },
    [signature, save, onError, scope],
  )

  return { value: active ? active.value : server, commit, saving: Boolean(active) }
}

/** Massivda elementni `from` dan `to` ga ko'chiradi (yangi massiv). */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** `order` bo'yicha saralaydi; qiymati yo'qlar oxirida turadi. */
export function byOrder<T extends { order?: number }>(a: T, b: T): number {
  return (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
}
