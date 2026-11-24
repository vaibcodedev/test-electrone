import type { ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import { Plus, Search, Settings, Tags, Trash2 } from 'lucide-react'
import { NAV } from '@/app/navigation'
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
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem
} from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Доброй ночи'
  if (h < 12) return 'Доброе утро'
  if (h < 18) return 'Добрый день'
  return 'Добрый вечер'
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
        <NotchButton label="Поиск везде · Ctrl K" onClick={() => setPaletteOpen(true)}>
          <Search />
        </NotchButton>
        <NotchButton label="Быстро добавить · Ctrl N" onClick={() => setQuickAddOpen(true)}>
          <Plus />
        </NotchButton>
      </div>
      <div className="flex items-center gap-2 pr-20">
        <Avatar className="size-8">
          <AvatarFallback className="bg-lime-foreground text-[13px] font-semibold text-lime">V</AvatarFallback>
        </Avatar>
        <div className="leading-tight">
          <div className="text-[13px] font-semibold">Vault</div>
          <div className="text-[11px] opacity-65">{greeting()}</div>
        </div>
      </div>
      <div className="font-display mt-3 truncate text-[24px] leading-tight">{name || 'Твоя база'}</div>
      <div className="mt-3">
        <SegmentBar value={done} total={Math.max(cards.length, 1)} tone="ink" segments={5} />
        <div className="mt-1.5 flex justify-between text-[11px] opacity-70">
          <span>
            {cards.length
              ? `Сегодня ${done} из ${cards.length} ${plural(cards.length, ['задачи', 'задач', 'задач'])}`
              : 'На сегодня задач нет'}
          </span>
          {cards.length > 0 && <span>{Math.round((done / cards.length) * 100)}%</span>}
        </div>
      </div>
    </div>
  )
}

/** App navigation built on shadcn Sidebar (non-collapsible, sits under the identity card). */
export function AppSidebar() {
  const { data: dash } = useApi('app', 'dashboard')
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const counts = dash?.counts ?? {}
  const isActive = (path: string): boolean => (path === '/' ? pathname === '/' : pathname.startsWith(path))

  return (
    <div className="flex w-(--sidebar-width) shrink-0 flex-col gap-2.5">
      <IdentityCard />
      <Sidebar collapsible="none" className="min-h-0 flex-1 overflow-hidden rounded-3xl">
        <SidebarContent className="gap-0 px-1 py-2">
          {NAV.map((group) => (
            <SidebarGroup key={group.title} className="py-1">
              <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
              <SidebarMenu className="gap-0.5">
                {group.items.map((item) => {
                  const active = isActive(item.path)
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton asChild isActive={active}>
                        <NavLink to={item.path} end={item.path === '/'}>
                          <item.icon className={active ? 'text-ink-accent' : 'text-muted-foreground'} />
                          <span>{item.label}</span>
                        </NavLink>
                      </SidebarMenuButton>
                      {active ? (
                        <SidebarMenuBadge>
                          <span className="size-1.5 rounded-full bg-ink-accent" />
                        </SidebarMenuBadge>
                      ) : (
                        item.countOf &&
                        !!counts[item.countOf] && (
                          <SidebarMenuBadge className="text-[11px] font-normal text-muted-foreground">
                            {counts[item.countOf]}
                          </SidebarMenuBadge>
                        )
                      )}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter className="flex-row gap-1 border-t border-sidebar-border p-2">
          {[
            { to: '/tags', icon: Tags, label: 'Метки' },
            { to: '/trash', icon: Trash2, label: 'Корзина' },
            { to: '/settings', icon: Settings, label: 'Настройки' }
          ].map((b) => (
            <Tooltip key={b.to}>
              <TooltipTrigger asChild>
                <Button
                  variant={pathname.startsWith(b.to) ? 'soft' : 'ghost'}
                  className="flex-1 text-muted-foreground hover:text-foreground"
                  aria-label={b.label}
                  onClick={() => navigate(b.to)}
                >
                  <b.icon />
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
