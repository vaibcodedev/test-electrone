import { useState } from 'react'
import { Check, ChevronsUpDown, Folder, FolderPlus, X } from 'lucide-react'
import { useApi } from '@/lib/query'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { cn } from '@/lib/utils'

/** Folder combobox: pick an existing folder or create one by typing (shadcn Popover + Command). */
export function FolderPicker({ value, onChange }: { value: string; onChange: (folder: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { data: folders = [] } = useApi('notes', 'folders')
  const typed = query.trim()
  const exists = folders.some((f) => f.toLowerCase() === typed.toLowerCase())

  const pick = (folder: string): void => {
    onChange(folder)
    setQuery('')
    setOpen(false)
  }

  return (
    <ButtonGroup className="w-full">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="soft"
            role="combobox"
            aria-expanded={open}
            className={cn('flex-1 justify-between font-normal', !value && 'text-muted-foreground')}
          >
            <span className="flex min-w-0 items-center gap-2">
              <Folder />
              <span className="truncate">{value || 'Без теки'}</span>
            </span>
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 rounded-2xl p-0" align="start">
          <Command>
            <CommandInput placeholder="Знайти або створити теку…" value={query} maxLength={100} onValueChange={setQuery} />
            <CommandList>
              <CommandEmpty>Тек поки немає</CommandEmpty>
              <CommandGroup>
                {folders.map((f) => (
                  <CommandItem key={f} value={f} onSelect={() => pick(f)}>
                    <Folder />
                    <span className="flex-1 truncate">{f}</span>
                    {f === value && <Check />}
                  </CommandItem>
                ))}
                {typed && !exists && (
                  <CommandItem value={`__create__${typed}`} onSelect={() => pick(typed)}>
                    <FolderPlus />
                    Створити «{typed}»
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value && (
        <Button variant="soft" size="icon" aria-label="Прибрати з теки" onClick={() => onChange('')}>
          <X />
        </Button>
      )}
    </ButtonGroup>
  )
}
