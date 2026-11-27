import { Fragment, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import {
  FlaskConical,
  Keyboard,
  Moon,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  Settings,
  Sparkles,
  Sun,
  Tags,
  Trash2
} from 'lucide-react'
import { ENTITY_META, type EntityType } from '@shared/entity-types'
import { Button } from '@/components/ui/button'
import { quickAddSchema, searchQuerySchema, type SearchHit } from '@shared/domain/system'
import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut
} from '@/components/ui/command'
import { Spinner } from '@/components/ui/spinner'
import { useApi, useApiMutation } from '@/lib/query'
import { HOTKEY_DIALOG_PROPS, useUi } from '@/stores/ui-store'
import { useHotkey } from '@/hooks/use-hotkey'
import { ENTITY_ICON } from '@/app/navigation'
import { useNavVisibility } from '@/hooks/use-nav-visibility'
import { sidebarToggleLabel } from '@/components/ui/sidebar-label'
import { useResolvedTheme } from '@/hooks/use-theme'
import { fmtRelative, mdPreview } from '@/lib/format'
import { limitsOf } from '@/lib/limits'
import {
  PREFIX_HELP,
  SEARCH_PREFIX,
  parseSearch,
  suggestPrefixes,
  withPrefix
} from '@/lib/search-prefix'
import { FavoriteMark } from '@/components/common/favorite-mark'
import { RecordMenu } from '@/features/record-menu/record-menu'
import { entityMenu } from '@/features/record-menu/entity-menu'

const SEARCH_LIMITS = limitsOf(searchQuerySchema)
const NO_HITS: SearchHit[] = []

type Ref = { type: EntityType; id: string }
/** cmdk item values: one place for the format the items and the selection fallback both use. */
const VALUE = {
  hit: (h: Ref) => `${h.type}:${h.id}`,
  recent: (r: Ref) => `recent:${r.type}:${r.id}`,
  fav: (r: Ref) => `fav:${r.type}:${r.id}`,
  nav: (path: string) => `nav:${path}`,
  prefix: (type: EntityType) => `prefix:${type}`,
  action: (id: string) => `action:${id}`
}
const QUICK_LIMITS = limitsOf(quickAddSchema)
const FAV_LIMIT = 5
const FILTERED_RECENT_LIMIT = 20

/**
 * FTS snippet → plain text: no raw `**`, `#` or list dashes glued into one line (design-system §10).
 * mdPreview drops markers at line starts; a marker left after a sentence end («текст. - кеш») goes too,
 * while «a - b» and «2 * 3» stay as typed.
 */
function cleanSnippet(text: string): string {
  return mdPreview(text).replace(/(^|[.:;!?…])\s*[-*+]\s+/g, (_: string, end: string) =>
    end ? `${end} ` : ''
  )
}

/** Renders FTS snippet with \u0001…\u0002 match markers as <mark>. Markdown is stripped before splitting. */
function Snippet({ text }: { text: string }): ReactElement {
  // eslint-disable-next-line no-control-regex -- FTS5 snippet() wraps matches in \u0001…\u0002 on purpose
  const parts = cleanSnippet(text).split(/(\u0001[^\u0002]*\u0002)/g)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('\u0001') ? (
          <mark key={i} className="rounded bg-lime px-0.5 text-lime-foreground">
            {p.slice(1, -1)}
          </mark>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        )
      )}
    </>
  )
}

interface PaletteAction {
  id: string
  label: string
  icon: ReactNode
  /** Extra words the action is found by («кошик» → Кошик, «бекап» → Налаштування). */
  keywords: string[]
  shortcut?: string
  run: () => void
}

