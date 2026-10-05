import type { SVGProps } from 'react'

export type IconProps = SVGProps<SVGSVGElement> & { size?: number | string }

/**
 * Lucide kutubxonasida yo'q, MUSA assortimentiga kerak bo'lgan ikonkalar.
 *
 * Lucide'da chuchvara ham, sirok ham yo'q — eng yaqin ikonkalar
 * (konfet, kosa) mahsulotga o'xshamasdi. Shuning uchun o'zimiz
 * chizamiz, lekin AYNAN lucide uslubida: 24×24, faqat chiziq,
 * `currentColor`, qalinligi 2, uchlari yumaloq. Shunda ular qolgan
 * ikonkalar orasida begona ko'rinmaydi.
 */
function Svg({ size = 24, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  )
}

/**
 * Chuchvara / pelmen — yarim oy shaklidagi xamir.
 *
 * Gumbaz + tekis asos + chekkasidagi burma chiziqlar: shu uchtasi
 * birga bo'lganda shakl darhol chuchvara bo'lib o'qiladi.
 */
export function DumplingIcon(props: IconProps) {
  return (
    <Svg {...props}>
      {/* Gumbaz */}
      <path d="M21 15A9 9 0 0 0 3 15" />
      {/*
        Burmali pastki chekka.
        Burmalar ikonka ICHIDA emas, aynan chekkada bo'lishi kerak —
        ichkarida ular spidometr mili kabi ko'rinib qolardi.
      */}
      <path d="M3 15q2.25 2.6 4.5 0t4.5 0 4.5 0 4.5 0" />
    </Svg>
  )
}

/**
 * Sirok — glazurlangan tvorog batonchasi.
 *
 * To'rtburchak baton va ustidagi to'lqinli shokolad chizig'i.
 */
export function CurdBarIcon(props: IconProps) {
  return (
    <Svg {...props}>
      {/*
        Baton balandroq: 9px lik to'rtburchak kichik o'lchamda ingichka
        tasmaga o'xshab qolardi, 12px esa baton bo'lib o'qiladi.
      */}
      <rect x="3" y="6" width="18" height="12" rx="3" />
      {/*
        Ikkita shokolad chizig'i.
        Ilgari pastda tekis chiziq turardi va u matn qatoriga o'xshab
        qolardi — to'lqin esa glazur bo'lib o'qiladi.
      */}
      <path d="M6 10c1.5-1.5 3 1.5 4.5 0s3 1.5 4.5 0 1.7 1.1 3 .4" />
      <path d="M6 14c1.5-1.5 3 1.5 4.5 0s3 1.5 4.5 0 1.7 1.1 3 .4" />
    </Svg>
  )
}

/**
 * Somsa — uchburchak varaqli xamir.
 */
export function SamsaIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4 3.5 18.5a1 1 0 0 0 .9 1.5h15.2a1 1 0 0 0 .9-1.5z" />
      <path d="M12 4v16" />
      <path d="M7.5 13.5h9" />
    </Svg>
  )
}
