import { useMemo, useState, type ReactElement } from 'react'
import { Plus, Unlink } from 'lucide-react'
import type { EntityRef, EntitySummary } from '@shared/domain/common'
import type { LinkedEntity } from '@shared/domain/system'
import { refKey } from '@shared/wikilinks'
import { useApi, useApiMutation } from '@/lib/query'
import { useEntitySearch } from '@/hooks/use-entity-search'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList
} from '@/components/ui/command'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { EntityRow, useOpenEntity } from './entity-link'
import { EntityOption } from './entity-options'
import { IconAction } from './icon-action'
import { SectionLabel } from './section-label'
import { presenceProps, usePresenceList } from '@/hooks/use-presence-list'
import { useDetailMode, useReadOnly } from './detail-mode-context'

const LINKS_HINT =
  'Пов’яжіть запис з іншим — ідею з дошкою, помилку зі сніпетом. Зв’язок видно з обох записів.'

/** Rows shown before «Показати ще», as in «Згадки»: a dozen links pushed a board's designs a screen down. */
const FIRST = 5
/** One empty list for every render while loading: usePresenceList compares the array itself. */
const NO_LINKS: LinkedEntity[] = []

/** Links between any objects: idea → project → board → snippets → designs. */
export function LinksPanel({ entity }: { entity: EntityRef }): ReactElement {
  const viewMode = useReadOnly()
  const mode = useDetailMode()
  const openEntity = useOpenEntity()
  const { data: links = NO_LINKS } = useApi('links', 'list', entity)
  const remove = useApiMutation('links', 'remove')
  const [all, setAll] = useState(false)
  // Memoised: usePresenceList compares the array itself; rows past five unfold and fold instead of jumping.
  const shown = useMemo(() => (all ? links : links.slice(0, FIRST)), [all, links])
  const rows = usePresenceList(shown, (l) => l.linkId)
  const rest = links.length - shown.length
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel action={<LinkPicker entity={entity} linked={links} />}>Зв’язки</SectionLabel>
      {/* No links: reading needs only the title and «Зв’язати» (the full hint is on its tooltip). No link to the
          guide here: leaving the page mid-edit would skip «Зберегти зміни?» (a linked row asks it first). */}
      {links.length === 0 ? (
        !viewMode && (
          <p className="py-1 text-caption text-muted-foreground">Зв’язок видно з обох записів.</p>
        )
      ) : (
        <div className="-mx-2.5 flex flex-col">
          {rows.map(({ item: l, ...entry }) => (
            <div key={l.linkId} {...presenceProps({ ...entry, item: l })}>
              <EntityRow
                item={l}
                onOpen={() =>
                  mode.editing && mode.confirmClose
                    ? mode.confirmClose(() => openEntity(l))
                    : openEntity(l)
                }
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
            </div>
          ))}
        </div>
      )}
      {/* Opened — it folds back too: «Показати ще» was a one-way door. */}
      {(rest > 0 || (all && links.length > FIRST)) && (
        <Button
          variant="link"
          size="xs"
          className="self-start"
          aria-expanded={all}
          onClick={() => setAll(!all)}
        >
          {all ? 'Згорнути' : `Показати ще ${rest}`}
        </Button>
      )}
    </section>
  )
}

function LinkPicker({
  entity,
  linked
}: {
  entity: EntityRef
  linked: EntitySummary[]
}): ReactElement {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const { items } = useEntitySearch(text, { enabled: open })
  const create = useApiMutation('links', 'create', { successMessage: 'Зв’язок додано' })
  const taken = new Set([refKey(entity), ...linked.map(refKey)])
  // Hide the record itself and what's already linked.
  const list = items.filter((i) => !taken.has(refKey(i)))
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
          <CommandList label="Записи для зв’язку">
            {/* Before any search nothing is «not found»: say what to do instead. */}
            <CommandEmpty>
              {text.trim() ? 'Нічого не знайдено' : 'Почніть вводити назву запису'}
            </CommandEmpty>
            {list.length > 0 && (
              <CommandGroup heading={text.trim() ? 'Результати' : 'Нещодавні'}>
                {list.map((item) => (
                  <EntityOption
                    key={refKey(item)}
                    item={item}
                    onSelect={() => {
                      create.mutate({
                        fromType: entity.type,
                        fromId: entity.id,
                        toType: item.type,
                        toId: item.id
                      })
                      setOpen(false)
                      setText('')
                    }}
                  />
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
