import {
  ChevronDown,
  ChevronUp,
  Mail,
  MessageCircle,
  Phone,
  MapPin,
  ArrowLeft,
  Headphones,
  Clock,
  CheckCircle2,
  BadgePercent,
  Boxes,
  Truck,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { BRAND } from '../config/brand'
import { DEFAULT_CONTACT, phoneHref, telegramHref, type ContactInfo } from '../config/contact'
import { subscribeToContact } from '../lib/firebase'
import { useI18n, useT } from '../i18n'
import { PageTitle } from '../components/layout/PageTitle'

type Props = {
  onBack: () => void
}

const faqs_uz = [
  {
    q: "Trade Avenue nima?",
    a: "Trade Avenue — do‘konlar uchun ulgurji savdo xizmati. Katalog, ulgurji narxlar, buyurtma va yetkazish holati — hammasi Telegram ichida, agent kelishini kutmasdan.",
  },
  {
    q: "Ilovaga qanday kiraman?",
    a: "Birinchi kirishda do‘koningiz telefon raqami va agentimiz bergan 6 belgili kod so‘raladi. Kodni bir marta kiritasiz — keyin ilova sizni eslab qoladi.",
  },
  {
    q: "Narxlar kimga qanday?",
    a: "Narxlar ulgurji va do‘koningiz toifasiga bog‘liq. Katalogda ko‘rinayotgan narx — aynan sizning do‘koningiz uchun. Ko‘p miqdorda olganda qo‘shimcha chegirma bo‘lishi mumkin.",
  },
  {
    q: "Buyurtma qachon yetkaziladi?",
    a: "Yetkazish kunlari hududingizga qarab belgilanadi. Buyurtma holati o‘zgarganda ilova va bot orqali xabar keladi.",
  },
  {
    q: "Eng kam buyurtma summasi bormi?",
    a: "Ha, minimal summa savat va buyurtma sahifasida ko‘rsatiladi. Yetmasa — qancha qo‘shish kerakligi yozib turiladi.",
  },
  {
    q: "To‘lov qanday amalga oshiriladi?",
    a: "Naqd pul (yetkazishda) yoki karta orqali o‘tkazma. Karta orqali to‘lasangiz, buyurtma berishda to‘lov cheki skrinshotini yuklaysiz — menejer tekshirib tasdiqlaydi.",
  },
  {
    q: "Har safar bir xil tovar olaman — tezroq qilsa bo‘ladimi?",
    a: "Ha. Tovarlarni «Doimiy ro‘yxat»ga belgilab qo‘ying yoki «Buyurtmalarim»dan «Qayta buyurtma» tugmasini bosing — savat bir bosishda to‘ladi.",
  },
  {
    q: "Promokod qanday ishlatiladi?",
    a: "Buyurtma berish sahifasida «Promokod» maydoniga kodingizni kiriting va «Qo‘llash» tugmasini bosing. Chegirma avtomatik qo‘shiladi.",
  },
]

const faqs_ru = [
  {
    q: "Что такое Trade Avenue?",
    a: "Trade Avenue — сервис оптовых закупок для магазинов. Каталог, оптовые цены, заказы и статус доставки — всё в Telegram, без ожидания агента.",
  },
  {
    q: "Как войти в приложение?",
    a: "При первом входе понадобятся номер телефона магазина и 6-значный код от нашего агента. Код вводится один раз — дальше приложение вас запомнит.",
  },
  {
    q: "Какие цены для моего магазина?",
    a: "Цены оптовые и зависят от категории вашего магазина. В каталоге показана цена именно для вас. При крупном заказе может действовать дополнительная скидка.",
  },
  {
    q: "Когда доставят заказ?",
    a: "Дни доставки зависят от вашего района. При изменении статуса заказа придёт уведомление в приложении и в боте.",
  },
  {
    q: "Есть ли минимальная сумма заказа?",
    a: "Да, минимальная сумма показана в корзине и при оформлении. Если не хватает — подскажем, сколько добавить.",
  },
  {
    q: "Как происходит оплата?",
    a: "Наличными при доставке или переводом на карту. При оплате картой при оформлении загрузите скриншот чека — менеджер проверит и подтвердит.",
  },
  {
    q: "Я каждый раз беру одно и то же — можно быстрее?",
    a: "Да. Отметьте товары в «Постоянном списке» или нажмите «Повторить заказ» в разделе «Мои заказы» — корзина соберётся в одно касание.",
  },
  {
    q: "Как использовать промокод?",
    a: "На странице оформления введите код в поле «Промокод» и нажмите «Применить». Скидка добавится автоматически.",
  },
]

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className="rounded-2xl border overflow-hidden transition-all"
      style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition active:opacity-70"
      >
        <span className="font-semibold text-sm leading-snug" style={{ color: 'var(--ink)' }}>
          {q}
        </span>
        <span className="shrink-0" style={{ color: 'var(--brand)' }}>
          {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </span>
      </button>
      {open && (
        <div
          className="px-5 pb-4 text-sm leading-relaxed"
          style={{ color: 'var(--muted)' }}
        >
          {a}
        </div>
      )}
    </div>
  )
}

