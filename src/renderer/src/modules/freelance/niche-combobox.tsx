import { useState, type ReactElement } from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { useApi } from '@/lib/query'
import { cn } from '@/lib/utils'
import { useReadOnly } from '@/components/common/detail-mode-context'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'

/** Combobox for the task type: suggestions from previous proposals + free text. */
export function NicheCombobox({ value, onChange }: { value: string; onChange: (v: string) => void }): ReactElement {
  const readOnly = useReadOnly()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { data: niches = [] } = useApi('proposals', 'niches', undefined, { enabled: open })
  // View mode: the value as wrapping text, no picker; an empty value hides the whole field.
  if (readOnly)
    return value ? (
      <span data-view className="text-body [overflow-wrap:anywhere]">
        {value}
      </span>
    ) : (
      <span data-empty />
    )
  const q = query.trim()
  const exact = niches.some((n) => n.toLowerCase() === q.toLowerCase())
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="soft"
          className={cn(
            'w-full min-w-0 justify-between rounded-xl font-normal',
            !value && 'text-muted-foreground'
          )}
        >
          <span className="min-w-0 truncate">{value || 'Next.js, верстка, боти…'}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 rounded-2xl p-0" align="start">
        <Command>
          <CommandInput placeholder="Тип завдання…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>Введіть новий тип</CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem value="__clear__" onSelect={() => (onChange(''), setOpen(false))}>
                  <X /> Без типу
                </CommandItem>
              )}
              {niches.map((n) => (
                <CommandItem
                  key={n}
                  value={n}
                  onSelect={() => (onChange(n), setOpen(false), setQuery(''))}
                >
                  {n}
                  {n === value && <Check className="ml-auto" />}
                </CommandItem>
              ))}
              {q && !exact && (
                <CommandItem
                  value={`__new__${q}`}
                  onSelect={() => (onChange(q), setOpen(false), setQuery(''))}
                >
                  Використати «{q}»
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
