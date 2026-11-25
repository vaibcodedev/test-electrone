import { useState } from 'react'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { useReadOnly } from '@/components/common/detail-mode-context'

/** Combobox: choose an existing topic or type a new one (shadcn Popover + Command). */
export function TopicPicker({
  value,
  options,
  onChange,
  placeholder = 'Виберіть або введіть тему',
  maxLength
}: {
  value: string
  options: string[]
  onChange: (value: string) => void
  placeholder?: string
  /** Schema limit: a longer topic would make the whole autosave patch fail. */
  maxLength?: number
}) {
  const readOnly = useReadOnly()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const q = query.trim()
  const exists = options.some((o) => o.toLowerCase() === q.toLowerCase())
  const pick = (v: string): void => {
    onChange(v)
    setQuery('')
    setOpen(false)
  }
  // View mode: the topic as text; none → the Field hides itself.
  if (readOnly) return value ? <span className="text-body">{value}</span> : <span data-empty />
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="soft" role="combobox" aria-expanded={open} className={cn('w-full justify-between font-normal', !value && 'text-muted-foreground')}>
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 rounded-2xl p-0" align="start">
        <Command>
          <CommandInput placeholder="Знайти або створити…" value={query} onValueChange={setQuery} maxLength={maxLength} />
          <CommandList>
            <CommandEmpty>Тем поки немає</CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem value="__clear__" onSelect={() => pick('')}>
                  Без теми
                </CommandItem>
              )}
              {options.map((o) => (
                <CommandItem key={o} value={o} onSelect={() => pick(o)}>
                  <span className="flex-1">{o}</span>
                  {o === value && <Check />}
                </CommandItem>
              ))}
              {q && !exists && (
                <CommandItem value={`__new__${q}`} onSelect={() => pick(q)}>
                  <Plus /> Створити «{q}»
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