/** Ctrl+K: one search across every module + navigation + quick actions (shadcn CommandDialog). */
export function CommandPalette(): ReactElement {
  const open = useUi((s) => s.paletteOpen)
  const setOpen = useUi((s) => s.setPaletteOpen)
  const setQuickAddOpen = useUi((s) => s.setQuickAddOpen)
  const setShortcutsOpen = useUi((s) => s.setShortcutsOpen)
  const dropReturnFocus = useUi((s) => s.dropReturnFocus)
  const sidebarOpen = useUi((s) => s.sidebarOpen)
  const toggleSidebar = useUi((s) => s.toggleSidebar)
  // «Розділи» and the Alt N hints follow the menu the user sees; records (search, «Нещодавні») are never filtered.
  const { order, isShown } = useNavVisibility()
  const navigate = useNavigate()
  const [text, setText] = useState('')
  // Controlled selection: recent records arrive after cmdk has already picked «Головна».
  const [selected, setSelected] = useState('')
  const [pickedRecent, setPickedRecent] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const theme = useResolvedTheme()
  const updateSettings = useApiMutation('settings', 'update')

  const query = text.trim()
  // «сн: debounce» → snippets only; `term` is what is searched for. «?» lists the prefixes instead.
  const help = query === PREFIX_HELP
  const parsed = parseSearch(text)
  const type = parsed.type
  const term = help ? '' : parsed.query
  const {
    data: rawHits = [],
    isFetching,
    isError,
    refetch
  } = useApi(
    'search',
    'query',
    { text: term, types: type ? [type] : undefined, limit: 60 },
    { enabled: open && term.length > 0, placeholderData: (prev) => prev }
  )
  // Results of the previous query stay while the next one loads; once the field is cleared there are none.
  // The type is checked here too: the kept results may belong to the previous filter.
  const hits = useMemo(
    () => (!term ? NO_HITS : type ? rawHits.filter((h) => h.type === type) : rawHits),
    [term, type, rawHits]
  )
  const failed = !!term && isError
  const showRecent = !term && !help
  const recentList = useApi(
    'search',
    'recent',
    type ? { limit: FILTERED_RECENT_LIMIT, types: [type] } : 8,
    { enabled: open && showRecent }
  )
  const recent = recentList.data ?? []
  // «Обране» under «Нещодавні»: a record may be in both, their cmdk values differ.
  const { data: favAll = [] } = useApi('pins', 'list', 'favorite', { enabled: open && !query })
  const favs = favAll.slice(0, FAV_LIMIT)
  // «Спитати ШІ: …» only once AI is switched on (the chat itself explains a missing key).
  const { data: aiStatus } = useApi('ai', 'status', undefined, { enabled: open })
  const askAi = useUi((s) => s.askAi)
  const offerAi = !!term && !type && !!aiStatus?.settings.enabled

  const grouped = useMemo(() => {
    const map = new Map<EntityType, SearchHit[]>()
    for (const h of hits) map.set(h.type, [...(map.get(h.type) ?? []), h])
    return [...map.entries()]
  }, [hits])

  // Enter right after Ctrl+K opens the latest record, not the first section (adjusted during render, once per opening).
  if (open && !query && recent.length > 0 && !pickedRecent) {
    setPickedRecent(true)
    if (!selected || selected.startsWith('nav:')) setSelected(VALUE.recent(recent[0]))
  }

  const close = (): void => {
    setOpen(false)
    setText('')
    setSelected('')
    setPickedRecent(false)
  }
  const go = (route: string): void => {
    dropReturnFocus()
    close()
    navigate(route)
  }

  // Right click on a record's row: the shared menu of a record known by its summary. «Відкрити» closes the palette.
  const recordRow = (
    key: string,
    record: Ref & { title: string },
    row: ReactElement
  ): ReactElement => (
    <RecordMenu
      asChild
      key={key}
      def={entityMenu}
      record={{ type: record.type, id: record.id, title: record.title }}
      ctx={{ onOpen: () => go(ENTITY_META[record.type].route(record.id)) }}
    >
      {row}
    </RecordMenu>
  )

  useHotkey('mod+k', () => (open ? close() : setOpen(true)), { allowInInputs: true })

  const actions: PaletteAction[] = [
    {
      id: 'quick-add',
      label: 'Швидко додати',
      icon: <Plus />,
      keywords: ['додати', 'створити', 'нове'],
      shortcut: 'Ctrl N',
      run: () => {
        close()
        setQuickAddOpen(true)
      }
    },
    {
      id: 'theme',
      label: theme === 'dark' ? 'Увімкнути світлу тему' : 'Увімкнути темну тему',
      icon: theme === 'dark' ? <Sun /> : <Moon />,
      keywords: ['тема', 'темна', 'світла', 'оформлення'],
      run: () => updateSettings.mutate({ theme: theme === 'dark' ? 'light' : 'dark' })
    },
    {
      id: 'shortcuts',
      label: 'Гарячі клавіші',
      icon: <Keyboard />,
      keywords: ['клавіші', 'шорткати', 'довідка'],
      shortcut: 'Ctrl /',
      run: () => {
        close()
        setShortcutsOpen(true)
      }
    },
    {
      id: 'sidebar',
      label: sidebarToggleLabel(sidebarOpen ? 'expanded' : 'collapsed'),
      icon: sidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />,
      keywords: ['панель', 'меню', 'сайдбар', 'бічна', 'згорнути', 'розгорнути', 'ширше', 'місце'],
      shortcut: 'Ctrl B',
      run: () => {
        close()
        toggleSidebar()
      }
    },
    {
      id: 'menu',
      label: 'Налаштувати меню',
      icon: <PanelLeft />,
      keywords: ['меню', 'розділи', 'сховати', 'показати', 'бічна панель'],
      run: () => go('/settings#menu')
    },
    {
      id: 'trash',
      label: 'Кошик',
      icon: <Trash2 />,
      keywords: ['кошик', 'видалені', 'відновити'],
      run: () => go('/trash')
    },
    {
      id: 'tags',
      label: 'Мітки',
      icon: <Tags />,
      keywords: ['мітки', 'теги'],
      run: () => go('/tags')
    },
    {
      id: 'sandbox',
      label: 'Тестовий режим',
      icon: <FlaskConical />,
      keywords: ['тест', 'тестовий', 'пісочниця', 'демо', 'експеримент'],
      run: () => go('/settings#sandbox')
    },
    {
      id: 'settings',
      label: 'Налаштування, бекап і експорт',
      icon: <Settings />,
      keywords: ['налаштування', 'бекап', 'експорт', 'імпорт', 'журнал', 'оновлення'],
      run: () => go('/settings')
    }
  ]

  const needle = query.toLowerCase()
  // A type filter is about records only: sections and actions step aside.
  const placesOff = help || !!type
  const navMatches = placesOff
    ? []
    : query
      ? order.filter((n) => n.label.toLowerCase().includes(needle))
      : order
  const actionMatches = placesOff
    ? []
    : query
      ? actions.filter(
          (a) =>
            a.label.toLowerCase().includes(needle) || a.keywords.some((k) => k.includes(needle))
        )
      : actions
  const suggestions = type ? [] : suggestPrefixes(text)
  // «?» or a typed prefix («нт»): the filter stands above the results. A section name still wins (placesFirst).
  const suggestFirst = help || (!!suggestions[0] && SEARCH_PREFIX[suggestions[0]] === needle)
  // «нала», «кошик»: the typed text starts a section or an action name, so Enter should open that place,
  // not a record that merely mentions the word.
  const placesFirst =
    !!query &&
    (navMatches.some((n) => n.label.toLowerCase().startsWith(needle)) ||
      actionMatches.some(
        (a) =>
          a.label.toLowerCase().startsWith(needle) || a.keywords.some((k) => k.startsWith(needle))
      ))
  // Nothing found: the typed text is most likely a thought worth keeping. A failed search has found nothing yet.
  const offerAdd =
    isShown('/ideas') &&
    !!query &&
    !placesOff &&
    suggestions.length === 0 &&
    !failed &&
    !isFetching &&
    hits.length === 0 &&
    navMatches.length === 0 &&
    actionMatches.length === 0
  // A filter that has nothing to show offers the way back to the whole search.
  const filterEmpty =
    !!type &&
    !failed &&
    (term ? !isFetching && hits.length === 0 : recentList.isSuccess && recent.length === 0)
  const suggestValues = suggestions.map(VALUE.prefix)
  const hitValues = grouped.flatMap(([, list]) => list.map(VALUE.hit))
  const placeValues = [
    ...navMatches.map((n) => VALUE.nav(n.path)),
    ...actionMatches.map((a) => VALUE.action(a.id))
  ]
  // Values in display order. An empty or stale selection falls back to the first visible item: with
  // shouldFilter=false cmdk doesn't select async results itself, and Enter did nothing.
  const values = [
    ...(failed ? [VALUE.action('retry')] : []),
    ...(placesFirst ? placeValues : []),
    ...(suggestFirst ? suggestValues : []),
    ...hitValues,
    ...(suggestFirst ? [] : suggestValues),
    ...(filterEmpty ? [VALUE.action('search-all')] : []),
    ...(offerAi ? [VALUE.action('ask-ai')] : []),
    ...(offerAdd ? [VALUE.action('add-idea')] : []),
    ...(showRecent ? recent.map(VALUE.recent) : []),
    ...(!query ? favs.map(VALUE.fav) : []),
    ...(placesFirst ? [] : placeValues)
  ]

  const placeGroups = (
    <>
      {navMatches.length > 0 && (
        <CommandGroup heading="Розділи">
          {navMatches.map((n, i) => (
            <CommandItem key={n.path} value={VALUE.nav(n.path)} onSelect={() => go(n.path)}>
              <n.icon />
              {n.label}
              {i < 9 && !query && <CommandShortcut>Alt {i + 1}</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>
      )}

      {actionMatches.length > 0 && (
        <CommandGroup heading="Дії">
          {actionMatches.map((a) => (
            <CommandItem key={a.id} value={VALUE.action(a.id)} onSelect={a.run}>
              {a.icon}
              {a.label}
              {a.shortcut && <CommandShortcut>{a.shortcut}</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>
      )}
    </>
  )

  const pickText = (next: string): void => {
    setText(next)
    setSelected('')
  }

  // A picked filter rewrites the query: the clicked row disappears, and typing goes on in the field.
  const applyFilter = (next: string): void => {
    pickText(next)
    inputRef.current?.focus()
  }

  const suggestGroup = suggestions.length > 0 && (
    <CommandGroup heading="Фільтр за типом">
      {suggestions.map((t) => {
        const Icon = ENTITY_ICON[t]
        return (
          <CommandItem key={t} value={VALUE.prefix(t)} onSelect={() => applyFilter(withPrefix(t))}>
            <Icon />
            <span className="min-w-0 flex-1 truncate">Шукати лише: {ENTITY_META[t].plural}</span>
            <CommandShortcut className="tracking-normal">{SEARCH_PREFIX[t]}:</CommandShortcut>
          </CommandItem>
        )
      })}
    </CommandGroup>
  )

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => (o ? setOpen(true) : close())}
      title="Пошук усюди"
      description="Ідеї, сніпети, помилки, клієнти й розділи"
      showCloseButton={false}
      className="top-[14%] translate-y-0 rounded-3xl sm:max-w-160"
      contentProps={HOTKEY_DIALOG_PROPS}
      commandProps={{
        shouldFilter: false,
        loop: true,
        value: values.includes(selected) ? selected : (values[0] ?? ''),
        onValueChange: setSelected
      }}
    >
      <div className="relative">
        <CommandInput
          ref={inputRef}
          value={text}
          onValueChange={pickText}
          maxLength={SEARCH_LIMITS.text}
          placeholder="Знайти ідею, сніпет, помилку, клієнта…"
        />
        {isFetching && (
          <Spinner className="absolute top-1/2 right-4 -translate-y-1/2 text-muted-foreground" />
        )}
      </div>
      <CommandList className="max-h-[min(60vh,480px)]">
        {failed && (
          // The error toast sits under this modal dialog and can't be clicked, so the retry is offered here.
          <CommandGroup heading="Пошук не спрацював">
            <CommandItem value={VALUE.action('retry')} onSelect={() => void refetch()}>
              <RotateCcw />
              Повторити пошук
            </CommandItem>
          </CommandGroup>
        )}

        {placesFirst && placeGroups}
        {suggestFirst && suggestGroup}

        {grouped.map(([type, list]) => {
          const Icon = ENTITY_ICON[type]
          return (
            <CommandGroup key={type} heading={ENTITY_META[type].plural}>
              {list.map((h, i) =>
                recordRow(
                  VALUE.hit(h),
                  h,
                  // New results fade in one after another; results that stay between keystrokes don't re-animate.
                  <CommandItem
                    value={VALUE.hit(h)}
                    onSelect={() => go(ENTITY_META[h.type].route(h.id))}
                    className="animate-enter"
                    style={{ animationDelay: `${Math.min(i, 8) * 25}ms` }}
                  >
                    <Icon />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate font-medium" title={h.title}>
                          {h.title}
                        </span>
                        <FavoriteMark entity={h} />
                      </div>
                      {h.snippet && (
                        <div className="truncate text-caption text-muted-foreground">
                          <Snippet text={h.snippet} />
                        </div>
                      )}
                    </div>
                  </CommandItem>
                )
              )}
            </CommandGroup>
          )
        })}

        {!suggestFirst && suggestGroup}

        {filterEmpty && (
          <CommandGroup
            heading={`${ENTITY_META[type].plural}: ${term ? 'нічого не знайдено' : 'поки порожньо'}`}
          >
            <CommandItem value={VALUE.action('search-all')} onSelect={() => applyFilter(term)}>
              <RotateCcw />
              Прибрати фільтр і шукати всюди
            </CommandItem>
          </CommandGroup>
        )}

        {offerAi && (
          <CommandGroup heading="ШІ">
            <CommandItem
              value={VALUE.action('ask-ai')}
              onSelect={() => {
                dropReturnFocus()
                close()
                askAi(query)
              }}
            >
              <Sparkles />
              <span className="min-w-0 flex-1 truncate">Спитати ШІ: {query}</span>
            </CommandItem>
          </CommandGroup>
        )}

        {offerAdd && (
          <CommandGroup heading="Нічого не знайдено">
            <CommandItem
              value={VALUE.action('add-idea')}
              onSelect={() => {
                close()
                setQuickAddOpen(true, 'idea', query.slice(0, QUICK_LIMITS.text))
              }}
            >
              <Plus />
              <span className="min-w-0 flex-1 truncate">Додати «{query}» як ідею</span>
            </CommandItem>
          </CommandGroup>
        )}

        {showRecent && recent.length > 0 && (
          <CommandGroup heading={type ? `Нещодавні: ${ENTITY_META[type].plural}` : 'Нещодавні'}>
            {recent.map((r) => {
              const Icon = ENTITY_ICON[r.type]
              return recordRow(
                VALUE.recent(r),
                r,
                <CommandItem
                  value={VALUE.recent(r)}
                  onSelect={() => go(ENTITY_META[r.type].route(r.id))}
                >
                  <Icon />
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="truncate" title={r.title}>
                      {r.title}
                    </span>
                    <FavoriteMark entity={r} />
                  </span>
                  <CommandShortcut className="tracking-normal">
                    {ENTITY_META[r.type].label} · {fmtRelative(r.updatedAt)}
                  </CommandShortcut>
                </CommandItem>
              )
            })}
          </CommandGroup>
        )}

        {!query && favs.length > 0 && (
          <CommandGroup heading="Обране">
            {favs.map((r) => {
              const Icon = ENTITY_ICON[r.type]
              return recordRow(
                VALUE.fav(r),
                r,
                <CommandItem
                  value={VALUE.fav(r)}
                  onSelect={() => go(ENTITY_META[r.type].route(r.id))}
                >
                  <Icon />
                  <span className="min-w-0 flex-1 truncate" title={r.title}>
                    {r.title}
                  </span>
                  <CommandShortcut className="tracking-normal">
                    {ENTITY_META[r.type].label}
                  </CommandShortcut>
                </CommandItem>
              )
            })}
          </CommandGroup>
        )}

        {!placesFirst && placeGroups}
      </CommandList>
      {/* Always there (the list of prefixes aside): with a filter typed, «what else is there?» had no answer. */}
      {!help && (
        <div className="flex items-center gap-3 border-t px-4 py-2 text-caption text-muted-foreground">
          <p className="min-w-0 flex-1 truncate">
            {type
              ? `Шукаємо лише: ${ENTITY_META[type].plural}`
              : `Фільтр за типом: «${SEARCH_PREFIX.snippet}:» сніпети, «${SEARCH_PREFIX.note}:» нотатки`}
          </p>
          <Button
            variant="link"
            className="h-auto shrink-0 p-0 text-caption"
            onClick={() => applyFilter(PREFIX_HELP)}
          >
            Усі фільтри ({PREFIX_HELP})
          </Button>
        </div>
      )}
    </CommandDialog>
  )
}
