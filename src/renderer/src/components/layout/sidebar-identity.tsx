import type { ReactElement, ReactNode } from 'react'
import { Plus, Search } from 'lucide-react'
import { useUi } from '@/stores/ui-store'
import { SegmentBar } from '@/components/common/page'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { useSidebar } from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { todayLabel, useTodayProgress } from './use-today-progress'

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
  side,
  children
}: {
  label: string
  keys: string[]
  onClick: () => void
  side?: 'top' | 'right'
  children: ReactNode
}): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="soft"
          className="bg-card hover:scale-105 hover:bg-card"
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={side} className="flex items-center gap-2">
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

function VaultAvatar(): ReactElement {
  return (
    <Avatar className="size-8" aria-hidden>
      <AvatarFallback className="bg-lime-foreground text-body font-semibold text-lime">
        V
      </AvatarFallback>
    </Avatar>
  )
}

/** Lime identity card with the notch holding quick actions — the app's signature element. */
function IdentityCard(): ReactElement {
  const { done, total, name } = useTodayProgress()
  const setPaletteOpen = useUi((s) => s.setPaletteOpen)
  const setQuickAddOpen = useUi((s) => s.setQuickAddOpen)

  return (
    <div className="notch-card bg-lime px-4 pt-4 pb-4 text-lime-foreground">
      <div className="notch">
        <NotchButton label="Знайти всюди" keys={['Ctrl', 'K']} onClick={() => setPaletteOpen(true)}>
          <Search />
        </NotchButton>
        <NotchButton
          label="Швидко додати"
          keys={['Ctrl', 'N']}
          onClick={() => setQuickAddOpen(true)}
        >
          <Plus />
        </NotchButton>
      </div>
      <div className="flex items-center gap-2 pr-20">
        <VaultAvatar />
        <div className="leading-tight">
          <div className="text-body font-semibold">Vault</div>
          <div className="text-meta opacity-65">{greeting()}</div>
        </div>
      </div>
      <div className="font-display mt-3 truncate text-stat-sm leading-tight">
        {name || 'Ваша база'}
      </div>
      <div className="mt-3">
        {/* A bar with nothing to count shows nothing (§7). An empty stub of the bar's height keeps the card as tall,
            so the whole sidebar doesn't shift when the first task appears or the last one goes. */}
        {total > 0 ? (
          <SegmentBar value={done} total={total} tone="ink" segments={Math.min(total, 8)} />
        ) : (
          <div className="h-1.5" aria-hidden />
        )}
        <div className="mt-1.5 flex justify-between text-meta opacity-70">
          <span>{todayLabel(done, total)}</span>
          {total > 0 && <span>{Math.round((done / total) * 100)}%</span>}
        </div>
      </div>
    </div>
  )
}

/**
 * Folded sidebar: the lime card shrinks to a tile — «V», today's «done/total» and «Швидко додати».
 * «Знайти всюди» stays in the title bar; the strip needs the height for icons.
 */
function IdentityTile(): ReactElement {
  const { done, total } = useTodayProgress()
  const setQuickAddOpen = useUi((s) => s.setQuickAddOpen)
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl bg-lime px-1 py-3 text-lime-foreground">
      <VaultAvatar />
      {/* Same height with or without tasks: the icons below don't jump when the first task appears. */}
      <span className="h-4 text-meta leading-4 font-semibold tabular-nums" aria-hidden>
        {total > 0 ? `${done}/${total}` : ''}
      </span>
      <span className="sr-only">{todayLabel(done, total)}</span>
      <NotchButton
        label="Швидко додати"
        keys={['Ctrl', 'N']}
        side="right"
        onClick={() => setQuickAddOpen(true)}
      >
        <Plus />
      </NotchButton>
    </div>
  )
}

/** The top of the sidebar: the lime card, or its tile when the sidebar is folded. */
export function SidebarIdentity(): ReactElement {
  const { state } = useSidebar()
  return state === 'collapsed' ? <IdentityTile /> : <IdentityCard />
}
