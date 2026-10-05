import { ArrowLeft, Heart, Search } from 'lucide-react'
import { IconButton } from '../ui/IconButton'
import { PageTitle } from './PageTitle'
import { useT } from '../../i18n'

type Props = {
  title: string
  /**
   * Orqaga qaytish. Berilgan bo'lsa sarlavha chapida tugma chiqadi.
   * Bosh sahifada berilmaydi — u eng yuqori sahifa.
   */
  onBack?: () => void
  onSearch?: () => void
  /**
   * Sevimlilar. Savat pastdagi menyuga ko'chgani uchun tepada endi
   * yurak turadi. Sevimlilar sahifasining O'ZIDA berilmaydi — o'ziga
   * olib boradigan tugma keraksiz.
   */
  onFavorites?: () => void
  /** Tepa panel uchun qisqa nom (to'liq ekranda). */
  shortTitle?: string
}

export function PageHeader({ title, shortTitle, onBack, onSearch, onFavorites }: Props) {
  const t = useT()

  return (
    // To'liq ekranda nom va «orqaga» tepa panelga o'tadi (Telegram'ning
    // o'z «Back» tugmasi bor). Qatorda boshqa hech narsa qolmasa — butunlay yashiriladi.
    <header
      className={'page-head flex items-center gap-2 px-5 pt-8 sm:px-10' + (onSearch || onFavorites ? '' : ' page-head--solo')}
    >
      {onBack && (
        <button
          onClick={onBack}
          className="back-button"
          aria-label={t('common.back')}
        >
          <ArrowLeft size={20} />
        </button>
      )}

      {/* Orqaga tugmasi, qidiruv va sevimlilar bilan birga uzun sarlavha
          telefonda sig'maydi — shuning uchun kichikroq boshlanadi. */}
      <PageTitle short={shortTitle} className="min-w-0 flex-1 truncate text-xl font-extrabold tracking-tight sm:text-3xl">
        {title}
      </PageTitle>

      {/* To'liq ekranda nom tepaga ketgach bo'shagan joyni qidiruv maydoni egallaydi */}
      {onSearch && (
        <button onClick={onSearch} className="search-trigger page-head__search" style={{ color: 'var(--faint)' }}>
          <Search className="shrink-0" size={19} />
          <span className="truncate text-sm">{t('home.searchPlaceholder')}</span>
        </button>
      )}

      <div className="flex shrink-0 items-center gap-1">
        {onSearch && (
          <IconButton label={t('search.title')} onClick={onSearch} className="page-head__search-icon">
            <Search />
          </IconButton>
        )}
        {onFavorites && (
          <IconButton label={t('favorites.title')} onClick={onFavorites}>
            <Heart />
          </IconButton>
        )}
      </div>
    </header>
  )
}
