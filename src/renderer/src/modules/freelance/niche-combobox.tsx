import type { ReactElement } from 'react'
import { useApi } from '@/lib/query'
import { Combobox } from '@/components/common/combobox'

/**
 * Task type (proposal, template, case): the common Combobox with suggestions from previous proposals and
 * «Створити «…»» for a new one. The current value is always among the options — Combobox takes the
 * label from there.
 */
export function NicheCombobox({
  id,
  value,
  onChange,
  maxLength
}: {
  id?: string
  value: string
  onChange: (v: string) => void
  /** The schema limit of the field the value goes to. */
  maxLength?: number
}): ReactElement {
  const { data: niches = [] } = useApi('proposals', 'niches')
  const options = [...new Set([value, ...niches].filter(Boolean))].map((n) => ({
    value: n,
    label: n
  }))
  return (
    <Combobox
      id={id}
      value={value || null}
      options={options}
      onChange={(v) => onChange(v ?? '')}
      creatable
      onCreate={onChange}
      clearable
      clearLabel="Без типу"
      maxLength={maxLength}
      placeholder="Оберіть або введіть тип"
      searchPlaceholder="Напр.: Next.js"
      emptyText="Введіть новий тип"
      // In view mode the value is a bare span: a long word without spaces must wrap, not scroll the aside.
      className="wrap-anywhere"
    />
  )
}
