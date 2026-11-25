import { useRef, useState, type ReactElement } from 'react'
import { Link, useNavigate } from 'react-router'
import { Archive, ChevronRight, Plus } from 'lucide-react'
import type { EntityType } from '@shared/entity-types'
import type { NavHub } from '@/app/navigation'
import { cn } from '@/lib/utils'
import { useApi } from '@/lib/query'
import { useUi } from '@/stores/ui-store'
import { presenceProps, usePresenceList } from '@/hooks/use-presence-list'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator
} from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { NavHideMenu } from './nav-hide-menu'
import { useHubNav } from './use-hub-nav'

export function NavCount({ type }: { type?: EntityType }): ReactElement | null {
  const { data: dash } = useApi('app', 'dashboard')
  const n = type ? dash?.counts?.[type] : undefined
  if (!n) return null
  return (
    <span className="ml-auto text-meta font-normal text-muted-foreground tabular-nums">{n}</span>
  )
}

interface HubProps {
  /** The hub with its shown items only (useNavVisibility). */
  hub: NavHub
  pathname: string
  search: string
}

const itemKey = (item: NavHub['items'][number]): string => item.path

/** The hub's `<li>` folds away when the hub is hidden in «Налаштування → Меню» (usePresenceList). */
type HubGroupProps = HubProps & { presence?: ReturnType<typeof presenceProps> }

/** Hub icon: on the active (inverted) pill it takes the pill's text colour, otherwise it vanished. */
function HubIcon({
  hub,
  atOverview,
  activeHub
}: {
  hub: NavHub
  atOverview: boolean
  activeHub: boolean
}): ReactElement {
  return (
    <hub.icon
      className={
        atOverview ? 'text-current' : activeHub ? 'text-foreground' : 'text-muted-foreground'
      }
    />
  )
}

