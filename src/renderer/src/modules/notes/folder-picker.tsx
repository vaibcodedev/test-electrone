import { useState } from 'react'
import { useReadOnly } from '@/components/common/detail-mode-context'
import { Check, ChevronsUpDown, Folder, FolderPlus, X } from 'lucide-react'
import { noteInputSchema } from '@shared/domain/notes'
import { useApi } from '@/lib/query'
import { limitsOf } from '@/lib/limits'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const FOLDER_MAX = limitsOf(noteInputSchema).folder

/** Folder combobox: pick an existing folder or create one by typing (shadcn Popover + Command). */
export function FolderPicker({ value, onChange }: { value: string; onChange: (folder: string) => void }) {
  // View mode: the value as plain text, no picker (it would change the record outside «Редагувати»).
  const readOnly = useReadOnly()
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
            disabled={readOnly}
            className={cn(
              'min-w-0 flex-1 justify-between font-normal',
              !value && 'text-muted-foreground',
              readOnly &&
                'pointer-events-none bg-transparent px-0 shadow-none disabled:opacity-100 has-[>svg]:px-0 [&>svg:last-child]:hidden'
            )}
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
            <CommandInput placeholder="Знайти або створити теку…" value={query} maxLength={FOLDER_MAX} onValueChange={setQuery} />
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
      {value && !readOnly && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="soft" size="icon" aria-label="Прибрати з теки" onClick={() => onChange('')}>
              <X />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Прибрати з теки</TooltipContent>
        </Tooltip>
      )}
    </ButtonGroup>
  )
}
