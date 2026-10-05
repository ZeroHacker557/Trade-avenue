/**
 * Ma'lumot kelguncha ko'rsatiladigan skeletlar.
 *
 * Nega «0» emas? Mijoz ilovani ochganda buyurtmalar va mahsulotlar
 * Firestore'dan bir lahzadan keyin keladi. Shu oraliqda «0 ta mahsulot»
 * yoki «buyurtma yo'q» ko'rinsa, mijoz nimadir yo'qolib qolgan deb
 * qo'rqib ketishi mumkin. Skelet esa «yuklanyapti» degan ma'noni beradi
 * va joy o'lchami saqlangani uchun sahifa sakramaydi.
 */

/** Bir qator matn o'rnida — masalan «Jami 12 ta mahsulot». */
export function TextSkeleton({ className = 'h-4 w-32' }: { className?: string }) {
  return <span className={'skeleton inline-block align-middle ' + className} aria-hidden="true" />
}

/** Buyurtma kartochkasi shaklidagi skelet. */
export function OrderCardSkeleton() {
  return (
    <div className="order-card flex-col gap-3" aria-hidden="true">
      <div className="flex items-center justify-between">
        <span className="skeleton h-3 w-24" />
        <span className="skeleton h-3 w-16" />
      </div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className="skeleton block h-4 w-4/5" />
          <span className="skeleton mt-2 block h-3 w-1/3" />
          <div className="mt-3 flex gap-1.5">
            <span className="skeleton size-11" />
            <span className="skeleton size-11" />
          </div>
        </div>
        <span className="skeleton h-5 w-20" />
      </div>
    </div>
  )
}

export function OrderListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4" role="status" aria-label="Yuklanmoqda">
      {Array.from({ length: count }, (_, i) => (
        <OrderCardSkeleton key={i} />
      ))}
    </div>
  )
}
