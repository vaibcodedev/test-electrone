import type { ReactElement } from 'react'
import { TEMPLATE_SITUATIONS, situationLabel } from '@shared/domain/freelance'
import { useApi } from '@/lib/query'
import { Combobox } from '@/components/common/combobox'

/**
 * The person's own situations that templates use. Only suggestions: if they fail to load (a main from before the
 * method, until dev restarts) the built-in ones are still offered — logged, no toast.
 */
export function useOwnSituations(): string[] {
  const { data = NO_SITUATIONS } = useApi('templates', 'situations', undefined, {
    meta: { inlineError: true }
  })
  return data
}
const NO_SITUATIONS: string[] = []

/**
 * A template's situation: the common Combobox (as NicheCombobox) with the built-in situations first, then the
 * person's own ones that templates already use, and «Створити «…»» for a new one. A typed built-in label
 * («відгук») is stored as its key by main; the current value is always among the options.
 */
export function SituationCombobox({
  id,
  value,
  onChange,
  maxLength
}: {
  id?: string
  value: string
  onChange: (v: string) => void
  /** The schema limit of the situation. */
  maxLength?: number
}): ReactElement {
  const own = useOwnSituations()
  const options = [...new Set<string>([...TEMPLATE_SITUATIONS, ...own, value])].map((s) => ({
    value: s,
    label: situationLabel(s)
  }))
  return (
    <Combobox
      id={id}
      value={value}
      options={options}
      onChange={(v) => v && onChange(v)}
      creatable
      onCreate={(text) => text.trim() && onChange(text.trim())}
      maxLength={maxLength}
      placeholder="Оберіть або введіть ситуацію"
      searchPlaceholder="Напр.: Привітання HR"
      emptyText="Введіть свою ситуацію"
      // In view mode the value is a bare span: a long word without spaces must wrap, not scroll the aside.
      className="wrap-anywhere"
    />
  )
}
