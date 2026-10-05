import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, MapPin, MapPinPlus, Pencil } from 'lucide-react'
import { hapticFeedback, hapticSuccess } from '../../utils/telegram'
import { useT } from '../../i18n'
import type { Address } from '../../types/domain'

type Props = {
  addresses: Address[]
  /** Hozir tanlangan manzil (buyurtma formasidagi). */
  selectedId: string | null
  onSelect: (address: Address) => void
  onConfirm: () => void
  onEdit: (addressId: string) => void
  onAddNew: () => void
}

/** Yopilish animatsiyasi davomiyligi — CSS dagi sheetDown bilan bir xil. */
const LEAVE_MS = 220

/**
 * «Manzilingizni tasdiqlaysizmi?» — rasmiylashtirishga har kirganda.
 *
 * Mijozlar ko'pincha boshqa joydan buyurtma beradi, lekin eski manzil
 * o'zi tanlangani uchun buni sezmaydi va kuryer noto'g'ri joyga boradi.
 * Oyna manzilni ko'z oldiga chiqaradi: tasdiqlash, tahrirlash, yangisini
 * qo'shish yoki (bir nechta bo'lsa) boshqasini tanlash.
 */
export function AddressConfirmSheet({ addresses, selectedId, onSelect, onConfirm, onEdit, onAddNew }: Props) {
  const t = useT()
  const [leaving, setLeaving] = useState(false)
  const selected = addresses.find((a) => a.id === selectedId) ?? null
  const others = addresses.filter((a) => a.id !== selected?.id)

  // Oyna ochiq turganda sahifa orqasi aylanmasin
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  /** Avval chiqish animatsiyasi, keyin amal. */
  const leave = (action: () => void) => {
    if (leaving) return
    setLeaving(true)
    window.setTimeout(action, LEAVE_MS)
  }

  return createPortal(
    <div
      className={'acf-overlay ' + (leaving ? 'leaving' : '')}
      role="dialog"
      aria-modal="true"
      aria-labelledby="acf-title"
    >
      <div className={'acf-sheet ' + (leaving ? 'leaving' : '')}>
        <span className="acf-grip" aria-hidden="true" />

        {/* Pulsatsiyalanuvchi belgi — «joyingiz» */}
        <div className="acf-pin" aria-hidden="true">
          <span className="acf-pin__ring" />
          <span className="acf-pin__ring acf-pin__ring--late" />
          <span className="acf-pin__icon"><MapPin size={26} strokeWidth={2.4} /></span>
        </div>

        <h2 id="acf-title" className="acf-title">
          {selected ? t('checkout.confirmTitle') : t('checkout.confirmNoneTitle')}
        </h2>
        <p className="acf-sub">
          {selected ? t('checkout.confirmSub') : t('checkout.confirmNoneSub')}
        </p>

        {selected && (
          <div key={selected.id} className="acf-card">
            <span className="acf-card__icon"><MapPin size={19} /></span>
            <span className="min-w-0 flex-1 text-left">
              <b className="acf-card__name">{selected.name}</b>
              <span className="acf-card__addr">{selected.address}</span>
            </span>
            <Check size={20} className="acf-card__check" />
          </div>
        )}

        {/* Boshqa saqlangan manzillar — bir bosishda almashtirish */}
        {selected && others.length > 0 && (
          <div className="acf-others">
            <p className="acf-others__label">{t('checkout.confirmOther')}</p>
            {others.map((a, i) => (
              <button
                key={a.id}
                type="button"
                className="acf-other"
                style={{ animationDelay: `${120 + i * 50}ms` }}
                onClick={() => { hapticFeedback('light'); onSelect(a) }}
              >
                <MapPin size={15} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate text-left">
                  <b>{a.name}</b> · {a.address}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="acf-actions">
          {selected ? (
            <>
              <button
                type="button"
                className="btn-primary acf-confirm"
                onClick={() => { hapticSuccess(); leave(onConfirm) }}
                autoFocus
              >
                <Check size={19} strokeWidth={2.6} /> {t('checkout.confirmYes')}
              </button>
              <div className="acf-row">
                <button type="button" className="acf-ghost" onClick={() => leave(() => onEdit(selected.id))}>
                  <Pencil size={16} /> {t('common.edit')}
                </button>
                <button type="button" className="acf-ghost" onClick={() => leave(onAddNew)}>
                  <MapPinPlus size={16} /> {t('checkout.confirmAdd')}
                </button>
              </div>
            </>
          ) : (
            <>
              <button type="button" className="btn-primary acf-confirm" onClick={() => leave(onAddNew)} autoFocus>
                <MapPinPlus size={19} /> {t('checkout.confirmAdd')}
              </button>
              {/* Manzilsiz ham buyurtma sahifasini ko'rib chiqsa bo'ladi */}
              <button type="button" className="acf-ghost w-full" onClick={() => leave(onConfirm)}>
                {t('common.close')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
