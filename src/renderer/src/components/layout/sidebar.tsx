import { useEffect, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router'
import { Archive, ChevronRight, Plus, Search, Settings, Tags, Trash2 } from 'lucide-react'
import type { EntityType } from '@shared/entity-types'
import { GUIDE, HOME, HUBS, REVIEW, hubOf, isAt, type NavHub } from '@/app/navigation'
import { cn } from '@/lib/utils'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useApi } from '@/lib/query'
import { useUi } from '@/stores/ui-store'
import { SegmentBar } from '@/components/common/page'
import { plural } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator
} from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { UpdateBanner } from './update-banner'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Доброї ночі'
  if (h < 12) return 'Доброго ранку'
  if (h < 18) return 'Добрий день'
  return 'Добрий вечір'
}

/** The name is the action alone; the keys are shown in the tooltip, not read out as part of the name. */
function NotchButton({
  label,
  keys,
  onClick,
  children
}: {
  label: string
  keys: string[]
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon" variant="soft" className="bg-card hover:scale-105 hover:bg-card" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-2">
        {label}
        <KbdGroup>
          {keys.map((k) => (
            <Kbd key={k}>{k}</Kbd>
          ))}
        </KbdGroup>
      </TooltipContent>
    </Tooltip>
  )
}

/** Lime identity card with the notch holding quick actions — the app's signature element. */
function IdentityCard() {
  const { data: settings } = useApi('settings', 'get')
  const { data: dash } = useApi('app', 'dashboard')
  const setPaletteOpen = useUi((s) => s.setPaletteOpen)
  const setQuickAddOpen = useUi((s) => s.setQuickAddOpen)
  const cards = dash ? [...dash.today.cards, ...dash.today.overdue] : []
  const done = cards.filter((c) => c.columnIsDone).length
  const name = settings?.userName?.trim()

  return (
    <div className="notch-card bg-lime px-4 pt-4 pb-4 text-lime-foreground">
      <div className="notch">
        <NotchButton label="Знайти всюди" keys={['Ctrl', 'K']} onClick={() => setPaletteOpen(true)}>
          <Search />
        </NotchButton>
        <NotchButton label="Швидко додати" keys={['Ctrl', 'N']} onClick={() => setQuickAddOpen(true)}>
          <Plus />
        </NotchButton>
      </div>
      <div className="flex items-center gap-2 pr-20">
        <Avatar className="size-8">
          <AvatarFallback className="bg-lime-foreground text-body font-semibold text-lime">V</AvatarFallback>
        </Avatar>
        <div className="leading-tight">
          <div className="text-body font-semibold">Vault</div>
          <div className="text-meta opacity-65">{greeting()}</div>
        </div>
      </div>
      <div className="font-display mt-3 truncate text-stat-sm leading-tight">{name || 'Ваша база'}</div>
      <div className="mt-3">
        {/* A bar with nothing to count shows nothing (§7): only the caption, a little lower to keep the height. */}
        {cards.length > 0 && <SegmentBar value={done} total={cards.length} tone="ink" segments={Math.min(cards.length, 8)} />}
        <div className={cn('flex justify-between text-meta opacity-70', cards.length > 0 ? 'mt-1.5' : 'mt-3')}>
          <span>
            {cards.length
              ? `Сьогодні ${done} з ${cards.length} ${plural(cards.length, ['завдання', 'завдань', 'завдань'])}`
              : 'На сьогодні завдань немає'}
          </span>
          {cards.length > 0 && <span>{Math.round((done / cards.length) * 100)}%</span>}
        </div>
      </div>
    </div>
  )
}

function NavCount({ type }: { type?: EntityType }) {
  const { data: dash } = useApi('app', 'dashboard')
  const n = type ? dash?.counts?.[type] : undefined
  if (!n) return null
  return <span className="ml-auto text-meta font-normal text-muted-foreground tabular-nums">{n}</span>
}

