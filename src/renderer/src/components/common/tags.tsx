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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'

export const TAG_COLORS = ['#d4f542', '#7c8cf8', '#f5a524', '#f06b6b', '#3fbf9b', '#c98af0', '#5aa9f0', '#9a9f93']

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
      className={cn('h-6 gap-1.5 text-foreground', onClick && 'cursor-pointer hover:bg-accent', onRemove && 'pr-1', className)}
    >
      <span className="size-1.5 rounded-full" style={{ background: tag.color ?? 'var(--muted-foreground)' }} />
      {tag.name}
      {onRemove && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-4 rounded-full text-muted-foreground hover:bg-transparent hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          aria-label={`Убрать метку ${tag.name}`}
        >
          <X className="size-3" />
        </Button>
      )}
    </Badge>
  )
}

export function TagList({ tags, max = 4, className }: { tags: Tag[]; max?: number; className?: string }) {
  if (!tags.length) return null
  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {tags.slice(0, max).map((t) => (
        // Rows sit on the same surface as a soft badge, so the chip gets its own tint (and an ink one in active rows).
        <TagChip
          key={t.id}
          tag={t}
          className="h-5 px-2 bg-foreground/[0.07] [[data-active]_&]:bg-ink-foreground/12 [[data-active]_&]:text-ink-foreground"
        />
      ))}
      {tags.length > max && <span className="text-meta text-muted-foreground">+{tags.length - max}</span>}
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
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { data: all = [] } = useApi('tags', 'list')
  const create = useApiMutation('tags', 'create')
  const selected = new Set(value.map((t) => t.id))
  const exact = all.some((t) => t.name.toLowerCase() === query.trim().toLowerCase())

  const toggle = (id: string): void => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange([...next])
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {value.map((t) => (
        <TagChip key={t.id} tag={t} onRemove={() => toggle(t.id)} />
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="xs" className="h-6 border-dashed text-muted-foreground">
            {value.length ? <Plus /> : <TagIcon />}
            {value.length ? '' : 'Метки'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 rounded-2xl p-0" align="start">
          <Command>
            <CommandInput placeholder="Найти или создать…" value={query} onValueChange={setQuery} />
            <CommandList>
              <CommandEmpty>Нет меток</CommandEmpty>
              <CommandGroup>
                {all.map((t) => (
                  <CommandItem key={t.id} value={t.name} onSelect={() => toggle(t.id)}>
                    <span className="size-2 rounded-full" style={{ background: t.color ?? 'var(--muted-foreground)' }} />
                    <span className="flex-1">{t.name}</span>
                    {selected.has(t.id) && <Check className="size-3.5" />}
                  </CommandItem>
                ))}
                {query.trim() && !exact && (
                  <CommandItem
                    value={`__create__${query}`}
                    onSelect={async () => {
                      const tag = await create.mutateAsync({
                        name: query.trim(),
                        color: TAG_COLORS[all.length % TAG_COLORS.length]
                      })
                      onChange([...selected, tag.id])
                      setQuery('')
                    }}
                  >
                    <Plus className="size-3.5" />
                    Создать «{query.trim()}»
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

/** Tag filter dropdown for list pages. */
export function TagFilter({ value, onChange }: { value: string | undefined; onChange: (id: string | undefined) => void }) {
  const { data: all = [] } = useApi('tags', 'list')
  const [open, setOpen] = useState(false)
  const current = all.find((t) => t.id === value)
  if (!all.length) return null
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <ButtonGroup>
        <PopoverTrigger asChild>
          <Button variant={current ? 'default' : 'soft'} size="sm">
            <TagIcon />
            {current ? current.name : 'Метка'}
          </Button>
        </PopoverTrigger>
        {current && (
          <Button variant="default" size="icon-sm" aria-label="Сбросить метку" onClick={() => onChange(undefined)}>
            <X />
          </Button>
        )}
      </ButtonGroup>
      <PopoverContent className="w-56 rounded-2xl p-0" align="start">
        <Command>
          <CommandInput placeholder="Метка…" />
          <CommandList>
            <CommandEmpty>Не найдено</CommandEmpty>
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
                  <span className="size-2 rounded-full" style={{ background: t.color ?? 'var(--muted-foreground)' }} />
                  <span className="flex-1">{t.name}</span>
                  <span className="text-meta text-muted-foreground">{t.usage}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
