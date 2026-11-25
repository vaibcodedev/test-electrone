import type { ReactElement } from 'react'
import { CURRENCIES, type Currency } from '@shared/domain/crm'
import { Choice } from './choice'

const OPTIONS = CURRENCIES.map((c) => ({ value: c, label: c }))

/**
 * Currency of a sum (CRM, freelance, jobs, finance): Choice over CURRENCIES, a value is always set. `id` goes to
 * the trigger so `Field htmlFor` names it; `aria-label` tells two «Валюта» fields of one form apart.
 */
export function CurrencySelect({
  id,
  value,
  onChange,
  size,
  className,
  'aria-label': ariaLabel
}: {
  id?: string
  value: Currency
  onChange: (currency: Currency) => void
  size?: 'default' | 'sm'
  className?: string
  'aria-label'?: string
}): ReactElement {
  return (
    <Choice
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(c) => c && onChange(c)}
      options={OPTIONS}
      size={size}
      className={className}
    />
  )
}
