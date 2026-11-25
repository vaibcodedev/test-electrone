import type { ReactElement } from 'react'
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@shared/domain/finance'
import { Choice } from '@/components/common/choice'
import { CATEGORY_LABEL } from './money'

const CATEGORY_OPTIONS = EXPENSE_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))

/** Category of an expense or a subscription: the same Choice as the currency next to it (a value is always set). */
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
    <Choice id={id} value={value} onChange={(c) => c && onChange(c)} options={CATEGORY_OPTIONS} />
  )
}
