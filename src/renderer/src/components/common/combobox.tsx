import { useState, type ReactElement, type ReactNode } from 'react'
import { Check, ChevronsUpDown, Plus, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
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
 * Looks like a field while editing; while reading it is plain text level with its label (or `renderView`, e.g. a
 * link to the record), and an empty value hides the whole field (docs/design-system.md → Общие компоненты).
 * Server search: `onSearchChange` gets the typed text and the caller passes the found `options` (the list is
 * then not filtered here), `loading` while they come, `selectedLabel` when the value is not on the loaded page.
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
  className,
  onSearchChange,
  loading,
  selectedLabel,
  renderView,
  onOpenChange
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
  /** Server search: called with the search text (and with '' when the list closes); options come filtered. */
  onSearchChange?: (text: string) => void
  /** Server search in flight: «Шукаю…» instead of `emptyText`. */
  loading?: boolean
  /** Label of the current value when it is not among `options` (a paged server list). */
  selectedLabel?: string
  /** Reading: own view of the value (a link to the record) instead of plain text. */
  renderView?: (option: ComboboxOption) => ReactNode
  /** Lets the caller load options only while the list is open. */
  onOpenChange?: (open: boolean) => void
}): ReactElement {
  const viewMode = useReadOnly()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const current = options.find((o) => o.value === value)
  const label = current?.label ?? selectedLabel ?? null
  const text = search.trim()
  const exact = options.some((o) => o.label.toLowerCase() === text.toLowerCase())

  if (viewMode) {
    if (!label || !value) return <span data-empty />
    if (renderView) return <>{renderView({ value, label })}</>
    // A long word without spaces (a niche, a folder) wraps instead of pushing the aside sideways.
    return (
      <span data-view className={cn('block min-w-0 text-body [overflow-wrap:anywhere]', className)}>
        {label}
      </span>
    )
  }

  const setText = (next: string): void => {
    setSearch(next)
    onSearchChange?.(next)
  }
  const close = (): void => {
    setOpen(false)
    onOpenChange?.(false)
    if (search) setText('')
  }
  const pick = (next: string | null): void => {
    onChange(next)
    close()
  }

  return (
    // Esc or a click outside also forgets the search: the next open starts with the full list.
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (!o) return close()
        setOpen(true)
        onOpenChange?.(true)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="field"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between', !label && 'text-muted-foreground', className)}
        >
          <span className="flex min-w-0 items-center gap-2">
            {Icon && <Icon className="text-muted-foreground" />}
            <span className="truncate">{label ?? placeholder}</span>
          </span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) min-w-64 rounded-2xl p-0"
        align="start"
      >
        {/* Items are matched by their label (keywords), not by value: an id must neither match the search nor
            merge two options with the same label. A server search has filtered them already. */}
        <Command filter={matchLabel} shouldFilter={!onSearchChange}>
          <CommandInput
            value={search}
            onValueChange={setText}
            placeholder={searchPlaceholder}
            maxLength={maxLength}
          />
          <CommandList>
            <CommandEmpty>{loading ? 'Шукаю…' : emptyText}</CommandEmpty>
            <CommandGroup>
              {clearable && value && !text && (
                <CommandItem value="__none__" keywords={[clearLabel]} onSelect={() => pick(null)}>
                  <X /> {clearLabel}
                </CommandItem>
              )}
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.value}
                  keywords={[o.label]}
                  onSelect={() => pick(o.value)}
                >
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
