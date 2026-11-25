import type { ReactElement } from 'react'
import { CURRENCIES, type Currency } from '@shared/domain/crm'
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@shared/domain/finance'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { CATEGORY_LABEL } from './money'

/** `id` goes to the trigger so `Field htmlFor` names it. */
export function CurrencySelect({
  id,
  value,
  onChange
}: {
  id?: string
  value: Currency
  onChange: (c: Currency) => void
}): ReactElement {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Currency)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CURRENCIES.map((c) => (
          <SelectItem key={c} value={c}>
            {c}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function CategorySelect({
  id,
  value,
  onChange
}: {
  id?: string
  value: ExpenseCategory
  onChange: (c: ExpenseCategory) => void
}): ReactElement {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as ExpenseCategory)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {EXPENSE_CATEGORIES.map((c) => (
          <SelectItem key={c} value={c}>
            {CATEGORY_LABEL[c]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
