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
      placeholder="Next.js, верстка, боти…"
      searchPlaceholder="Тип завдання…"
      emptyText="Введіть новий тип"
    />
  )
}
