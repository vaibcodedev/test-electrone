import { useEffect, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import { Archive, ChevronRight, Plus, Search, Settings, Tags, Trash2 } from 'lucide-react'
import type { EntityType } from '@shared/entity-types'
import { GUIDE, HOME, HUBS, REVIEW, hubOf, type NavHub } from '@/app/navigation'
import { cn } from '@/lib/utils'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useApi } from '@/lib/query'
import { useUi } from '@/stores/ui-store'
import { SegmentBar } from '@/components/common/page'
import { plural } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Доброї ночі'
  if (h < 12) return 'Доброго ранку'
  if (h < 18) return 'Добрий день'
  return 'Добрий вечір'
}

function NotchButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon" variant="soft" className="bg-card hover:scale-105 hover:bg-card" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
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
        <NotchButton label="Пошук усюди · Ctrl K" onClick={() => setPaletteOpen(true)}>
          <Search />
        </NotchButton>
        <NotchButton label="Швидко додати · Ctrl N" onClick={() => setQuickAddOpen(true)}>
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
      <div className="font-display mt-3 truncate text-[24px] leading-tight">{name || 'Твоя база'}</div>
      <div className="mt-3">
        <SegmentBar value={done} total={Math.max(cards.length, 1)} tone="ink" segments={5} />
        <div className="mt-1.5 flex justify-between text-meta opacity-70">
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
function HubGroup({ hub, pathname }: { hub: NavHub; pathname: string }) {
  const navigate = useNavigate()
  const open = useUi((s) => s.openHubs[hub.id] ?? false)
  const setHubOpen = useUi((s) => s.setHubOpen)
  const setPlatformDialog = useUi((s) => s.setPlatformDialogOpen)
  const { data: platformList = [] } = useApi('platforms', 'list', undefined, { enabled: !!hub.platforms })
  // Archived platforms are hidden from the menu but must stay reachable (restore lives on /freelance#archived).
  const { data: allPlatforms = [] } = useApi('platforms', 'list', { includeArchived: true }, { enabled: !!hub.platforms })
  const archivedCount = allPlatforms.length - platformList.length
  const activeHub = hubOf(pathname) === hub.id
  const isActive = (path: string): boolean => pathname === path || pathname.startsWith(path + '/')

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
            className="peer-data-[active=true]/menu-button:text-sidebar-primary-foreground data-[state=open]:[&>svg]:rotate-90 [&>svg]:transition-transform"
            aria-label={open ? 'Згорнути' : 'Розгорнути'}
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
                      <NavLink to={path}>
                        <span className="size-2 shrink-0 rounded-full" style={{ background: p.color ?? 'var(--muted-foreground)' }} />
                        <span className="truncate">{p.name}</span>
                      </NavLink>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                )
              })}
            {hub.platforms && (
              <SidebarMenuSubItem>
                <SidebarMenuSubButton asChild>
                  <button type="button" className="w-full text-muted-foreground" onClick={() => setPlatformDialog(true)}>
                    <Plus />
                    <span>Платформа</span>
                  </button>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            )}
            {hub.platforms && archivedCount > 0 && (
              <SidebarMenuSubItem>
                <SidebarMenuSubButton asChild>
                  <NavLink to="/freelance#archived" className="text-muted-foreground">
                    <Archive />
                    <span className="truncate">Архів</span>
                    <span className="ml-auto text-meta tabular-nums">{archivedCount}</span>
                  </NavLink>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            )}
            {hub.platforms && <SidebarSeparator className="mx-1 my-1" />}
            {hub.items.map((item) => (
              <SidebarMenuSubItem key={item.path}>
                <SidebarMenuSubButton asChild isActive={isActive(item.path)}>
                  <NavLink to={item.path}>
                    <item.icon />
                    <span className="truncate">{item.label}</span>
                    <NavCount type={item.countOf} />
                  </NavLink>
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
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const trashBump = useUi((s) => s.trashBump)
  const setHubOpen = useUi((s) => s.setHubOpen)
  const current = hubOf(pathname)

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
                <HubGroup key={hub.id} hub={hub} pathname={pathname} />
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="flex-row gap-1 border-t border-sidebar-border p-2">
          {[
            { to: GUIDE.path, icon: GUIDE.icon, label: GUIDE.label },
            { to: '/tags', icon: Tags, label: 'Мітки' },
            { to: '/trash', icon: Trash2, label: 'Кошик' },
            { to: '/settings', icon: Settings, label: 'Налаштування' }
          ].map((b) => (
            <Tooltip key={b.to}>
              <TooltipTrigger asChild>
                <Button
                  variant={pathname.startsWith(b.to) ? 'soft' : 'ghost'}
                  className="flex-1 text-muted-foreground hover:text-foreground"
                  aria-label={b.label}
                  onClick={() => navigate(b.to)}
                >
                  {/* Trash icon replays a short "received" motion each time something is deleted. */}
                  {b.to === '/trash' && trashBump > 0 ? (
                    <b.icon key={trashBump} className="animate-trash-bump text-foreground" />
                  ) : (
                    <b.icon />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{b.label}</TooltipContent>
            </Tooltip>
          ))}
        </SidebarFooter>
      </Sidebar>
    </div>
  )
}
