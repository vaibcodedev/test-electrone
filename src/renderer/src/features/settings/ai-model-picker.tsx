import { useState, type ReactElement } from 'react'
import { Check, ChevronsUpDown, Plus, RotateCcw } from 'lucide-react'
import type { AiPreset } from '@shared/domain/ai'
import { useApi } from '@/lib/query'
import { Badge } from '@/components/ui/badge'
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
import { Spinner } from '@/components/ui/spinner'

const NO_MODELS: string[] = []

/**
 * «Модель» in Settings → ШІ: the preset's recommended models first, then every chat model the provider offers
 * this key (asked only while the list is open), or a name typed by hand. '' = the preset's own choice — it
 * keeps the spare model on overload (shared/domain/ai.ts → fallbackModel), so picking the recommended model
 * saves ''.
 */
export function AiModelPicker({
  id,
  preset,
  value,
  canList,
  maxLength,
  onChange
}: {
  id: string
  preset: AiPreset
  /** Saved model; '' — the recommended one. */
  value: string
  /** The provider can be asked (key saved or not needed). */
  canList: boolean
  maxLength?: number
  onChange: (model: string) => void
}): ReactElement {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const list = useApi('ai', 'models', undefined, {
    enabled: open && canList,
    staleTime: 10 * 60_000,
    retry: false,
    meta: { inlineError: true }
  })
  const recommended = [preset.model, ...(preset.altModels ?? [])].filter(Boolean)
  const others = (list.data ?? NO_MODELS).filter((m) => !recommended.includes(m))
  const text = search.trim()
  const known = recommended.includes(text) || others.includes(text)
  const shown = value || preset.model
  const pick = (model: string): void => {
    onChange(model === preset.model ? '' : model)
    setOpen(false)
    setSearch('')
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setSearch('')
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="field"
          role="combobox"
          aria-expanded={open}
          className="w-72 justify-between"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">{shown || 'Модель, завантажена в програмі'}</span>
            {!value && preset.model && <Badge>рекомендована</Badge>}
          </span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <Command>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Пошук або своя назва моделі…"
            maxLength={maxLength}
          />
          <CommandList>
            <CommandEmpty>Такої моделі в списку немає</CommandEmpty>
            {recommended.length > 0 && (
              <CommandGroup heading="Рекомендовані">
                {recommended.map((m) => (
                  <CommandItem key={m} value={m} onSelect={() => pick(m)}>
                    <span className="flex-1 truncate">{m}</span>
                    {m === preset.model && (
                      <span className="text-meta text-muted-foreground">за замовчуванням</span>
                    )}
                    {m === shown && <Check />}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {canList && (
              <CommandGroup
                heading={
                  list.isSuccess
                    ? `Усі моделі ${preset.short} за вашим ключем · ${others.length}`
                    : `Усі моделі ${preset.short}`
                }
              >
                {list.isPending && (
                  <div className="flex items-center gap-2 px-2 py-1.5 text-caption text-muted-foreground">
                    <Spinner /> Завантажую список…
                  </div>
                )}
                {list.isError && (
                  <div className="px-2 py-1.5 text-caption text-muted-foreground">
                    {list.error.message}
                  </div>
                )}
                {others.map((m) => (
                  <CommandItem key={m} value={m} onSelect={() => pick(m)}>
                    <span className="flex-1 truncate">{m}</span>
                    {m === shown && <Check />}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {(text && !known) || value ? (
              <CommandGroup>
                {text && !known && (
                  <CommandItem
                    value={`__custom__${text}`}
                    keywords={[text]}
                    onSelect={() => pick(text)}
                  >
                    <Plus /> Використати «{text}»
                  </CommandItem>
                )}
                {value && !text && (
                  <CommandItem value="__default__" onSelect={() => pick('')}>
                    <RotateCcw />
                    {preset.model
                      ? `Повернути рекомендовану (${preset.model})`
                      : 'Модель, завантажена в програмі'}
                  </CommandItem>
                )}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
