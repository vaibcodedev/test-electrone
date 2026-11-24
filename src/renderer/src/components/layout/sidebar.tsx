import { NavLink, useNavigate } from 'react-router'
import { Plus, Search, Settings, Tags, Trash2 } from 'lucide-react'
import { NAV } from '@/app/navigation'
import { useApi } from '@/lib/query'
import { useUi } from '@/stores/ui-store'
import { SegmentBar } from '@/components/common/page'
import { plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Доброй ночи'
  if (h < 12) return 'Доброе утро'
  if (h < 18) return 'Добрый день'
  return 'Добрый вечер'
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
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="grid size-9 place-items-center rounded-full bg-card text-foreground transition-transform hover:scale-105"
              aria-label="Поиск"
            >
              <Search className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Поиск везде · Ctrl K</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setQuickAddOpen(true)}
              className="grid size-9 place-items-center rounded-full bg-card text-foreground transition-transform hover:scale-105"
              aria-label="Быстро добавить"
            >
              <Plus className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Быстро добавить</TooltipContent>
        </Tooltip>
      </div>
      <div className="flex items-center gap-2 pr-20">
        <span className="grid size-8 place-items-center rounded-full bg-ink text-[13px] font-semibold text-lime">V</span>
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

export function Sidebar() {
  const { data: dash } = useApi('app', 'dashboard')
  const navigate = useNavigate()
  const counts = dash?.counts ?? {}
  return (
    <aside className="flex w-[244px] shrink-0 flex-col gap-2.5">
      <IdentityCard />
      <nav className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3">
          {NAV.map((group) => (
            <div key={group.title} className="mb-3">
              <div className="px-3 pb-1.5 text-[11.5px] text-muted-foreground">{group.title}</div>
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      end={item.path === '/'}
                      className={({ isActive }) =>
                        cn(
                          'group flex h-9 items-center gap-2.5 rounded-full px-3 text-[13px] transition-colors',
                          isActive ? 'bg-ink text-ink-foreground' : 'text-foreground/85 hover:bg-surface'
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <item.icon className={cn('size-4', isActive ? 'text-lime' : 'text-muted-foreground')} />
                          <span className="flex-1 truncate">{item.label}</span>
                          {isActive ? (
                            <span className="size-1.5 rounded-full bg-lime" />
                          ) : (
                            item.countOf &&
                            !!counts[item.countOf] && (
                              <span className="text-[11px] text-muted-foreground tabular-nums">{counts[item.countOf]}</span>
                            )
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1 border-t border-border p-2">
          {[
            { to: '/tags', icon: Tags, label: 'Метки' },
            { to: '/trash', icon: Trash2, label: 'Корзина' },
            { to: '/settings', icon: Settings, label: 'Настройки' }
          ].map((b) => (
            <Tooltip key={b.to}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => navigate(b.to)}
                  className="grid h-9 flex-1 place-items-center rounded-full text-muted-foreground hover:bg-surface hover:text-foreground"
                  aria-label={b.label}
                >
                  <b.icon className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{b.label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </nav>
    </aside>
  )
}
