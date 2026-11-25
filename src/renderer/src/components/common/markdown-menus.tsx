import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type RefObject
} from 'react'
import {
  CodeXml,
  Heading1,
  Heading2,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  Table2,
  type LucideIcon
} from 'lucide-react'
import type { EntitySummary } from '@shared/domain/common'
import { refKey } from '@shared/wikilinks'
import type { MenuKey } from '@/lib/md-editor/setup'
import {
  filterSlashCommands,
  type SlashCommand,
  type SlashCommandId
} from '@/lib/md-editor/slash-commands'
import { useEntitySearch } from '@/hooks/use-entity-search'
import { useCurrentRecord } from '@/hooks/use-current-record'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandShortcut
} from '@/components/ui/command'
import { Separator } from '@/components/ui/separator'
import { Kbd } from '@/components/ui/kbd'
import { EntityOption } from './entity-options'

/**
 * The lists of a Markdown field's «/» and «[[» menus. Focus stays in the text the whole time (Notion, Obsidian):
 * the editor hands its ↑ ↓ Enter Tab to the list through `keysRef`, and the list tells the editor which option is
 * highlighted (`onActive`), so a screen reader hears it through aria-activedescendant.
 */
export interface MenuListProps {
  /** The list puts its key handler here: true — the key was its. */
  keysRef: RefObject<((key: MenuKey) => boolean) | null>
  /** The listbox id and the highlighted option id, for the editor's aria-controls / aria-activedescendant. */
  onActive: (listId: string | undefined, optionId: string | undefined) => void
}

const SLASH_ICON: Record<SlashCommandId, LucideIcon> = {
  h1: Heading1,
  h2: Heading2,
  list: List,
  ordered: ListOrdered,
  todo: ListTodo,
  quote: Quote,
  code: CodeXml,
  table: Table2,
  divider: Minus,
  link: Link2
}

/** ↑ ↓ Enter / Tab over a list of keys; the highlight follows the list (the first row when it changed under it). */
function useMenuKeys<T>(
  items: T[],
  keyOf: (item: T) => string,
  pick: (item: T) => void,
  { keysRef }: Pick<MenuListProps, 'keysRef'>,
  /** Enter with nothing to pick (the list is still loading): close, and the key types a new line. */
  onEmptyEnter?: () => void
): [string, (key: string) => void] {
  const [picked, setPicked] = useState('')
  const active = items.some((i) => keyOf(i) === picked) ? picked : items[0] ? keyOf(items[0]) : ''
  useEffect(() => {
    keysRef.current = (key) => {
      const index = items.findIndex((i) => keyOf(i) === active)
      if ((key === 'ArrowDown' || key === 'ArrowUp') && items.length) {
        const step = key === 'ArrowDown' ? 1 : -1
        setPicked(keyOf(items[(index + step + items.length) % items.length]))
        return true
      }
      if (key === 'Enter' || key === 'Tab') {
        if (index >= 0) {
          pick(items[index])
          return true
        }
        onEmptyEnter?.()
      }
      return false
    }
  })
  return [active, setPicked]
}

/** Reports the listbox and its highlighted option to the editor, and keeps the option in view. */
function useActiveOption(
  list: RefObject<HTMLDivElement | null>,
  selector: string | null,
  onActive: MenuListProps['onActive']
): void {
  useLayoutEffect(() => {
    const box = list.current
    const option = selector ? box?.querySelector<HTMLElement>(selector) : null
    option?.scrollIntoView({ block: 'nearest' })
    onActive(box?.id, option?.id)
  }, [list, selector, onActive])
  useEffect(() => () => onActive(undefined, undefined), [onActive])
}

/** The footer every menu of the field shows: how to drive it without leaving the text. */
function MenuKeysHint(): ReactElement {
  return (
    <>
      <Separator />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-meta text-muted-foreground">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> вибрати
        </span>
        <span className="flex items-center gap-1">
          <Kbd>Enter</Kbd> вставити
        </span>
        <span className="flex items-center gap-1">
          <Kbd>Esc</Kbd> закрити
        </span>
      </div>
    </>
  )
}

/** The «/» menu: blocks to insert, filtered by what follows the `/`. */
export function SlashMenuList({
  query,
  onRun,
  keysRef,
  onActive
}: MenuListProps & {
  query: string
  onRun: (command: SlashCommand) => void
}): ReactElement {
  const list = useRef<HTMLDivElement>(null)
  const items = useMemo(() => filterSlashCommands(query), [query])
  const [active, setPicked] = useMenuKeys(items, (c) => c.id, onRun, { keysRef })
  useActiveOption(list, active ? `[data-slash="${active}"]` : null, onActive)
  return (
    <Command shouldFilter={false} value={active} onValueChange={setPicked} loop>
      <CommandList ref={list} label="Блоки для вставки">
        <CommandGroup heading="Вставити">
          {items.map((c) => {
            const Icon = SLASH_ICON[c.id]
            return (
              <CommandItem key={c.id} value={c.id} data-slash={c.id} onSelect={() => onRun(c)}>
                <Icon />
                <span className="min-w-0 flex-1 truncate">{c.label}</span>
                <CommandShortcut className="font-mono tracking-normal">{c.markup}</CommandShortcut>
              </CommandItem>
            )
          })}
        </CommandGroup>
      </CommandList>
      <MenuKeysHint />
    </Command>
  )
}

/** The «[[» menu: records to link, recent ones before anything is typed, search hits after. */
export function WikiMenuList({
  query,
  onPick,
  onNothing,
  keysRef,
  onActive
}: MenuListProps & {
  query: string
  onPick: (item: EntitySummary) => void
  /** Enter while nothing is listed: the menu closes and Enter is a new line again. */
  onNothing: () => void
}): ReactElement {
  const list = useRef<HTMLDivElement>(null)
  const found = useEntitySearch(query, { enabled: true, recent: 9, hits: 9 })
  const { searching, loading } = found
  // Not the record being written: it was edited a moment ago and would always top «Нещодавні».
  const self = useCurrentRecord()
  const items = useMemo(
    () => found.items.filter((i) => !self || refKey(i) !== refKey(self)).slice(0, 8),
    [found.items, self]
  )
  const [active, setPicked] = useMenuKeys(items, refKey, onPick, { keysRef }, onNothing)
  useActiveOption(list, active ? `[data-entity="${CSS.escape(active)}"]` : null, onActive)
  return (
    <Command shouldFilter={false} value={active} onValueChange={setPicked} loop>
      <CommandList ref={list} label="Записи для посилання">
        <CommandEmpty>
          {loading ? 'Шукаю…' : searching ? 'Нічого не знайдено' : 'Почніть вводити назву запису'}
        </CommandEmpty>
        {items.length > 0 && (
          <CommandGroup heading={searching ? 'Результати' : 'Нещодавні'}>
            {items.map((item) => (
              <EntityOption key={refKey(item)} item={item} onSelect={() => onPick(item)} />
            ))}
          </CommandGroup>
        )}
      </CommandList>
      <MenuKeysHint />
    </Command>
  )
}
