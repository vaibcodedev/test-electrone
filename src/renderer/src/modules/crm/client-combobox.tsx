import { useState, type ReactElement } from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import type { ClientSummary } from '@shared/domain/crm'
import { useApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const clientLabel = (c: Pick<ClientSummary, 'name' | 'company'>): string =>
  c.company ? `${c.name} — ${c.company}` : c.name

/**
 * Client picker with server search (shadcn Popover + Command): the list is loaded only while open, 50 at a
 * time, so a big client base doesn't load every summary. `currentName` names a client that the search
 * can't return (e.g. one in the trash).
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
  const label = value ? (selected ? clientLabel(selected) : currentName) : null
  const pick = (c: ClientSummary | null): void => {
    onChange(c)
    setOpen(false)
    setSearch('')
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="soft"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'w-full justify-between font-normal',
            !label && 'text-muted-foreground',
            className
          )}
        >
          <span className="truncate">{label || 'Без клієнта'}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) min-w-64 rounded-2xl p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput value={search} onValueChange={setSearch} placeholder="Пошук клієнта…" />
          <CommandList>
            {!isFetching && <CommandEmpty>Клієнта не знайдено</CommandEmpty>}
            <CommandGroup>
              {value && !q && (
                <CommandItem value="__none__" onSelect={() => pick(null)}>
                  <X /> Без клієнта
                </CommandItem>
              )}
              {found.map((c) => (
                <CommandItem key={c.id} value={c.id} onSelect={() => pick(c)}>
                  <span className="flex-1 truncate">{clientLabel(c)}</span>
                  {c.id === value && <Check />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