/** One collapsible hub (shadcn Collapsible + SidebarMenuSub). */
function HubGroup({ hub, pathname, search }: { hub: NavHub; pathname: string; search: string }) {
  const navigate = useNavigate()
  const open = useUi((s) => s.openHubs[hub.id] ?? false)
  const setHubOpen = useUi((s) => s.setHubOpen)
  const setPlatformDialog = useUi((s) => s.setPlatformDialogOpen)
  const { data: platformList = [] } = useApi('platforms', 'list', undefined, { enabled: !!hub.platforms })
  // Archived platforms are hidden from the menu but must stay reachable (restore lives on /freelance#archived).
  const { data: allPlatforms = [] } = useApi('platforms', 'list', { includeArchived: true }, { enabled: !!hub.platforms })
  const archivedCount = allPlatforms.length - platformList.length
  const activeHub = hubOf(pathname, search) === hub.id
  // Items light up only in the hub that owns the location: cover-letter templates belong to «Пошук роботи»,
  // so «Фриланс → Шаблони» stays dim there although the pathname is the same.
  const matches = (path: string): boolean => activeHub && isAt(path, pathname, search)
  // Only the most specific match is active: on /dev/github, «GitHub» — not «Мої проєкти» (/dev) too.
  const best = [...(hub.items ?? []).map((i) => i.path)]
    .filter(matches)
    .sort((a, b) => b.length - a.length)[0]
  const isActive = (path: string): boolean => (path === best ? true : !best && matches(path))
  // Plain Link + explicit aria-current: NavLink marks by pathname alone, so on cover-letter templates both
  // «Фриланс → Шаблони» and «Пошук роботи → Шаблони листів» were the current page for a screen reader.
  const current = (path: string): 'page' | undefined => (isActive(path) ? 'page' : undefined)

  return (
    <Collapsible open={open} onOpenChange={(o) => setHubOpen(hub.id, o)} asChild>
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={!!hub.overview && pathname === hub.overview}
          className={cn('font-medium', activeHub && !open && 'bg-sidebar-accent')}
          onClick={() => {
            if (hub.overview) navigate(hub.overview)
            setHubOpen(hub.id, hub.overview ? true : !open)
          }}
        >
          {/* On the active (inverted) pill the icon takes the pill's text colour, otherwise it vanished. */}
          <hub.icon
            className={
              hub.overview && pathname === hub.overview ? 'text-current' : activeHub ? 'text-foreground' : 'text-muted-foreground'
            }
          />
          <span>{hub.title}</span>
        </SidebarMenuButton>
        <CollapsibleTrigger asChild>
          <SidebarMenuAction
            className="data-[state=open]:[&>svg]:rotate-90 [&>svg]:transition-transform"
            aria-label={`${open ? 'Згорнути' : 'Розгорнути'} «${hub.title}»`}
          >
            <ChevronRight />
          </SidebarMenuAction>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <SidebarMenuSub className="mr-0 gap-0.5 pr-0">
            {hub.platforms &&
              platformList.map((p) => {
                const path = `/freelance/p/${p.id}`
                return (
                  <SidebarMenuSubItem key={p.id}>
                    <SidebarMenuSubButton asChild isActive={isActive(path)}>
                      <Link to={path} aria-current={current(path)}>
                        <span className="size-2 shrink-0 rounded-full" style={{ background: p.color ?? 'var(--muted-foreground)' }} />
                        <span className="truncate" title={p.name}>
                          {p.name}
                        </span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                )
              })}
            {hub.platforms && (
              <SidebarMenuSubItem>
                <SidebarMenuSubButton asChild>
                  {/* An action, not one more platform: verb label and muted colour over the sub-button's own. */}
                  <button type="button" className="w-full text-muted-foreground!" onClick={() => setPlatformDialog(true)}>
                    <Plus className="text-muted-foreground!" />
                    <span>Додати платформу</span>
                  </button>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            )}
            {hub.platforms && archivedCount > 0 && (
              <SidebarMenuSubItem>
                <SidebarMenuSubButton asChild>
                  {/* A hash on /freelance, not a page of its own: never aria-current. */}
                  <Link to="/freelance#archived" className="text-muted-foreground">
                    <Archive />
                    <span className="truncate">Архів</span>
                    <span className="ml-auto text-meta tabular-nums">{archivedCount}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            )}
            {hub.platforms && <SidebarSeparator className="mx-1 my-1" />}
            {hub.items.map((item) => (
              <SidebarMenuSubItem key={item.path}>
                <SidebarMenuSubButton asChild isActive={isActive(item.path)}>
                  <Link to={item.path} aria-current={current(item.path)}>
                    <item.icon />
                    <span className="truncate">{item.label}</span>
                    <NavCount type={item.countOf} />
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

/** App navigation: shadcn Sidebar with collapsible hubs (one nesting level). */
export function AppSidebar() {
  const { pathname, search } = useLocation()
  const trashBump = useUi((s) => s.trashBump)
  const setHubOpen = useUi((s) => s.setHubOpen)
  const current = hubOf(pathname, search)

  // Opening a page from search/links expands its hub.
  useEffect(() => {
    if (current) setHubOpen(current, true)
  }, [current, setHubOpen])

  return (
    <div className="flex w-(--sidebar-width) shrink-0 flex-col gap-2.5">
      <IdentityCard />
      <Sidebar collapsible="none" className="min-h-0 flex-1 overflow-hidden rounded-3xl">
        <SidebarContent className="gap-0 px-1 py-2 [mask-image:linear-gradient(to_bottom,transparent,black_10px,black_calc(100%-18px),transparent)] [scrollbar-gutter:auto] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <SidebarGroup className="py-1">
            <SidebarMenu className="gap-0.5">
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === '/'}>
                  <NavLink to="/" end>
                    <HOME.icon />
                    <span>{HOME.label}</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname.startsWith('/review')}>
                  <NavLink to={REVIEW.path}>
                    <REVIEW.icon />
                    <span>{REVIEW.label}</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {HUBS.map((hub) => (
                <HubGroup key={hub.id} hub={hub} pathname={pathname} search={search} />
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <UpdateBanner />
        <SidebarFooter className="flex-row gap-1 border-t border-sidebar-border p-2">
          {[
            { to: GUIDE.path, icon: GUIDE.icon, label: GUIDE.label },
            { to: '/tags', icon: Tags, label: 'Мітки' },
            { to: '/trash', icon: Trash2, label: 'Кошик' },
            { to: '/settings', icon: Settings, label: 'Налаштування' }
          ].map((b) => {
            const active = pathname.startsWith(b.to)
            return (
              <Tooltip key={b.to}>
                <TooltipTrigger asChild>
                  {/* Links, not buttons: NavLink marks the current page with aria-current. */}
                  <Button
                    asChild
                    variant={active ? 'soft' : 'ghost'}
                    className={cn('flex-1 hover:text-foreground', active ? 'text-foreground' : 'text-muted-foreground')}
                  >
                    <NavLink to={b.to} aria-label={b.label}>
                      {/* Trash icon replays a short "received" motion each time something is deleted. */}
                      {b.to === '/trash' && trashBump > 0 ? (
                        <b.icon key={trashBump} className="animate-trash-bump text-foreground" />
                      ) : (
                        <b.icon />
                      )}
                    </NavLink>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{b.label}</TooltipContent>
              </Tooltip>
            )
          })}
        </SidebarFooter>
      </Sidebar>
    </div>
  )
}