export function SupportPage({ onBack }: Props) {
  const t = useT()
  const { lang } = useI18n()
  const faqs = lang === 'ru' ? faqs_ru : faqs_uz
  // Aloqa ma'lumotlari admin paneldan (Sozlamalar → «Biz bilan aloqa»)
  const [contact, setContact] = useState<ContactInfo>(DEFAULT_CONTACT)
  useEffect(() => subscribeToContact(setContact), [])

  const contacts = [
    {
      id: 'phone',
      icon: Phone,
      label: lang === 'ru' ? 'Телефон' : 'Telefon',
      value: contact.phone,
      href: phoneHref(contact.phone),
      color: 'var(--brand)',
      bg: 'var(--brand-soft)',
    },
    {
      id: 'telegram',
      icon: MessageCircle,
      label: 'Telegram',
      value: `@${contact.telegram}`,
      href: telegramHref(contact.telegram),
      color: '#0ea5e9',
      bg: 'rgba(14,165,233,0.12)',
    },
    {
      id: 'email',
      icon: Mail,
      label: 'Email',
      value: contact.email,
      href: `mailto:${contact.email}`,
      color: 'var(--gold)',
      bg: 'var(--gold-soft)',
    },
  ]

  const about = lang === 'ru'
    ? [
        { icon: BadgePercent, title: 'Оптовые цены', text: 'Цена в каталоге — именно для вашего магазина.' },
        { icon: Boxes, title: 'Широкий ассортимент', text: 'Напитки, бакалея, сладости, бытовая химия и другое.' },
        { icon: Truck, title: 'Доставка до магазина', text: 'Привезём по графику вашего района.' },
      ]
    : [
        { icon: BadgePercent, title: 'Ulgurji narxlar', text: 'Katalogdagi narx — aynan sizning do‘koningiz uchun.' },
        { icon: Boxes, title: 'Keng assortiment', text: 'Ichimliklar, bakaleya, shirinliklar, maishiy kimyo va boshqalar.' },
        { icon: Truck, title: 'Do‘kongacha yetkazish', text: 'Hududingiz jadvali bo‘yicha olib boramiz.' },
      ]

  const features = lang === 'ru'
    ? [
        { icon: Clock, text: `Приём заказов ${contact.workHours}` },
        { icon: CheckCircle2, text: 'Быстрый ответ' },
        { icon: MapPin, text: contact.address },
      ]
    : [
        { icon: Clock, text: `Buyurtmalar ${contact.workHours}` },
        { icon: CheckCircle2, text: 'Tez javob' },
        { icon: MapPin, text: contact.address },
      ]

  return (
    <>
      {/* Header */}
      <header
        className="page-head page-head--solo flex items-center gap-3 px-5 pt-8 pb-5 sm:px-10"
        style={{ animation: 'fadeInUp 0.3s ease' }}
      >
        <button
          onClick={onBack}
          className="back-button"
          aria-label={t('common.back')}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <PageTitle className="text-2xl font-extrabold leading-tight" short={lang === 'ru' ? 'Поддержка' : 'Yordam'}>
            {lang === 'ru' ? 'Помощь и поддержка' : "Yordam va qo'llab-quvvatlash"}
          </PageTitle>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            {lang === 'ru' ? 'Мы всегда рядом' : "Biz doim siz bilan"}
          </p>
        </div>
      </header>

      {/* Hero Card */}
      <section className="px-5 sm:px-10" style={{ animation: 'fadeInUp 0.35s ease 0.05s both' }}>
        <div
          className="relative overflow-hidden rounded-3xl p-6"
          style={{
            background: 'linear-gradient(135deg, #0a7a3d 0%, #04331c 100%)',
          }}
        >
          {/* Decorative circles */}
          <div
            className="absolute -right-8 -top-8 size-32 rounded-full opacity-20"
            style={{ background: 'white' }}
          />
          <div
            className="absolute -bottom-6 right-10 size-20 rounded-full opacity-10"
            style={{ background: 'white' }}
          />

          <div className="relative z-10">
            <div
              className="inline-grid size-14 place-items-center rounded-2xl mb-4"
              style={{ background: 'rgba(255,255,255,0.2)' }}
            >
              <Headphones size={28} color="white" />
            </div>
            <h2 className="wordmark text-xl text-white leading-tight">
              {lang === 'ru' ? `Служба заботы ${BRAND.name}` : `${BRAND.name} mijozlar xizmati`}
            </h2>
            <p className="mt-1.5 text-sm text-white opacity-80">
              {lang === 'ru'
                ? 'Свяжитесь с нами любым удобным способом'
                : "Qulay usul orqali biz bilan bog'laning"}
            </p>

            {/* Feature badges */}
            <div className="mt-4 flex flex-wrap gap-2">
              {features.map(({ icon: Icon, text }) => (
                <span
                  key={text}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
                  style={{ background: 'rgba(255,255,255,0.18)', color: 'white' }}
                >
                  <Icon size={12} />
                  {text}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Contact Cards */}
      <section
        className="px-5 pt-6 sm:px-10"
        style={{ animation: 'fadeInUp 0.4s ease 0.1s both' }}
      >
        <h2 className="section-title mb-4">
          {lang === 'ru' ? 'Контакты' : "Bog'lanish"}
        </h2>
        <div className="flex flex-col gap-3">
          {contacts.map(({ id, icon: Icon, label, value, href, color, bg }) => (
            <a
              key={id}
              id={`support-contact-${id}`}
              href={href}
              target={id !== 'phone' ? '_blank' : undefined}
              rel="noreferrer"
              className="flex items-center gap-4 rounded-2xl border p-4 transition active:scale-[0.98] hover:opacity-90"
              style={{ borderColor: 'var(--line)', background: 'var(--surface)', textDecoration: 'none' }}
            >
              <span
                className="grid size-12 shrink-0 place-items-center rounded-2xl"
                style={{ background: bg, color }}
              >
                <Icon size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                  {label}
                </p>
                <p className="mt-0.5 truncate font-bold text-sm" style={{ color: 'var(--ink)' }}>
                  {value}
                </p>
              </div>
              <span
                className="shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold"
                style={{ background: bg, color }}
              >
                {lang === 'ru' ? 'Написать' : 'Yozish'}
              </span>
            </a>
          ))}
        </div>
      </section>

      {/* Trade Avenue haqida */}
      <section
        className="px-5 pt-7 sm:px-10"
        style={{ animation: 'fadeInUp 0.4s ease 0.12s both' }}
      >
        <h2 className="section-title mb-4">
          {lang === 'ru' ? `О ${BRAND.name}` : `${BRAND.name} haqida`}
        </h2>
        <div
          className="rounded-2xl border p-2"
          style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
        >
          {about.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex items-start gap-3 p-3">
              <span
                className="grid size-10 shrink-0 place-items-center rounded-xl"
                style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}
              >
                <Icon size={19} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{title}</p>
                <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
                  {text}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section
        className="px-5 pt-7 pb-32 sm:px-10"
        style={{ animation: 'fadeInUp 0.4s ease 0.15s both' }}
      >
        <h2 className="section-title mb-4">
          {lang === 'ru' ? 'Часто задаваемые вопросы' : "Ko'p so'raladigan savollar"}
        </h2>
        <div className="flex flex-col gap-3">
          {faqs.map((item) => (
            <FaqItem key={item.q} q={item.q} a={item.a} />
          ))}
        </div>

        {/* Footer note */}
        <div
          className="mt-6 rounded-2xl border p-4 text-center"
          style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
        >
          <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
            {lang === 'ru'
              ? 'Не нашли ответ? Напишите нам — мы ответим в течение нескольких минут.'
              : "Javob topa olmadingizmi? Bizga yozing — bir necha daqiqa ichida javob beramiz."}
          </p>
        </div>
      </section>
    </>
  )
}
