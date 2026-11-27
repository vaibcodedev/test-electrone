import { useEffect, type ReactElement } from 'react'
import { NavLink, useLocation } from 'react-router'
import { Settings, Tags, Trash2 } from 'lucide-react'
import { GUIDE, HOME, hubOf, isAt, type NavItem } from '@/app/navigation'
import { cn } from '@/lib/utils'
import { useUi } from '@/stores/ui-store'
import { useNavVisibility } from '@/hooks/use-nav-visibility'
import { presenceProps, usePresenceList } from '@/hooks/use-presence-list'
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar
} from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { NavHideMenu } from './nav-hide-menu'
import { HubFlyout, HubGroup } from './sidebar-hub'
import { SidebarIdentity } from './sidebar-identity'
import { UpdateBanner } from './update-banner'
import { SandboxCard } from './sandbox-card'

const topKey = (item: NavItem): string => item.path
const hubKey = (hub: { id: string }): string => hub.id

const FOOTER = [
  { to: GUIDE.path, icon: GUIDE.icon, label: GUIDE.label },
  { to: '/tags', icon: Tags, label: 'Мітки' },
  { to: '/trash', icon: Trash2, label: 'Кошик' },
  { to: '/settings', icon: Settings, label: 'Налаштування' }
]

/**
 * App navigation: shadcn Sidebar with collapsible hubs (one nesting level), or — folded with Ctrl+B — a 56 px
 * strip of icons with flyout menus. The state attributes sit on this column, not on `Sidebar
 * collapsible="icon"` (that one is a fixed, full-window-height container). The column is an unnamed `.group`:
 * shadcn's `group-data-[collapsible=icon]:` classes read it, so anything inside uses named groups only.
 * Sections switched off in «Налаштування → Меню» are not rendered (useNavVisibility); on the switch they fold
 * away (usePresenceList), so the eye follows what moved.
 */
export function AppSidebar(): ReactElement {
  const { pathname, search } = useLocation()
  const { state } = useSidebar()
  const collapsed = state === 'collapsed'
  const trashBump = useUi((s) => s.trashBump)
  const setHubOpen = useUi((s) => s.setHubOpen)
  const { hubs, topItems } = useNavVisibility()
  const current = hubOf(pathname, search)
  const hubEntries = usePresenceList(hubs, hubKey)
  const top = usePresenceList(topItems, topKey)

  // Opening a page from search/links expands its hub.
  useEffect(() => {
    if (current) setHubOpen(current, true)
  }, [current, setHubOpen])

  return (
    <div
      id="app-sidebar"
      data-slot="app-sidebar"
      data-state={state}
      data-collapsible={collapsed ? 'icon' : ''}
      data-side="left"
      className="group flex w-(--sidebar-width) shrink-0 flex-col gap-2.5 data-[collapsible=icon]:w-(--sidebar-width-icon)"
    >
      <SidebarIdentity />
      <Sidebar collapsible="none" className="min-h-0 w-full flex-1 overflow-hidden rounded-3xl">
        <SidebarContent className="gap-0 px-1 py-2 mask-[linear-gradient(to_bottom,transparent,black_10px,black_calc(100%-18px),transparent)] scrollbar-gutter-auto scrollbar-none group-data-[collapsible=icon]:overflow-y-auto group-data-[collapsible=icon]:py-1 [&::-webkit-scrollbar]:hidden">
          <SidebarGroup className="py-1">
            <SidebarMenu className="gap-0.5">
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === '/'} tooltip={HOME.label}>
                  <NavLink to="/" end data-nav-home="">
                    <HOME.icon />
                    <span>{HOME.label}</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {top.map((entry) => (
                <SidebarMenuItem key={entry.key} {...presenceProps(entry)}>
                  <NavHideMenu place={{ item: entry.item.path }} label={entry.item.label}>
                    <SidebarMenuButton
                      asChild
                      isActive={isAt(entry.item.path, pathname)}
                      tooltip={entry.item.label}
                    >
                      <NavLink to={entry.item.path}>
                        <entry.item.icon />
                        <span>{entry.item.label}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </NavHideMenu>
                </SidebarMenuItem>
              ))}
              {hubEntries.map(({ item: hub, ...entry }) =>
                collapsed ? (
                  entry.leaving ? null : (
                    <HubFlyout key={hub.id} hub={hub} pathname={pathname} search={search} />
                  )
                ) : (
                  <HubGroup
                    key={hub.id}
                    hub={hub}
                    pathname={pathname}
                    search={search}
                    presence={presenceProps({ ...entry, item: hub })}
                  />
                )
              )}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SandboxCard />
        <UpdateBanner />
        <SidebarFooter className="flex-row gap-1 border-t border-sidebar-border p-2 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center">
          {FOOTER.map((b) => {
            const active = pathname.startsWith(b.to)
            return (
              <Tooltip key={b.to}>
                <TooltipTrigger asChild>
                  {/* Links, not buttons: NavLink marks the current page with aria-current. */}
                  <Button
                    asChild
                    variant={active ? 'soft' : 'ghost'}
                    className={cn(
                      'flex-1 hover:text-foreground group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:flex-none',
                      active ? 'text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    <NavLink to={b.to} aria-label={b.label}>
                      {/* Trash icon replays a short "received" motion each time something is deleted. */}
                      {b.to === '/trash' && trashBump > 0 ? (
                        <b.icon key={trashBump} className="animate-trash-bump" />
                      ) : (
                        <b.icon />
                      )}
                    </NavLink>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side={collapsed ? 'right' : 'top'}>{b.label}</TooltipContent>
              </Tooltip>
            )
          })}
        </SidebarFooter>
      </Sidebar>
    </div>
  )
}
