import { Suspense, lazy, useEffect, useState } from 'react'
import { BottomNav } from './components/layout/BottomNav'
import { TopBar } from './components/layout/TopBar'
import { SearchOverlay } from './components/layout/SearchOverlay'
import { CartDrawer } from './components/cart/CartDrawer'
import { CartPrompt } from './components/cart/CartPrompt'
import { AddressPrompt } from './components/address/AddressPrompt'
import { SplashAd } from './components/promo/SplashAd'
import { Toast } from './components/ui/Toast'
import { CheckoutSuccess } from './components/ui/CheckoutSuccess'
import { useShopStore } from './hooks/use-shop-store'
import { useSwipeNav } from './hooks/use-swipe-nav'
import { usePresence } from './hooks/use-presence'
import { useKeyboardInset } from './hooks/use-keyboard-inset'
import { CatalogPage } from './pages/CatalogPage'
import { CheckoutPage } from './pages/CheckoutPage'
import { FavoritesPage } from './pages/FavoritesPage'
import { HomePage } from './pages/HomePage'
import { OrdersPage } from './pages/OrdersPage'
import { ProductDetailPage } from './pages/ProductDetailPage'
import { ProfilePage } from './pages/ProfilePage'
import { ProfileEditPage } from './pages/ProfileEditPage'
import { ReceiptPage } from './pages/ReceiptPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { LanguagePage } from './pages/LanguagePage'
import { SupportPage } from './pages/SupportPage'
import { setupBackButton, toggleBackButton, watchSafeArea } from './utils/telegram'
import { SERVER_LANG_KEY, useI18n } from './i18n'
import { useCourierMode } from './courier/mode'

// Kuryer sahifasi faqat kuryerlarga yuklanadi — mijozning ilovasi og'irlashmaydi
const CourierApp = lazy(() =>
  import('./courier/CourierApp').then((m) => ({ default: m.CourierApp })),
)

// Xarita kutubxonasi (~150 KB) faqat manzil sahifasi ochilganda yuklanadi (P-01)
const AddressesPage = lazy(() =>
  import('./pages/AddressesPage').then((m) => ({ default: m.AddressesPage })),
)

/** Pastki menyu ko'rinmaydigan sahifalar. */
const FULLSCREEN_PAGES = [
  'detail', 'checkout', 'addresses', 'profile_edit', 'notifications', 'language', 'support', 'receipt',
]

function PageFallback() {
  return (
    <div className="flex justify-center py-24">
      <div
        className="size-8 animate-spin rounded-full border-4"
        style={{ borderColor: 'var(--brand-soft)', borderTopColor: 'var(--brand)' }}
      />
    </div>
  )
}

