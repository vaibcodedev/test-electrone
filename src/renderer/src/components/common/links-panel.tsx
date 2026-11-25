import { useState } from 'react'
import { Plus, Unlink } from 'lucide-react'
import type { EntityRef, EntitySummary } from '@shared/domain/common'
import { ENTITY_META } from '@shared/entity-types'
import { useApi, useApiMutation } from '@/lib/query'
import { fmtRelative } from '@/lib/format'
import { ENTITY_ICON } from '@/app/navigation'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { EntityRow } from './entity-link'
import { IconAction } from './icon-action'
import { SectionLabel } from './section-label'
import { useReadOnly } from './detail-mode-context'

const LINKS_HINT = "Пов’яжіть запис з іншим — ідею з дошкою, помилку зі сніпетом. Зв’язок видно з обох боків."

/** Links between any objects: idea → project → board → snippets → designs. */
export function LinksPanel({ entity }: { entity: EntityRef }) {
  const viewMode = useReadOnly()
  const { data: links = [] } = useApi('links', 'list', entity)
  const remove = useApiMutation('links', 'remove')
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel action={<LinkPicker entity={entity} linked={links} />}>Зв’язки</SectionLabel>
      {/* No links: reading needs only the title and «Зв’язати» (the full hint is on its tooltip). No link to the
          guide here: leaving the page mid-edit would skip «Зберегти зміни?». */}
      {links.length === 0 ? (
        !viewMode && <p className="py-1 text-caption text-muted-foreground">Зв’язок видно з обох записів.</p>
      ) : (
        <div className="-mx-2.5 flex flex-col">
          {links.map((l) => (
            <EntityRow
              key={l.linkId}
              item={l}
              trailing={
                <IconAction
                  label="Прибрати зв’язок"
                  className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    remove.mutate(l.linkId)
                  }}
                >
                  <Unlink />
                </IconAction>
              }
            />
          ))}
        </div>
      )}
    </section>
  )
}

/** Search hits carry \u0001…\u0002 match markers — plain text is enough for a one-line preview. */
const plainSnippet = (s?: string): string => (s ?? '').replace(/[\u0001\u0002]/g, '').replace(/\s+/g, ' ').trim()

function LinkPicker({ entity, linked }: { entity: EntityRef; linked: EntitySummary[] }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const { data: recent = [] } = useApi('search', 'recent', 15, { enabled: open })
  const { data: hits = [] } = useApi('search', 'query', { text, limit: 20 }, { enabled: open && text.trim().length > 0 })
  const create = useApiMutation('links', 'create', { successMessage: "Зв’язок додано" })
  const taken = new Set([`${entity.type}:${entity.id}`, ...linked.map((l) => `${l.type}:${l.id}`)])
  // Hide the record itself and what's already linked.
  const list = (text.trim() ? hits : recent).filter((i) => !taken.has(`${i.type}:${i.id}`))
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="outline" size="xs">
              <Plus /> Зв’язати
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">{LINKS_HINT}</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-96 rounded-2xl p-0" align="end">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Знайти будь-що…" value={text} onValueChange={setText} />
          <CommandList>
            <CommandEmpty>Нічого не знайдено</CommandEmpty>
            <CommandGroup heading={text.trim() ? 'Результати' : 'Нещодавні'}>
              {list.map((item) => {
                const Icon = ENTITY_ICON[item.type]
                const snippet = 'snippet' in item ? plainSnippet((item as { snippet?: string }).snippet) : ''
                // Type plus one fact: a preview line, else the time — identical titles («Нова нотатка» ×10) differ by it.
                const detail = snippet || item.subtitle || (item.updatedAt ? fmtRelative(item.updatedAt) : '')
                const meta = [ENTITY_META[item.type].label, detail].filter(Boolean).join(' · ')
                return (
                  <CommandItem
                    key={`${item.type}:${item.id}`}
                    value={`${item.type}:${item.id}`}
                    onSelect={() => {
                      create.mutate({ fromType: entity.type, fromId: entity.id, toType: item.type, toId: item.id })
                      setOpen(false)
                      setText('')
                    }}
                    className="items-start"
                  >
                    <Icon className="mt-0.5" />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate">{item.title}</span>
                      <span className="truncate text-meta text-muted-foreground">{meta}</span>
                    </div>
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
