import type { ComponentType, SVGProps } from 'react'
import {
  Apple, Baby, Bath, Battery, Beef, Beer, Cake, Candy, Carrot, Cigarette, Coffee, Cookie, Croissant,
  CupSoda, Drumstick, Egg, Fish, GlassWater, Grid2X2, Milk, Package, PawPrint, Pencil, Shirt,
  ShoppingBasket, Snowflake, Soup, Sparkles, SprayCan, ToyBrick, Wheat, Wine,
} from 'lucide-react'

/** Ikonka komponenti (lucide yoki o'zimiz chizgan). */
export type CategoryIconType = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>

/**
 * Kategoriya ikonkasi.
 *
 * Avval bazadagi `icon` maydoniga qaraydi (admin tanlagan), topilmasa
 * nom bo'yicha taxmin qiladi, u ham bo'lmasa umumiy savat ishlatiladi.
 *
 * Ro'yxat do'konlar uchun ulgurji assortimentga moslangan: oziq-ovqat,
 * ichimliklar, shirinliklar, maishiy kimyo, gigiyena va boshqalar.
 */
export const CATEGORY_ICONS: Record<string, CategoryIconType> = {
  all: Grid2X2,
  drinks: CupSoda,
  water: GlassWater,
  coffee: Coffee,
  dairy: Milk,
  meat: Beef,
  chicken: Drumstick,
  fish: Fish,
  eggs: Egg,
  grocery: Wheat,
  pasta: Soup,
  bakery: Croissant,
  fruits: Apple,
  vegetables: Carrot,
  frozen: Snowflake,
  sweets: Candy,
  snacks: Cookie,
  cakes: Cake,
  alcohol: Wine,
  beer: Beer,
  tobacco: Cigarette,
  chemicals: SprayCan,
  hygiene: Bath,
  cosmetics: Sparkles,
  baby: Baby,
  pets: PawPrint,
  stationery: Pencil,
  electronics: Battery,
  clothes: Shirt,
  toys: ToyBrick,
  box: Package,
}

/** Admin tanlashi mumkin bo'lgan kalitlar (admin → Kategoriyalar). */
export const CATEGORY_ICON_KEYS = Object.keys(CATEGORY_ICONS).filter((key) => key !== 'all')

const BY_NAME: [RegExp, CategoryIconType][] = [
  [/suv|water|вода/i, GlassWater],
  [/ichimlik|napitok|gazli|sharbat|drink|juice|напит|сок|газир/i, CupSoda],
  [/qahva|kofe|choy|coffee|tea|кофе|чай/i, Coffee],
  [/sut|qatiq|pishloq|dairy|milk|cheese|молоч|молоко|сыр/i, Milk],
  [/go[ʻ'`]?sht|kolbasa|sosiska|meat|sausage|мяс|колбас|сосис/i, Beef],
  [/tovuq|chicken|кур/i, Drumstick],
  [/baliq|fish|рыб/i, Fish],
  [/tuxum|egg|яйц/i, Egg],
  [/non|bulochka|bakery|bread|хлеб|выпеч/i, Croissant],
  [/makaron|lag[ʻ']?mon|pasta|noodle|макарон|лапш/i, Soup],
  [/un\b|guruch|yorma|bakaleya|grocery|flour|rice|круп|мука|рис|бакале/i, Wheat],
  [/meva|fruit|фрукт/i, Apple],
  [/sabzavot|vegetable|овощ/i, Carrot],
  [/muzlatilgan|muzqaymoq|frozen|заморож|морожен/i, Snowflake],
  [/shirinlik|konfet|shokolad|candy|sweet|chocolate|конфет|сладост|шоколад/i, Candy],
  [/pechen|chips|snek|snack|cookie|печень|чипс|снек/i, Cookie],
  [/tort|keks|cake|торт|кекс/i, Cake],
  [/pivo|beer|пиво/i, Beer],
  [/vino|aroq|alkogol|wine|alcohol|вино|алког/i, Wine],
  [/sigaret|tamaki|tobacco|сигарет|табак/i, Cigarette],
  [/kimyo|kukun|yuvish|tozalash|chemical|detergent|хими|порош|моющ/i, SprayCan],
  [/gigiyena|sovun|shampun|tish|hygiene|soap|shampoo|гигиен|мыло|шампун/i, Bath],
  [/kosmetika|parfyum|cosmetic|космет|парфюм/i, Sparkles],
  [/bolalar|taglik|baby|diaper|детск|подгуз/i, Baby],
  [/hayvon|pet|корм|животн/i, PawPrint],
  [/kanstovar|daftar|ruchka|stationery|канц/i, Pencil],
  [/batareya|elektr|battery|electronic|батар|электр/i, Battery],
  [/kiyim|clothes|одежд/i, Shirt],
  [/o[ʻ']?yinchoq|toy|игруш/i, ToyBrick],
  [/to[ʻ']?plam|set|combo|набор/i, Package],
  [/barcha|hamma|все|all/i, Grid2X2],
]

/**
 * Yangi kategoriyaga bot/eski panel doim "package" yozardi — bu "tanlanmagan"
 * degani. Shuning uchun uni e'tiborsiz qoldirib, nom bo'yicha aniqlashga o'tamiz.
 */
const UNSET_ICONS = new Set(['', 'package', 'Package'])

export function categoryIcon(icon?: string, name?: string): CategoryIconType {
  if (icon && !UNSET_ICONS.has(icon.trim())) {
    const found = CATEGORY_ICONS[icon.toLowerCase().trim()]
    if (found) return found
  }
  if (name) {
    for (const [pattern, Icon] of BY_NAME) {
      if (pattern.test(name)) return Icon
    }
  }
  return ShoppingBasket
}
