import { useMemo, type ReactElement } from 'react'
import { Combobox } from '@/components/common/combobox'

/** Codes Intl names that aren't countries (EU, UN, outlying/reserved regions). */
const NOT_COUNTRIES = new Set(['EU', 'EZ', 'UN', 'ZZ', 'QO', 'AC', 'CP', 'DG', 'EA', 'IC', 'TA'])

let cache: string[] | null = null
/** Country names in Ukrainian, built from ISO codes with Intl.DisplayNames (no hard-coded list). */
function countryNames(): string[] {
  if (cache) return cache
  const names = new Intl.DisplayNames(['uk'], { type: 'region', fallback: 'none' })
  const out = new Set<string>()
  const A = 'A'.charCodeAt(0)
  for (let i = 0; i < 26; i++) {
    for (let j = 0; j < 26; j++) {
      const code = String.fromCharCode(A + i, A + j)
      if (NOT_COUNTRIES.has(code) || code.startsWith('X') || code.startsWith('Q')) continue
      const name = names.of(code)
      if (name && name !== code) out.add(name)
    }
  }
  cache = [...out].sort((a, b) => a.localeCompare(b, 'uk'))
  return cache
}

/**
 * Searchable country picker over the common Combobox (field look, plain text while reading, an empty value
 * hides the field). Stores the name; an old free-text value that isn't in the list stays selectable.
 */
export function CountryCombobox({
  id,
  value,
  onChange
}: {
  id?: string
  value: string
  onChange: (value: string) => void
}): ReactElement {
  const options = useMemo(() => {
    const all = countryNames()
    const list = value && !all.includes(value) ? [value, ...all] : all
    return list.map((n) => ({ value: n, label: n }))
  }, [value])
  return (
    <Combobox
      id={id}
      value={value || null}
      options={options}
      onChange={(v) => onChange(v ?? '')}
      clearable
      clearLabel="Не вказано"
      placeholder="Оберіть країну"
      searchPlaceholder="Пошук країни…"
      emptyText="Країну не знайдено"
    />
  )
}
