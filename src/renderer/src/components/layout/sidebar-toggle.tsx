import type { ReactElement } from 'react'
import { SIDEBAR_SHORTCUT } from '@/app/shortcuts'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar'
import { sidebarToggleLabel } from '@/components/ui/sidebar-label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Title-bar button over the sidebar column: folds it to a strip of icons and back. The keys are in the
 * tooltip and in aria-keyshortcuts, not in the spoken name. `no-drag`: the title bar moves the window.
 */
export function SidebarToggle(): ReactElement {
  const { state, open } = useSidebar()
  const label = sidebarToggleLabel(state)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <SidebarTrigger
          className="no-drag size-8 text-muted-foreground hover:bg-card hover:text-foreground"
          aria-expanded={open}
          aria-controls="app-sidebar"
          aria-keyshortcuts="Control+B"
        />
      </TooltipTrigger>
      <TooltipContent side="bottom" className="flex items-center gap-2">
        {label}
        <KbdGroup>
          {SIDEBAR_SHORTCUT.keys.map((k) => (
            <Kbd key={k}>{k}</Kbd>
          ))}
        </KbdGroup>
      </TooltipContent>
    </Tooltip>
  )
}
