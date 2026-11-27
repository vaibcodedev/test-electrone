import { useState, type ReactElement } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { isBuiltinSituation, situationLabel } from '@shared/domain/freelance'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export interface SituationCount {
  value: string
  count: number
}

/**
 * The situation filter of «Шаблони»: one button with a searchable list (as TagFilter). Not chips: the person
 * types their own situations, so their number has no limit, and chips took over the page.
 */
export function SituationFilter({
  value,
  options,
  onChange
}: {
  value: string | undefined
  /** In menu order: built-in ones first, then the person's own. */
  options: SituationCount[]
  onChange: (situation: string | undefined) => void
}): ReactElement {
  const [open, setOpen] = useState(false)
  const pick = (next: string | undefined): void => {
    onChange(next)
    setOpen(false)
  }
  const chosen = value && 'bg-foreground/12 font-medium hover:bg-foreground/16'
  const groups = [
    { heading: 'Стандартні', items: options.filter((o) => isBuiltinSituation(o.value)) },
    { heading: 'Мої', items: options.filter((o) => !isBuiltinSituation(o.value)) }
  ].filter((g) => g.items.length > 0)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <ButtonGroup>
        <PopoverTrigger asChild>
          <Button
            variant="soft"
            size="sm"
            className={cn('max-w-72', chosen)}
            title={value ? situationLabel(value) : undefined}
          >
            <span className="truncate">{value ? situationLabel(value) : 'Усі ситуації'}</span>
            <ChevronDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        {value && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="soft"
                size="icon-sm"
                className={chosen || undefined}
                aria-label="Скинути ситуацію"
                onClick={() => onChange(undefined)}
              >
                <X />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Скинути ситуацію</TooltipContent>
          </Tooltip>
        )}
      </ButtonGroup>
      <PopoverContent className="w-80 p-0" align="start">
        <Command
          // By the label, not the stored key («proposal» must not match «Відгук»).
          filter={(_v, search, keywords) =>
            keywords?.some((k) =>
              k.toLocaleLowerCase('uk').includes(search.trim().toLocaleLowerCase('uk'))
            )
              ? 1
              : 0
          }
        >
          <CommandInput placeholder="Знайти ситуацію…" />
          <CommandList>
            <CommandEmpty>Нічого не знайдено</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__all__" keywords={['Усі ситуації']} onSelect={() => pick(undefined)}>
                <span className="flex-1">Усі ситуації</span>
                {!value && <Check />}
              </CommandItem>
            </CommandGroup>
            {groups.map((g) => (
              <CommandGroup key={g.heading} heading={g.heading}>
                {g.items.map((o) => (
                  <CommandItem
                    key={o.value}
                    value={o.value}
                    keywords={[situationLabel(o.value)]}
                    onSelect={() => pick(o.value)}
                  >
                    <span className="min-w-0 flex-1 truncate" title={situationLabel(o.value)}>
                      {situationLabel(o.value)}
                    </span>
                    {o.value === value && <Check />}
                    <span className="text-meta text-muted-foreground tabular-nums">{o.count}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