function App() {
  const shop = useShopStore()
  const { lang, setLang } = useI18n()
  // Admin panelda kuryer qilib qo'shilganlarga — kuryer sahifasi
  const courier = useCourierMode(shop.userProfile)

  const productActions = {
    onOpen: shop.openProduct,
    onAddToCart: shop.addToCart,
    cartQtyOf: shop.cartQtyOf,
    onChangeQty: shop.changeCartQty,
    likedIds: shop.likedIds,
    onToggleLike: shop.toggleLike,
  }

  // Telegram xavfsiz zonasi
  useEffect(() => watchSafeArea(), [])

  // Klaviatura ochilganda pastdagi maydonlar to'silib qolmasin
  useKeyboardInset()

  // Katalog keldi — ochilish animatsiyasi (index.html) tugashi mumkin
  useEffect(() => {
    if (!shop.loading) window.dispatchEvent(new Event('ta:ready'))
  }, [shop.loading])

  // Telegram BackButton — Android'ning tizim tugmasi ham shu bilan ishlaydi
  // Kuryer sahifasi orqaga tugmasini o'zi boshqaradi (tafsilotlar oynasi).
  useEffect(() => {
    if (courier.active) return undefined
    return setupBackButton(shop.goBack)
  }, [courier.active, shop.goBack])

  // Chap-o'ngga surish bilan asosiy sahifalar orasida yurish.
  // Oyna ochiq bo'lsa o'chiriladi — savat yoki qidiruv ustida surish
  // sahifani almashtirmasligi kerak.
  // Kuryer sahifasida do'kon sahifalari ko'rinmaydi — surish va orqaga
  // tugmasi ularni ko'rinmas holda almashtirib yurmasin
  useSwipeNav(shop.page, shop.navigate, !courier.active && !shop.isCartOpen && !shop.isSearchOpen)
  useEffect(
    () => toggleBackButton(!courier.active && shop.canGoBack),
    [courier.active, shop.canGoBack],
  )

  // Profilda saqlangan til — botda yoki boshqa qurilmada tanlangani.
  // Serverdagi qiymat o'zgarsa ilova ham o'sha tilga o'tadi, lekin bir
  // qiymat ikki marta qo'llanmaydi.
  useEffect(() => {
    const saved = shop.userProfile?.language
    if (!saved) return
    let applied: string | null = null
    try {
      applied = localStorage.getItem(SERVER_LANG_KEY)
    } catch {
      // localStorage yopiq bo'lsa — har ochilishda profildagi til qo'llanadi
    }
    if (applied === saved) return
    try {
      localStorage.setItem(SERVER_LANG_KEY, saved)
    } catch {
      // belgini saqlab bo'lmasa ham til almashadi
    }
    if (saved !== lang) setLang(saved)
  }, [shop.userProfile?.language, lang, setLang])

  // Ochilish reklamasi ko'rinib turganda manzil taklifi kutib turadi
  const [adVisible, setAdVisible] = useState(false)
  const goToCatalog = () => shop.navigate('catalog')
  // Savat yopilganda ham silliq tushib ketsin — styles.css `.cart-drawer.leaving`
  const cartPresence = usePresence(shop.isCartOpen, 280)

  if (courier.active) {
    return (
      <main className="app-shell">
        <div className="app-container">
          <div className="app-tint" aria-hidden="true" />
          <TopBar />
          <Suspense fallback={<PageFallback />}>
            <CourierApp
              focusId={courier.focusId}
              supportId={courier.supportId}
              photo={shop.userProfile?.photo_url}
              onOpenShop={courier.openShop}
              onNotCourier={courier.dropCourier}
            />
          </Suspense>
        </div>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <div className="app-container">
        {/* Tepadagi yumshoq yashil tus (faqat yorug' rejimda ko'rinadi) */}
        <div className="app-tint" aria-hidden="true" />

        {/* To'liq ekranda Telegram tugmalari orasidagi sahifa nomi */}
        <TopBar />

        {shop.isSearchOpen && (
          <SearchOverlay
            query={shop.query}
            results={shop.searchResults}
            onQueryChange={shop.setQuery}
            onClose={() => shop.setSearchOpen(false)}
            onOpenProduct={shop.openProduct}
          />
        )}

        {cartPresence.mounted && (
          <CartDrawer
            leaving={cartPresence.leaving}
            cartProducts={shop.cartProducts}
            cartTotal={shop.cartTotal}
            onClose={shop.closeCart}
            onUpdateQuantity={shop.updateCartQuantity}
            onCheckout={shop.goToCheckout}
            onGoToCatalog={goToCatalog}
          />
        )}

        <Toast message={shop.toast} onClose={shop.clearToast} />

        {/* Savatga qo'shilgach — «Rasmiylashtirasizmi?» so'rovi.
            Savat ochiq bo'lsa yoki mijoz allaqachon rasmiylashtirayotgan
            bo'lsa ko'rsatilmaydi. */}
        {shop.cartPrompt && !shop.isCartOpen && shop.page !== 'checkout' && (
          <CartPrompt
            key={shop.cartPrompt}
            productName={shop.cartPrompt}
            onCheckout={shop.goToCheckout}
            onDismiss={shop.dismissCartPrompt}
          />
        )}
        {shop.checkoutDone && (
          <CheckoutSuccess
            onViewOrders={() => {
              // Oyna darhol yopiladi — ilgari 4 soniyalik taymerni kutib turardi
              shop.dismissCheckout()
              shop.navigate('orders')
            }}
            onClose={shop.dismissCheckout}
          />
        )}

        {/* Yangi mijozga manzil taklifi — ilova ochilgach 2 soniyadan keyin */}
        {shop.askAddress && !adVisible && (
          <AddressPrompt
            onHere={() => shop.openAddresses('here')}
            onOther={() => shop.openAddresses('other')}
            onDismiss={shop.dismissAddressPrompt}
          />
        )}

        {/* Ochilish reklamasi — admin panel → «Reklama banneri» */}
        <SplashAd
          products={shop.products}
          sections={shop.sections}
          onOpenCategory={shop.openCategory}
          onOpenProduct={shop.openProduct}
          onVisibleChange={setAdVisible}
        />

        <div className="page-wrapper">
          {shop.page === 'home' && (
            <div className="page-animate">
              <HomePage
                products={shop.products}
                categories={shop.categories}
                loading={shop.loading}
                promotions={shop.runningPromotions}
                {...productActions}
                unreadNotificationsCount={shop.unreadNotificationsCount}
                onSearch={() => shop.setSearchOpen(true)}
                onNavigate={shop.navigate}
                onOpenCategory={shop.openCategory}
                banners={shop.homeBanners}
                onOpenSection={shop.openSectionById}
                onOpenProduct={shop.openProductById}
                lastOrder={shop.myOrders[0]}
                onReorder={shop.reorder}
              />
            </div>
          )}

          {shop.page === 'catalog' && (
            <div className="page-animate">
              <CatalogPage
                key={`${shop.catalogCategory ?? 'all'}:${shop.catalogSection ?? ''}`}
                products={shop.products}
                categories={shop.categories}
                sections={shop.sections}
                loading={shop.loading}
                initialCategory={shop.catalogCategory}
                initialSection={shop.catalogSection}
                {...productActions}
                onSearch={() => shop.setSearchOpen(true)}
                onFavorites={() => shop.navigate('favorites')}
                onBack={shop.goBack}
              />
            </div>
          )}

          {shop.page === 'favorites' && (
            <div className="page-animate">
              <FavoritesPage
                products={shop.products}
                loading={shop.loading}
                {...productActions}
                onGoToCatalog={goToCatalog}
                onBack={shop.goBack}
              />
            </div>
          )}

          {shop.page === 'orders' && (
            <div className="page-animate">
              <OrdersPage
                orders={shop.myOrders}
                ordersReady={shop.ordersReady}
                authReady={shop.authReady}
                isAuthenticated={shop.isAuthenticated}
                onSearch={() => shop.setSearchOpen(true)}
                onFavorites={() => shop.navigate('favorites')}
                onGoToCatalog={goToCatalog}
                onOpenReceipt={shop.openReceipt}
                onReorder={shop.reorder}
                onBack={shop.goBack}
              />
            </div>
          )}

          {shop.page === 'profile' && (
            <div className="page-animate">
              <ProfilePage
                profile={shop.userProfile}
                orders={shop.myOrders}
                ordersReady={shop.ordersReady}
                theme={shop.theme}
                onToggleTheme={shop.toggleTheme}
                onNavigate={shop.navigate}
                onNotify={shop.notify}
                onOpenCourier={courier.isCourier ? courier.openCourier : undefined}
              />
            </div>
          )}

          {shop.page === 'detail' && shop.selectedProduct && (
            <ProductDetailPage
              product={shop.selectedProduct}
              onAddToCart={shop.addToCart}
              onBack={shop.goBack}
              likedIds={shop.likedIds}
              onToggleLike={shop.toggleLike}
              onOpenCart={shop.openCart}
              cartCount={shop.cartCount}
              hideBottomBar={shop.isCartOpen || shop.isSearchOpen}
              onOpenProduct={shop.openProduct}
            />
          )}

          {shop.page === 'checkout' && (
            <CheckoutPage
              profile={shop.userProfile}
              cartProducts={shop.cartProducts}
              cartTotal={shop.cartTotal}
              orderForm={shop.orderForm}
              onUpdateForm={shop.updateOrderForm}
              onSubmit={shop.submitOrder}
              isSubmitting={shop.isSubmitting}
              onBack={shop.goBack}
              onNavigate={shop.navigate}
              lastUsedAddress={shop.myOrders[0]?.customer?.address}
              onEditAddress={(addressId) => shop.openAddresses(null, addressId)}
              onAddAddress={() => shop.openAddresses('here')}
            />
          )}

          {shop.page === 'addresses' && (
            <div className="page-animate">
              <Suspense fallback={<PageFallback />}>
                <AddressesPage
                  profile={shop.userProfile}
                  onBack={shop.goBack}
                  onNotify={shop.notify}
                  intent={shop.addressIntent}
                  editId={shop.editAddressId}
                />
              </Suspense>
            </div>
          )}

          {shop.page === 'profile_edit' && (
            <div className="page-animate">
              <ProfileEditPage profile={shop.userProfile} onBack={shop.goBack} onNotify={shop.notify} />
            </div>
          )}

          {shop.page === 'language' && (
            <div className="page-animate">
              <LanguagePage onBack={shop.goBack} onNotify={shop.notify} />
            </div>
          )}

          {shop.page === 'notifications' && (
            <div className="page-animate">
              <NotificationsPage notifications={shop.notifications} onBack={shop.goBack} />
            </div>
          )}

          {shop.page === 'receipt' && shop.selectedOrder && (
            <div className="page-animate">
              <ReceiptPage
                order={shop.selectedOrder}
                onBack={shop.goBack}
                onHome={() => shop.navigate('home')}
                onReorder={shop.reorder}
              />
            </div>
          )}

          {shop.page === 'support' && (
            <div className="page-animate">
              <SupportPage onBack={shop.goBack} />
            </div>
          )}
        </div>

        {!FULLSCREEN_PAGES.includes(shop.page) && (
          <BottomNav
            page={shop.page}
            onNavigate={shop.navigate}
            onOpenCart={shop.openCart}
            cartOpen={shop.isCartOpen}
            cartCount={shop.cartCount}
            ordersBadge={shop.unseenOrdersCount}
          />
        )}
      </div>
    </main>
  )
}

export default App
