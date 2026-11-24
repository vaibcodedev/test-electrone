import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
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
import { useReadOnly } from '@/components/common/detail-mode'

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
 * Searchable country picker (shadcn Popover + Command). Stores the name; an old free-text value
 * that isn't in the list is shown as-is and stays selectable.
 */
export function CountryCombobox({
  value,
  onChange,
  placeholder = 'Оберіть країну'
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const readOnly = useReadOnly()
  const [open, setOpen] = useState(false)
  const list = useMemo(() => {
    const all = countryNames()
    return value && !all.includes(value) ? [value, ...all] : all
  }, [value])
  if (readOnly) return <span className="text-body">{value || '—'}</span>
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="soft"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between font-normal', !value && 'text-muted-foreground')}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 rounded-2xl p-0" align="start">
        <Command>
          <CommandInput placeholder="Пошук країни…" />
          <CommandList>
            <CommandEmpty>Країну не знайдено</CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange('')
                    setOpen(false)
                  }}
                >
                  <X /> Не вказано
                </CommandItem>
              )}
              {list.map((name) => (
                <CommandItem
                  key={name}
                  value={name}
                  onSelect={() => {
                    onChange(name)
                    setOpen(false)
                  }}
                >
                  <span className="flex-1 truncate">{name}</span>
                  {name === value && <Check />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
