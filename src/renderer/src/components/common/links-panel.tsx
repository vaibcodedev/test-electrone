import { useState } from 'react'
import { Plus, Unlink } from 'lucide-react'
import type { EntityRef } from '@shared/domain/common'
import { ENTITY_META } from '@shared/entity-types'
import { useApi, useApiMutation } from '@/lib/query'
import { ENTITY_ICON } from '@/app/navigation'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { EntityRow } from './entity-link'

/** Links between any objects: idea → project → board → snippets → designs. */
export function LinksPanel({ entity }: { entity: EntityRef }) {
  const { data: links = [] } = useApi('links', 'list', entity)
  const remove = useApiMutation('links', 'remove')
  return (
    <section className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <h3 className="text-[12px] text-muted-foreground">Связи</h3>
        <LinkPicker entity={entity} />
      </div>
      {links.length === 0 ? (
        <p className="py-1 text-[12px] text-muted-foreground/80">Свяжите с проектом, доской, сниппетом или дизайном.</p>
      ) : (
        <div className="-mx-2.5 flex flex-col">
          {links.map((l) => (
            <EntityRow
              key={l.linkId}
              item={l}
              trailing={
                <button
                  type="button"
                  title="Убрать связь"
                  className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    remove.mutate(l.linkId)
                  }}
                >
                  <Unlink className="size-4" />
                </button>
              }
            />
          ))}
        </div>
      )}
    </section>
  )
}

function LinkPicker({ entity }: { entity: EntityRef }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const { data: recent = [] } = useApi('search', 'recent', 15, { enabled: open })
  const { data: hits = [] } = useApi('search', 'query', { text, limit: 20 }, { enabled: open && text.trim().length > 0 })
  const create = useApiMutation('links', 'create', { successMessage: 'Связь добавлена' })
  const list = (text.trim() ? hits : recent).filter((i) => !(i.type === entity.type && i.id === entity.id))
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11.5px] text-muted-foreground hover:bg-surface hover:text-foreground"
        >
          <Plus className="size-3" /> Связать
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 rounded-2xl p-0" align="end">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Найти что угодно…" value={text} onValueChange={setText} />
          <CommandList>
            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">Ничего не найдено</CommandEmpty>
            <CommandGroup heading={text.trim() ? 'Результаты' : 'Недавние'}>
              {list.map((item) => {
                const Icon = ENTITY_ICON[item.type]
                return (
                  <CommandItem
                    key={`${item.type}:${item.id}`}
                    value={`${item.type}:${item.id}`}
                    onSelect={() => {
                      create.mutate({ fromType: entity.type, fromId: entity.id, toType: item.type, toId: item.id })
                      setOpen(false)
                      setText('')
                    }}
                  >
                    <Icon className="size-4" />
                    <span className="flex-1 truncate">{item.title}</span>
                    <span className="text-[11px] text-muted-foreground">{ENTITY_META[item.type].label}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

