import { Fragment, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Keyboard, Moon, Plus, Settings, Sun, Trash2 } from 'lucide-react'
import { ENTITY_META, type EntityType } from '@shared/entity-types'
import type { SearchHit } from '@shared/domain/system'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut
} from '@/components/ui/command'
import { Spinner } from '@/components/ui/spinner'
import { useApi, useApiMutation } from '@/lib/query'
import { useUi } from '@/stores/ui-store'
import { useHotkey } from '@/hooks/use-hotkey'
import { ALL_NAV_ITEMS, ENTITY_ICON } from '@/app/navigation'
import { useResolvedTheme } from '@/hooks/use-theme'
import { fmtRelative } from '@/lib/format'

/** Renders FTS snippet with \u0001…\u0002 match markers as <mark>. */
function Snippet({ text }: { text: string }) {
  const parts = text.split(/(\u0001[^\u0002]*\u0002)/g)
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

/** Ctrl+K: one search across every module + navigation + quick actions (shadcn CommandDialog). */
export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen)
  const setOpen = useUi((s) => s.setPaletteOpen)
  const setQuickAddOpen = useUi((s) => s.setQuickAddOpen)
  const setShortcutsOpen = useUi((s) => s.setShortcutsOpen)
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const theme = useResolvedTheme()
  const updateSettings = useApiMutation('settings', 'update')

  useHotkey('mod+k', () => setOpen(!open), { allowInInputs: true })

  const query = text.trim()
  const { data: hits = [], isFetching } = useApi(
    'search',
    'query',
    { text: query, limit: 60 },
    { enabled: open && query.length > 0, placeholderData: (prev) => prev }
  )
  const { data: recent = [] } = useApi('search', 'recent', 8, { enabled: open && !query })

  const grouped = useMemo(() => {
    const map = new Map<EntityType, SearchHit[]>()
    for (const h of hits) map.set(h.type, [...(map.get(h.type) ?? []), h])
    return [...map.entries()]
  }, [hits])

  const close = (): void => {
    setOpen(false)
    setText('')
  }
  const go = (route: string): void => {
    close()
    navigate(route)
  }

  const navMatches = query
    ? ALL_NAV_ITEMS.filter((n) => n.label.toLowerCase().includes(query.toLowerCase()))
    : ALL_NAV_ITEMS

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => (o ? setOpen(true) : close())}
      title="Пошук усюди"
      description="Ідеї, сніпети, помилки, клієнти й розділи"
      showCloseButton={false}
      className="top-[14%] translate-y-0 rounded-3xl sm:max-w-[640px]"
      commandProps={{ shouldFilter: false, loop: true }}
    >
      <div className="relative">
        <CommandInput value={text} onValueChange={setText} placeholder="Знайти ідею, сніпет, помилку, клієнта…" />
        {isFetching && <Spinner className="absolute top-1/2 right-4 -translate-y-1/2 text-muted-foreground" />}
      </div>
      <CommandList className="max-h-[min(60vh,480px)]">
        <CommandEmpty>Нічого не знайшлося. Спробуйте інше слово або його початок.</CommandEmpty>

        {grouped.map(([type, list]) => {
          const Icon = ENTITY_ICON[type]
          return (
            <CommandGroup key={type} heading={ENTITY_META[type].plural}>
              {list.map((h, i) => (
                // New results fade in one after another; results that stay between keystrokes don't re-animate.
                <CommandItem
                  key={`${h.type}:${h.id}`}
                  value={`${h.type}:${h.id}`}
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

        {!query && recent.length > 0 && (
          <CommandGroup heading="Нещодавні">
            {recent.map((r) => {
              const Icon = ENTITY_ICON[r.type]
              return (
                <CommandItem key={`${r.type}:${r.id}`} value={`recent:${r.type}:${r.id}`} onSelect={() => go(ENTITY_META[r.type].route(r.id))}>
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
              <CommandItem key={n.path} value={`nav:${n.path}`} onSelect={() => go(n.path)}>
                <n.icon />
                {n.label}
                {i < 9 && !query && <CommandShortcut>Alt {i + 1}</CommandShortcut>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!query && (
          <CommandGroup heading="Дії">
            <CommandItem
              value="action:quick-add"
              onSelect={() => {
                close()
                setQuickAddOpen(true)
              }}
            >
              <Plus /> Швидко додати
              <CommandShortcut>Ctrl N</CommandShortcut>
            </CommandItem>
            <CommandItem value="action:theme" onSelect={() => updateSettings.mutate({ theme: theme === 'dark' ? 'light' : 'dark' })}>
              {theme === 'dark' ? <Sun /> : <Moon />}
              {theme === 'dark' ? 'Світла тема' : 'Темна тема'}
            </CommandItem>
            <CommandItem
              value="action:shortcuts"
              onSelect={() => {
                close()
                setShortcutsOpen(true)
              }}
            >
              <Keyboard /> Гарячі клавіші
              <CommandShortcut>Ctrl /</CommandShortcut>
            </CommandItem>
            <CommandItem value="action:trash" onSelect={() => go('/trash')}>
              <Trash2 /> Кошик
            </CommandItem>
            <CommandItem value="action:settings" onSelect={() => go('/settings')}>
              <Settings /> Налаштування, бекап і експорт
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}
