import { useState } from 'react'
import { Check, Plus, Tag as TagIcon, X } from 'lucide-react'
import type { Tag } from '@shared/domain/common'
import { useApi, useApiMutation } from '@/lib/query'
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
import { useReadOnly } from './detail-mode'
import { limitsOf } from '@/lib/limits'
import { tagInputSchema } from '@shared/domain/system'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PALETTE } from '@shared/colors'
import { SectionLabel } from './section-label'
import { IconAction } from './icon-action'

/** Same limit as tagInputSchema.name — a new tag can be created right from the picker. */
const TAG_NAME_MAX = limitsOf(tagInputSchema).name

/** The shared PALETTE (@shared/colors), as a plain string[]: callers check `.includes(anyColour)`. */
export const TAG_COLORS: string[] = [...PALETTE]

export function TagChip({
  tag,
  onRemove,
  onClick,
  className
}: {
  tag: Pick<Tag, 'name' | 'color'>
  onRemove?: () => void
  onClick?: () => void
  className?: string
}) {
  return (
    <Badge
      variant="soft"
      onClick={onClick}
      title={tag.name}
      // min-w-0 shrink: Badge itself never shrinks — a long tag in a row that doesn't wrap ends with «…» instead.
      className={cn(
        'h-6 min-w-0 shrink justify-start gap-1.5 text-foreground',
        onClick && 'cursor-pointer hover:bg-foreground/10',
        onRemove && 'pr-1',
        className
      )}
    >
      {/* An outline like the legend dots (DS §11): a lime dot on a light chip was all but invisible. */}
      <span
        className="size-1.5 shrink-0 rounded-full ring-1 ring-foreground/20 in-data-active:ring-ink-foreground/25"
        style={{ background: tag.color ?? 'var(--muted-foreground)' }}
      />
      {/* A long tag name ends with «…» (full name on hover) instead of leaving the row. */}
      <span className="min-w-0 truncate">{tag.name}</span>
      {onRemove && (
        // 24px target inside the 32px chip (WCAG 2.5.8); the icon stays small. Named and with a tooltip like every
        // icon button.
        <IconAction
          label={`Прибрати мітку «${tag.name}»`}
          className="-mr-0.5 shrink-0 rounded-full text-muted-foreground hover:bg-transparent hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
        >
          <X className="size-3" />
        </IconAction>
      )}
    </Badge>
  )
}

/** Colour dot + name of a tag in a picker list; a long name ends with «…» inside the popover. */
function TagOptionName({ tag }: { tag: Pick<Tag, 'name' | 'color'> }) {
  return (
    <>
      <span
        className="size-2 shrink-0 rounded-full ring-1 ring-foreground/20"
        style={{ background: tag.color ?? 'var(--muted-foreground)' }}
      />
      <span className="min-w-0 flex-1 truncate" title={tag.name}>
        {tag.name}
      </span>
    </>
  )
}

export function TagList({
  tags,
  max = 4,
  className
}: {
  tags: Tag[]
  max?: number
  className?: string
}) {
  if (!tags.length) return null
  return (
    <div className={cn('flex min-w-0 max-w-full flex-wrap items-center gap-1', className)}>
      {tags.slice(0, max).map((t) => (
        // Rows sit on the same surface as a soft badge, so the chip gets its own tint (and an ink one in active rows).
        <TagChip
          key={t.id}
          tag={t}
          className="h-5 px-2 bg-foreground/[0.07] in-data-active:bg-ink-foreground/12 in-data-active:text-ink-foreground"
        />
      ))}
      {/* In an active (ink) row the count takes the ink muted colour, like the chips: muted-foreground was ≈2:1 there. */}
      {tags.length > max && (
        <span className="text-meta text-muted-foreground in-data-active:text-ink-muted">
          +{tags.length - max}
        </span>
      )}
    </div>
  )
}