/** Expanded sidebar: one collapsible hub (shadcn Collapsible + SidebarMenuSub). */
export function HubGroup({ hub, pathname, search, presence }: HubGroupProps): ReactElement {
  const navigate = useNavigate()
  const open = useUi((s) => s.openHubs[hub.id] ?? false)
  const setHubOpen = useUi((s) => s.setHubOpen)
  const setPlatformDialog = useUi((s) => s.setPlatformDialogOpen)
  const { activeHub, atOverview, isActive, current, platforms, archivedCount } = useHubNav(
    hub,
    pathname,
    search
  )
  // Sections switched off in «Меню» fold away instead of vanishing.
  const items = usePresenceList(hub.items, itemKey)
  const hubClass = cn('font-medium', activeHub && !open && 'bg-sidebar-accent')
  const title = (
    <>
      <HubIcon hub={hub} atOverview={atOverview} activeHub={activeHub} />
      <span>{hub.title}</span>
    </>
  )

  return (
    <Collapsible open={open} onOpenChange={(o) => setHubOpen(hub.id, o)} asChild>
      <SidebarMenuItem {...presence}>
        {hub.overview ? (
          <>
            <NavHideMenu place={{ hub: hub.id }} label={hub.title}>
              <SidebarMenuButton
                isActive={atOverview}
                aria-current={atOverview ? 'page' : undefined}
                className={hubClass}
                data-nav-hub={hub.id}
                onClick={() => {
                  navigate(hub.overview!)
                  setHubOpen(hub.id, true)
                }}
              >
                {title}
              </SidebarMenuButton>
            </NavHideMenu>
            <CollapsibleTrigger asChild>
              <SidebarMenuAction
                className="data-[state=open]:[&>svg]:rotate-90 [&>svg]:transition-transform"
                aria-label={`${open ? 'Згорнути' : 'Розгорнути'} «${hub.title}»`}
              >
                <ChevronRight />
              </SidebarMenuAction>
            </CollapsibleTrigger>
          </>
        ) : (
          <>
            {/* No overview: the title itself folds the hub (aria-expanded from Radix), one Tab stop instead of
                two doing the same; the chevron only shows the state. */}
            <NavHideMenu place={{ hub: hub.id }} label={hub.title}>
              <CollapsibleTrigger asChild>
                <SidebarMenuButton className={hubClass} data-nav-hub={hub.id}>
                  {title}
                </SidebarMenuButton>
              </CollapsibleTrigger>
            </NavHideMenu>
            <SidebarMenuAction
              asChild
              aria-hidden
              data-state={open ? 'open' : 'closed'}
              className="pointer-events-none data-[state=open]:[&>svg]:rotate-90 [&>svg]:transition-transform"
            >
              <span>
                <ChevronRight />
              </span>
            </SidebarMenuAction>
          </>
        )}
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <SidebarMenuSub className="mr-0 gap-0.5 pr-0">
            {hub.platforms &&
              platforms.map((p) => {
                const path = `/freelance/p/${p.id}`
                return (
                  <SidebarMenuSubItem key={p.id}>
                    <SidebarMenuSubButton asChild isActive={isActive(path)}>
                      <Link to={path} aria-current={current(path)}>
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ background: p.color ?? 'var(--muted-foreground)' }}
                        />
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
                  <button
                    type="button"
                    className="w-full text-muted-foreground!"
                    onClick={() => setPlatformDialog(true)}
                  >
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
            {items.map((entry) => {
              const item = entry.item
              return (
                <SidebarMenuSubItem key={entry.key} {...presenceProps(entry)}>
                  <NavHideMenu place={{ item: item.path }} label={item.label}>
                    <SidebarMenuSubButton asChild isActive={isActive(item.path)}>
                      <Link to={item.path} aria-current={current(item.path)}>
                        <item.icon />
                        <span className="truncate">{item.label}</span>
                        <NavCount type={item.countOf} />
                      </Link>
                    </SidebarMenuSubButton>
                  </NavHideMenu>
                </SidebarMenuSubItem>
              )
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

/**
 * Folded sidebar: the hub is an icon; click, Enter, Space or ↓ opens its sections in a menu to the right
 * (shadcn sidebar-07). Radix lets the tooltip's slot props override the menu trigger's `data-state`, so
 * «menu open» is styled and tested by `aria-expanded`, never by `data-state` of this button.
 */
export function HubFlyout({ hub, pathname, search }: HubProps): ReactElement {
  const setPlatformDialog = useUi((s) => s.setPlatformDialogOpen)
  const { activeHub, atOverview, current, platforms, archivedCount } = useHubNav(
    hub,
    pathname,
    search
  )
  const [menu, setMenu] = useState(false)
  const [tip, setTip] = useState(false)
  // Focus coming back from the menu must not pop the tooltip up over the button.
  const muteTip = useRef(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const hasHead = !!hub.overview || !!hub.platforms

  return (
    <SidebarMenuItem>
      {/* Not modal: «Додати платформу» opens a dialog right from the menu, and a modal menu closing under it
          could leave <body> with pointer-events: none. */}
      {/* Opening the menu drops the tooltip: Enter on the trigger is preventDefault-ed, so the tooltip that
          focus opened never gets its close and would pop back once the menu closes. */}
      <DropdownMenu
        open={menu}
        onOpenChange={(o) => {
          setMenu(o)
          if (o) setTip(false)
        }}
        modal={false}
      >
        <Tooltip open={tip && !menu} onOpenChange={(o) => setTip(o && !muteTip.current)}>
          <TooltipTrigger asChild>
            <NavHideMenu place={{ hub: hub.id }} label={hub.title}>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  ref={triggerRef}
                  isActive={activeHub}
                  data-nav-hub={hub.id}
                  className="font-medium aria-expanded:bg-sidebar-accent"
                >
                  <hub.icon className={activeHub ? 'text-current' : 'text-muted-foreground'} />
                  <span>{hub.title}</span>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
            </NavHideMenu>
          </TooltipTrigger>
          <TooltipContent side="right">{hub.title}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          side="right"
          align="start"
          sideOffset={14}
          collisionPadding={8}
          className="w-64"
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            setTip(false)
            muteTip.current = true
            triggerRef.current?.focus()
            muteTip.current = false
          }}
        >
          <DropdownMenuLabel className="text-caption font-semibold text-foreground">
            {hub.title}
          </DropdownMenuLabel>
          {hub.overview && (
            <DropdownMenuItem asChild>
              <Link to={hub.overview} aria-current={atOverview ? 'page' : undefined}>
                <hub.icon />
                Огляд
              </Link>
            </DropdownMenuItem>
          )}
          {hub.platforms &&
            platforms.map((p) => {
              const path = `/freelance/p/${p.id}`
              return (
                <DropdownMenuItem key={p.id} asChild>
                  <Link to={path} aria-current={current(path)}>
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: p.color ?? 'var(--muted-foreground)' }}
                    />
                    <span className="truncate" title={p.name}>
                      {p.name}
                    </span>
                  </Link>
                </DropdownMenuItem>
              )
            })}
          {hub.platforms && (
            <DropdownMenuItem
              className="text-muted-foreground"
              onSelect={() => setPlatformDialog(true)}
            >
              <Plus />
              Додати платформу
            </DropdownMenuItem>
          )}
          {hub.platforms && archivedCount > 0 && (
            <DropdownMenuItem asChild className="text-muted-foreground">
              <Link to="/freelance#archived">
                <Archive />
                <span className="truncate">Архів</span>
                <span className="ml-auto text-meta tabular-nums">{archivedCount}</span>
              </Link>
            </DropdownMenuItem>
          )}
          {hasHead && <DropdownMenuSeparator />}
          {hub.items.map((item) => (
            <DropdownMenuItem key={item.path} asChild>
              <Link to={item.path} aria-current={current(item.path)}>
                <item.icon />
                <span className="truncate">{item.label}</span>
                <NavCount type={item.countOf} />
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  )
}
