import { Fragment, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Keyboard, Moon, Plus, Settings, Sun, Tags, Trash2 } from 'lucide-react'
import { ENTITY_META, type EntityType } from '@shared/entity-types'
import { quickAddSchema, searchQuerySchema, type SearchHit } from '@shared/domain/system'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut
} from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { useApi, useApiMutation } from '@/lib/query'
import { restoreFocus, useUi } from '@/stores/ui-store'
import { useHotkey } from '@/hooks/use-hotkey'
import { ALL_NAV_ITEMS, ENTITY_ICON } from '@/app/navigation'
import { useResolvedTheme } from '@/hooks/use-theme'
import { fmtRelative, mdPreview } from '@/lib/format'
import { limitsOf } from '@/lib/limits'

const SEARCH_LIMITS = limitsOf(searchQuerySchema)
const NO_HITS: SearchHit[] = []

type Ref = { type: EntityType; id: string }
/** cmdk item values: one place for the format the items and the selection fallback both use. */
const VALUE = {
  hit: (h: Ref) => `${h.type}:${h.id}`,
  recent: (r: Ref) => `recent:${r.type}:${r.id}`,
  nav: (path: string) => `nav:${path}`,
  action: (id: string) => `action:${id}`
}
const QUICK_LIMITS = limitsOf(quickAddSchema)

/**
 * FTS snippet → plain text: no raw `**`, `#` or list dashes glued into one line (design-system §10).
 * mdPreview drops markers at line starts; a marker left after a sentence end («текст. - кеш») goes too,
 * while «a - b» and «2 * 3» stay as typed.
 */
function cleanSnippet(text: string): string {
  return mdPreview(text).replace(/(^|[.:;!?…])\s*[-*+]\s+/g, (_: string, end: string) => (end ? `${end} ` : ''))
}

