import { useState, type ReactElement } from 'react'
import { Check, ChevronsUpDown, Plus, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useReadOnly } from './detail-mode-context'

/** cmdk filter: a case-insensitive substring of the label (any alphabet). */
const matchLabel = (_value: string, search: string, keywords?: string[]): number => {
  const q = search.trim().toLocaleLowerCase('uk')
  return !q || keywords?.some((k) => k.toLocaleLowerCase('uk').includes(q)) ? 1 : 0
}

export interface ComboboxOption {
  value: string
  label: string
}

/**
 * Pick one value from a list (shadcn Popover + Command), optionally create a new one from the search text.
 * Looks like a field while editing; while reading it is plain text level with its label, and an empty
 * value hides the whole field (docs/design-system.md → Общие компоненты).
 */
export function Combobox({
  id,
  value,
  options,
  onChange,
  placeholder = 'Вибрати…',
  searchPlaceholder = 'Пошук…',
  emptyText = 'Нічого не знайдено',
  icon: Icon,
  creatable,
  onCreate,
  clearable,
  clearLabel = 'Без значення',
  maxLength,
  disabled,
  className
}: {
  id?: string
  value: string | null
  options: ComboboxOption[]
  onChange: (value: string | null) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  icon?: LucideIcon
  /** Offer «Створити «…»» when the search text matches nothing; `onCreate` receives the text. */
  creatable?: boolean
  onCreate?: (label: string) => void
  /** Adds a first item that resets the value to null. */
  clearable?: boolean
  clearLabel?: string
  /** Limit of the search text when it can become a new value (`creatable`), from the schema. */
  maxLength?: number
  disabled?: boolean
  className?: string
}): ReactElement {
  const viewMode = useReadOnly()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const current = options.find((o) => o.value === value)
  const label = current?.label ?? null
  const text = search.trim()
  const exact = options.some((o) => o.label.toLowerCase() === text.toLowerCase())

  if (viewMode)
    return label ? (
      <span data-view className={cn('text-body', className)}>
        {label}
      </span>
    ) : (
      <span data-empty />
    )

  const close = (): void => {
    setOpen(false)
    setSearch('')
  }
  const pick = (next: string | null): void => {
    onChange(next)
    close()
  }

  return (
    // Esc or a click outside also forgets the search: the next open starts with the full list.
    <Popover open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="soft"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            // Looks like an input (same border/tint as Input), not like a button.
            'w-full justify-between rounded-xl border border-input bg-foreground/[0.04] font-normal hover:border-foreground/40 hover:bg-foreground/[0.04]',
            !label && 'text-muted-foreground',
            className
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {Icon && <Icon className="text-muted-foreground" />}
            <span className="truncate">{label ?? placeholder}</span>
          </span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 rounded-2xl p-0" align="start">
        {/* Items are matched by their label (keywords), not by value: an id must neither match the search nor
            merge two options with the same label. */}
        <Command filter={matchLabel}>
          <CommandInput value={search} onValueChange={setSearch} placeholder={searchPlaceholder} maxLength={maxLength} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {clearable && value && !text && (
                <CommandItem value="__none__" keywords={[clearLabel]} onSelect={() => pick(null)}>
                  <X /> {clearLabel}
                </CommandItem>
              )}
              {options.map((o) => (
                <CommandItem key={o.value} value={o.value} keywords={[o.label]} onSelect={() => pick(o.value)}>
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.value === value && <Check />}
                </CommandItem>
              ))}
              {creatable && onCreate && text && !exact && (
                <CommandItem
                  value={`__create__${text}`}
                  keywords={[text]}
                  onSelect={() => {
                    // onCreate sets the value itself: pick(value) here sent the old value right after it.
                    onCreate(text)
                    close()
                  }}
                >
                  <Plus /> Створити «{text}»
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
