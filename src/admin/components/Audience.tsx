import { Search } from 'lucide-react'
import { useState } from 'react'
import { useCategories, useProducts } from '../lib/live'
import { AUDIENCES, displayName, type AudienceState } from '../lib/audience'

/** «Kimga» tanlovi — holat src/admin/lib/audience.ts → useAudience. */
export function AudiencePicker({ state, disabled }: { state: AudienceState; disabled?: boolean }) {
  const { products } = useProducts()
  const { categories } = useCategories()
  const [search, setSearch] = useState('')
  const {
    customers, history, audience, setAudience, pickedCategories, setPickedCategories,
    pickedProducts, setPickedProducts, manual, setManual, days, setDays,
  } = state

  const toggle = (list: string[], set: (next: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value])

  const needle = search.trim().toLowerCase()
  const productOptions = products
    .filter((p) => !needle || p.name.toLowerCase().includes(needle))
    .slice(0, 60)
  const customerOptions = customers
    .filter((c) => !needle || displayName(c).toLowerCase().includes(needle) || String(c.phone || '').includes(needle))
    .slice(0, 80)

  return (
    <>
      <div className="adm-audience">
        {AUDIENCES.map((item) => (
          <button
            key={item.key}
            type="button"
            className={'adm-audience__item ' + (audience === item.key ? 'active' : '')}
            onClick={() => { setAudience(item.key); setSearch('') }}
            disabled={disabled}
            aria-pressed={audience === item.key}
          >
            <b>{item.label}</b>
            <span>{item.hint}</span>
          </button>
        ))}
      </div>

      {audience === 'category' && (
        <div className="mt-3 flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={String(c.id)}
              type="button"
              className={'adm-chip ' + (pickedCategories.includes(c.name) ? 'active' : '')}
              onClick={() => toggle(pickedCategories, setPickedCategories, c.name)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {(audience === 'lapsed' || audience === 'active') && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span style={{ color: 'var(--muted)' }}>{audience === 'lapsed' ? 'Oxirgi buyurtmadan beri' : 'So‘nggi'}</span>
          <input
            className="adm-input w-24 text-center"
            inputMode="numeric"
            value={days}
            onChange={(e) => setDays(e.target.value.replace(/\D/g, '').slice(0, 3))}
            aria-label="Kun"
          />
          <span style={{ color: 'var(--muted)' }}>{audience === 'lapsed' ? 'kundan ko‘p o‘tganlar' : 'kun ichida kirganlar'}</span>
        </div>
      )}

      {(audience === 'product' || audience === 'manual') && (
        <div className="mt-3">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--faint)' }} />
            <input
              className="adm-input icon-left"
              placeholder={audience === 'product' ? 'Mahsulot qidirish...' : 'Ism yoki telefon bo‘yicha qidirish...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="adm-picklist">
            {audience === 'product'
              ? productOptions.map((p) => (
                <label key={p.docId}>
                  <input
                    type="checkbox"
                    checked={pickedProducts.includes(p.docId)}
                    onChange={() => toggle(pickedProducts, setPickedProducts, p.docId)}
                  />
                  <span className="truncate">{p.name}</span>
                  <small>{p.category}</small>
                </label>
              ))
              : customerOptions.map((c) => (
                <label key={c.id}>
                  <input type="checkbox" checked={manual.includes(c.id)} onChange={() => toggle(manual, setManual, c.id)} />
                  <span className="truncate">{displayName(c)}</span>
                  <small>{c.phone || (history.get(c.id) ? 'xaridor' : '')}</small>
                </label>
              ))}
          </div>
          {audience === 'manual' && (
            <div className="mt-2 flex gap-2 text-xs">
              <button type="button" className="adm-link" onClick={() => setManual([...new Set([...manual, ...customerOptions.map((c) => c.id)])])}>
                Ko‘rinayotganlarni belgilash
              </button>
              <button type="button" className="adm-link" onClick={() => setManual([])}>Tozalash</button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