/** Global tags picker: choose existing or create a new tag inline. */
export function TagPicker({
  value,
  onChange,
  className
}: {
  value: Tag[]
  onChange: (tagIds: string[]) => void
  className?: string
}) {
  const viewMode = useReadOnly()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { data: all = [] } = useApi('tags', 'list', undefined, { enabled: !viewMode })
  const create = useApiMutation('tags', 'create')
  const selected = new Set(value.map((t) => t.id))
  const exact = all.some((t) => t.name.toLowerCase() === query.trim().toLowerCase())

  const toggle = (id: string): void => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange([...next])
  }

  // Record view mode: tags as read-only chips; none — nothing (the field hides itself).
  if (viewMode)
    return value.length ? (
      <TagList tags={value} max={20} className={className} />
    ) : (
      <span data-empty />
    )
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {/* Editable tags are full-size controls (h-8, body text): the picker is a form field, not a meta badge. */}
      {value.map((t) => (
        <TagChip key={t.id} tag={t} onRemove={() => toggle(t.id)} className="h-8 px-3 text-body" />
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="border-dashed text-muted-foreground hover:text-foreground"
            aria-label={value.length ? 'Додати мітку' : undefined}
          >
            {value.length ? <Plus /> : <TagIcon />}
            {value.length ? '' : 'Додати мітку'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 rounded-2xl p-0" align="start">
          <Command>
            <CommandInput
              placeholder="Знайти або створити…"
              value={query}
              onValueChange={setQuery}
              maxLength={TAG_NAME_MAX}
            />
            <CommandList>
              <CommandEmpty>Міток поки немає — введіть назву, щоб створити</CommandEmpty>
              <CommandGroup>
                {all.map((t) => (
                  <CommandItem key={t.id} value={t.name} onSelect={() => toggle(t.id)}>
                    <TagOptionName tag={t} />
                    {selected.has(t.id) && <Check className="size-3.5" />}
                  </CommandItem>
                ))}
                {query.trim() && !exact && (
                  <CommandItem
                    value={`__create__${query}`}
                    disabled={create.isPending}
                    onSelect={() =>
                      // A failure is toasted by useApiMutation; the typed name stays in the field.
                      create.mutate(
                        { name: query.trim(), color: TAG_COLORS[all.length % TAG_COLORS.length] },
                        {
                          onSuccess: (tag) => {
                            onChange([...selected, tag.id])
                            setQuery('')
                          }
                        }
                      )
                    }
                  >
                    <Plus className="size-3.5 shrink-0" />
                    <span className="min-w-0 truncate">Створити «{query.trim()}»</span>
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

/** «Мітки» section of a record column; while reading, a record without tags shows no section at all. */
export function TagsSection({
  value,
  onChange,
  className
}: {
  value: Tag[]
  onChange: (tagIds: string[]) => void
  /** Spacing from the section above (a sheet's mt-5); the empty-in-view rule stays the component's own. */
  className?: string
}) {
  const viewMode = useReadOnly()
  if (viewMode && !value.length) return null
  return (
    <section className={cn('flex flex-col gap-2', className)}>
      <SectionLabel>Мітки</SectionLabel>
      <TagPicker value={value} onChange={onChange} />
    </section>
  )
}

/**
 * Tag filter dropdown for list pages. A chosen tag is neutral by default (it sits next to lime filter
 * chips: one accent per row); `tone="accent"` makes it lime when it is the screen's only filter.
 */
export function TagFilter({
  value,
  onChange,
  tone = 'neutral'
}: {
  value: string | undefined
  onChange: (id: string | undefined) => void
  tone?: 'accent' | 'neutral'
}) {
  const { data: all = [] } = useApi('tags', 'list')
  const [open, setOpen] = useState(false)
  const current = all.find((t) => t.id === value)
  if (!all.length) return null
  const variant = current && tone === 'accent' ? 'lime' : 'soft'
  const chosen =
    current && tone === 'neutral' && 'bg-foreground/12 font-medium hover:bg-foreground/16'
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <ButtonGroup>
        <PopoverTrigger asChild>
          <Button
            variant={variant}
            size="sm"
            className={cn('max-w-56', chosen)}
            title={current?.name}
          >
            <TagIcon />
            <span className="truncate">{current ? current.name : 'Мітка'}</span>
          </Button>
        </PopoverTrigger>
        {current && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={variant}
                size="icon-sm"
                className={chosen || undefined}
                aria-label="Скинути мітку"
                onClick={() => onChange(undefined)}
              >
                <X />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Скинути мітку</TooltipContent>
          </Tooltip>
        )}
      </ButtonGroup>
      <PopoverContent className="w-56 rounded-2xl p-0" align="start">
        <Command>
          <CommandInput placeholder="Знайти мітку…" />
          <CommandList>
            <CommandEmpty>Нічого не знайдено</CommandEmpty>
            <CommandGroup>
              {all.map((t) => (
                <CommandItem
                  key={t.id}
                  value={t.name}
                  onSelect={() => {
                    onChange(t.id === value ? undefined : t.id)
                    setOpen(false)
                  }}
                >
                  <TagOptionName tag={t} />
                  <span className="shrink-0 text-meta text-muted-foreground">{t.usage}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
