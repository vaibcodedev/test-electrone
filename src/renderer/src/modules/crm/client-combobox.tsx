import { useState, type ReactElement } from 'react'
import type { ClientSummary } from '@shared/domain/crm'
import { useApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { Combobox } from '@/components/common/combobox'

const clientLabel = (c: Pick<ClientSummary, 'name' | 'company'>): string =>
  c.company ? `${c.name} — ${c.company}` : c.name

/**
 * Client picker over the common Combobox with server search: the list is loaded only while open, 50 at a time,
 * so a big client base doesn't load every summary. `currentName` names a client that the search can't return
 * (e.g. one in the trash). Without a Field label, tie a `sr-only` Label to `id`.
 */
export function ClientCombobox({
  id,
  value,
  onChange,
  currentName,
  className
}: {
  id?: string
  value: string | null
  onChange: (client: ClientSummary | null) => void
  currentName?: string | null
  className?: string
}): ReactElement {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim())
  const { data: found = [], isFetching } = useApi(
    'clients',
    'list',
    { search: q || undefined, limit: 50 },
    { enabled: open }
  )
  const { data: selected } = useApi('clients', 'get', value ?? '', {
    enabled: !!value && !currentName
  })
  return (
    <Combobox
      id={id}
      className={className}
      value={value}
      options={found.map((c) => ({ value: c.id, label: clientLabel(c) }))}
      selectedLabel={(selected ? clientLabel(selected) : currentName) ?? undefined}
      onChange={(next) => onChange(next ? (found.find((c) => c.id === next) ?? null) : null)}
      onSearchChange={setSearch}
      onOpenChange={setOpen}
      loading={isFetching}
      clearable
      clearLabel="Без клієнта"
      placeholder="Без клієнта"
      searchPlaceholder="Пошук клієнта…"
      emptyText="Клієнта не знайдено"
    />
  )
}