/** Renders FTS snippet with \u0001…\u0002 match markers as <mark>. Markdown is stripped before splitting. */
function Snippet({ text }: { text: string }): ReactElement {
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

/** Ctrl+K: one search across every module + navigation + quick actions (shadcn Dialog + Command). */
export function CommandPalette(): ReactElement {
  const open = useUi((s) => s.paletteOpen)
  const setOpen = useUi((s) => s.setPaletteOpen)
  const setQuickAddOpen = useUi((s) => s.setQuickAddOpen)
  const setShortcutsOpen = useUi((s) => s.setShortcutsOpen)
  const navigate = useNavigate()
  const [text, setText] = useState('')
  // Controlled selection: recent records arrive after cmdk has already picked «Головна».
  const [selected, setSelected] = useState('')
  const [pickedRecent, setPickedRecent] = useState(false)
  const theme = useResolvedTheme()
  const updateSettings = useApiMutation('settings', 'update')

  const query = text.trim()
  const { data: rawHits = [], isFetching } = useApi(
    'search',
    'query',
    { text: query, limit: 60 },
    { enabled: open && query.length > 0, placeholderData: (prev) => (query ? prev : undefined) }
  )
  // A disabled query with the empty key still hands back the previous results: without a query there are none.
  const hits = query ? rawHits : NO_HITS
  const { data: recent = [] } = useApi('search', 'recent', 8, { enabled: open && !query })

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
    // Leaving by a pick: focus must not jump back into the field the palette was opened from (search, editor).
    useUi.setState({ returnFocus: null })
    close()
    navigate(route)
  }

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
      label: theme === 'dark' ? 'Світла тема' : 'Темна тема',
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
    { id: 'trash', label: 'Кошик', icon: <Trash2 />, keywords: ['кошик', 'видалені', 'відновити'], run: () => go('/trash') },
    { id: 'tags', label: 'Мітки', icon: <Tags />, keywords: ['мітки', 'теги'], run: () => go('/tags') },
    {
      id: 'settings',
      label: 'Налаштування, бекап і експорт',
      icon: <Settings />,
      keywords: ['налаштування', 'бекап', 'експорт', 'імпорт', 'журнал', 'оновлення'],
      run: () => go('/settings')
    }
  ]

  const needle = query.toLowerCase()
  const navMatches = query ? ALL_NAV_ITEMS.filter((n) => n.label.toLowerCase().includes(needle)) : ALL_NAV_ITEMS
  const actionMatches = query
    ? actions.filter((a) => a.label.toLowerCase().includes(needle) || a.keywords.some((k) => k.includes(needle)))
    : actions
  // Nothing found: the typed text is most likely a thought worth keeping.
  const offerAdd = !!query && !isFetching && hits.length === 0 && navMatches.length === 0 && actionMatches.length === 0
  // Values in display order. An empty or stale selection falls back to the first visible item: with
  // shouldFilter=false cmdk doesn't select async results itself, and Enter did nothing.
  const values = [
    ...grouped.flatMap(([, list]) => list.map(VALUE.hit)),
    ...(offerAdd ? [VALUE.action('add-idea')] : []),
    ...(!query ? recent.map(VALUE.recent) : []),
    ...navMatches.map((n) => VALUE.nav(n.path)),
    ...actionMatches.map((a) => VALUE.action(a.id))
  ]

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogContent
        showCloseButton={false}
        className="top-[14%] translate-y-0 overflow-hidden rounded-3xl p-0 sm:max-w-[640px]"
        onCloseAutoFocus={restoreFocus}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Пошук усюди</DialogTitle>
          <DialogDescription>Ідеї, сніпети, помилки, клієнти й розділи</DialogDescription>
        </DialogHeader>
        <Command
          shouldFilter={false}
          loop
          value={values.includes(selected) ? selected : (values[0] ?? '')}
          onValueChange={setSelected}
          className="**:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
        >
          <div className="relative">
            <CommandInput
              value={text}
              onValueChange={(v) => {
                setText(v)
                setSelected('')
              }}
              maxLength={SEARCH_LIMITS.text}
              placeholder="Знайти ідею, сніпет, помилку, клієнта…"
            />
            {isFetching && <Spinner className="absolute top-1/2 right-4 -translate-y-1/2 text-muted-foreground" />}
          </div>
          <CommandList className="max-h-[min(60vh,480px)]">
            {/* While the first request is in flight there is no answer yet — only the spinner. */}
            {!isFetching && <CommandEmpty>Нічого не знайшлося. Спробуйте інше слово або його початок.</CommandEmpty>}

            {grouped.map(([type, list]) => {
              const Icon = ENTITY_ICON[type]
              return (
                <CommandGroup key={type} heading={ENTITY_META[type].plural}>
                  {list.map((h, i) => (
                    // New results fade in one after another; results that stay between keystrokes don't re-animate.
                    <CommandItem
                      key={`${h.type}:${h.id}`}
                      value={VALUE.hit(h)}
                      onSelect={() => go(ENTITY_META[h.type].route(h.id))}
                      className="animate-enter"
                      style={{ animationDelay: `${Math.min(i, 8) * 25}ms` }}
                    >
                      <Icon />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{h.title}</div>
                        {h.snippet && (
                          <div className="truncate text-caption text-muted-foreground">
                            <Snippet text={h.snippet} />
                          </div>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )
            })}

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

            {!query && recent.length > 0 && (
              <CommandGroup heading="Нещодавні">
                {recent.map((r) => {
                  const Icon = ENTITY_ICON[r.type]
                  return (
                    <CommandItem key={`${r.type}:${r.id}`} value={VALUE.recent(r)} onSelect={() => go(ENTITY_META[r.type].route(r.id))}>
                      <Icon />
                      <span className="flex-1 truncate">{r.title}</span>
                      <CommandShortcut className="tracking-normal">{fmtRelative(r.updatedAt)}</CommandShortcut>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}

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
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
