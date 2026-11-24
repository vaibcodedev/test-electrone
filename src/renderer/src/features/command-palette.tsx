import { Fragment, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Moon, Plus, Settings, Sun, Trash2 } from 'lucide-react'
import { Command as Cmdk } from 'cmdk'
import { ENTITY_META, type EntityType } from '@shared/entity-types'
import type { SearchHit } from '@shared/domain/system'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useApi, useApiMutation } from '@/lib/query'
import { useUi } from '@/stores/ui-store'
import { useHotkey } from '@/hooks/use-hotkey'
import { ALL_NAV_ITEMS, ENTITY_ICON } from '@/app/navigation'
import { Kbd } from '@/components/common/page'
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

const itemCls =
  'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-[13px] data-[selected=true]:bg-surface aria-selected:bg-surface'
const groupCls =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11.5px] [&_[cmdk-group-heading]]:text-muted-foreground'

/** Ctrl+K: one search across every module + navigation + quick actions. */
export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen)
  const setOpen = useUi((s) => s.setPaletteOpen)
  const setQuickAddOpen = useUi((s) => s.setQuickAddOpen)
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const theme = useResolvedTheme()
  const updateSettings = useApiMutation('settings', 'update')

  useHotkey('mod+k', () => setOpen(!open), { allowInInputs: true })

  const query = text.trim()
  const { data: hits = [], isFetching } = useApi('search', 'query', { text: query, limit: 60 }, { enabled: open && query.length > 0, placeholderData: (prev) => prev })
  const { data: recent = [] } = useApi('search', 'recent', 8, { enabled: open && !query })

  const grouped = useMemo(() => {
    const map = new Map<EntityType, SearchHit[]>()
    for (const h of hits) map.set(h.type, [...(map.get(h.type) ?? []), h])
    return [...map.entries()]
  }, [hits])

  const go = (route: string): void => {
    setOpen(false)
    setText('')
    navigate(route)
  }

  const navMatches = query
    ? ALL_NAV_ITEMS.filter((n) => n.label.toLowerCase().includes(query.toLowerCase()))
    : ALL_NAV_ITEMS

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setText('')
      }}
    >
      <DialogContent className="top-[14%] sm:max-w-[640px] translate-y-0 gap-0 overflow-hidden rounded-3xl p-0" showCloseButton={false}>
        <DialogTitle className="sr-only">Поиск</DialogTitle>
        <Cmdk shouldFilter={false} loop className="flex max-h-[min(70vh,560px)] flex-col">
          <div className="flex items-center gap-3 border-b border-border px-5">
            <Cmdk.Input
              value={text}
              onValueChange={setText}
              autoFocus
              placeholder="Найти идею, сниппет, ошибку, клиента…"
              className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
            />
            {isFetching && <span className="size-1.5 animate-pulse rounded-full bg-lime" />}
            <Kbd>Esc</Kbd>
          </div>
          <Cmdk.List className="min-h-0 flex-1 overflow-y-auto p-2">
            <Cmdk.Empty className="py-10 text-center text-[13px] text-muted-foreground">
              Ничего не нашлось. Попробуйте другое слово или начало слова.
            </Cmdk.Empty>

            {grouped.map(([type, list]) => {
              const Icon = ENTITY_ICON[type]
              return (
                <Cmdk.Group key={type} heading={ENTITY_META[type].plural} className={groupCls}>
                  {list.map((h) => (
                    <Cmdk.Item
                      key={`${h.type}:${h.id}`}
                      value={`${h.type}:${h.id}`}
                      onSelect={() => go(ENTITY_META[h.type].route(h.id))}
                      className={itemCls}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{h.title}</span>
                        {h.snippet && (
                          <span className="block truncate text-[12px] text-muted-foreground">
                            <Snippet text={h.snippet} />
                          </span>
                        )}
                      </span>
                    </Cmdk.Item>
                  ))}
                </Cmdk.Group>
              )
            })}

            {!query && recent.length > 0 && (
              <Cmdk.Group heading="Недавние" className={groupCls}>
                {recent.map((r) => {
                  const Icon = ENTITY_ICON[r.type]
                  return (
                    <Cmdk.Item
                      key={`${r.type}:${r.id}`}
                      value={`recent:${r.type}:${r.id}`}
                      onSelect={() => go(ENTITY_META[r.type].route(r.id))}
                      className={itemCls}
                    >
                      <Icon className="size-4 text-muted-foreground" />
                      <span className="flex-1 truncate">{r.title}</span>
                      <span className="text-[11.5px] text-muted-foreground">{fmtRelative(r.updatedAt)}</span>
                    </Cmdk.Item>
                  )
                })}
              </Cmdk.Group>
            )}

            {navMatches.length > 0 && (
              <Cmdk.Group heading="Разделы" className={groupCls}>
                {navMatches.map((n) => (
                  <Cmdk.Item key={n.path} value={`nav:${n.path}`} onSelect={() => go(n.path)} className={itemCls}>
                    <n.icon className="size-4 text-muted-foreground" />
                    {n.label}
                  </Cmdk.Item>
                ))}
              </Cmdk.Group>
            )}

            {!query && (
              <Cmdk.Group heading="Действия" className={groupCls}>
                <Cmdk.Item
                  value="action:quick-add"
                  className={itemCls}
                  onSelect={() => {
                    setOpen(false)
                    setQuickAddOpen(true)
                  }}
                >
                  <Plus className="size-4 text-muted-foreground" /> Быстро добавить…
                </Cmdk.Item>
                <Cmdk.Item
                  value="action:theme"
                  className={itemCls}
                  onSelect={() => updateSettings.mutate({ theme: theme === 'dark' ? 'light' : 'dark' })}
                >
                  {theme === 'dark' ? <Sun className="size-4 text-muted-foreground" /> : <Moon className="size-4 text-muted-foreground" />}
                  {theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
                </Cmdk.Item>
                <Cmdk.Item value="action:trash" className={itemCls} onSelect={() => go('/trash')}>
                  <Trash2 className="size-4 text-muted-foreground" /> Корзина
                </Cmdk.Item>
                <Cmdk.Item value="action:settings" className={itemCls} onSelect={() => go('/settings')}>
                  <Settings className="size-4 text-muted-foreground" /> Настройки, бэкап и экспорт
                </Cmdk.Item>
              </Cmdk.Group>
            )}
          </Cmdk.List>
        </Cmdk>
      </DialogContent>
    </Dialog>
  )
}
