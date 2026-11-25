import type { ReactElement } from 'react'
import { FlaskConical, LogOut } from 'lucide-react'
import { isSandbox } from '@/lib/profile'
import { switchConfirmText, useSandbox } from '@/hooks/use-sandbox'
import { Confirm } from '@/components/common/confirm'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useSidebar } from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** Ink action on an ink plate (design-system §6): a light tint, never lime — leaving is not the main action. */
const INK_ACTION = 'bg-ink-foreground/10 text-ink-foreground hover:bg-ink-foreground/15'

/**
 * «Тестовий режим» plate above the update plate (like UpdateBanner): always visible in the sandbox, and «Вийти…»
 * opens the same confirm as the settings section right away. Nothing in the real profile — not even a query.
 */
export function SandboxCard(): ReactElement | null {
  return isSandbox ? <SandboxPlate /> : null
}

function SandboxPlate(): ReactElement {
  const s = useSandbox()
  const { state } = useSidebar()
  const info = s.info.data
  const confirm = switchConfirmText(info)
  // Under `npm run dev` the relaunch can't work: the button still says why (settings → the row's hint).
  const disabled = !info?.canSwitch || s.switching

  const exit = (trigger: ReactElement): ReactElement => (
    <Confirm
      tone="default"
      title={confirm.title}
      description={confirm.description}
      confirmLabel="Перезапустити"
      onConfirm={s.switchProfile}
    >
      {trigger}
    </Confirm>
  )

  if (state === 'collapsed') {
    return (
      <Card className="mx-auto mb-2 grid size-10 place-items-center gap-0 rounded-full bg-ink p-0 text-ink-foreground">
        {/* Confirm's trigger wraps the tooltip's: both Slots land on the one button. */}
        <Tooltip>
          {exit(
            <TooltipTrigger asChild>
              <Button
                variant="subtle"
                size="icon-sm"
                className={INK_ACTION}
                aria-label="Тестовий режим: вийти"
                disabled={disabled}
              >
                <FlaskConical className="text-ink-accent" />
              </Button>
            </TooltipTrigger>
          )}
          <TooltipContent side="right">Тестовий режим · вийти…</TooltipContent>
        </Tooltip>
      </Card>
    )
  }
  return (
    <Card className="mx-2 mb-2 gap-3 rounded-[22px] bg-ink p-3 text-ink-foreground">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink-foreground/10 text-ink-accent">
          <FlaskConical className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-caption font-semibold">Тестовий режим</div>
          <div className="text-meta text-ink-muted">Ваші дані закриті й не змінюються</div>
        </div>
      </div>
      {/* Full width under the text, like UpdateBanner: beside it the title was cut to «Тестовий …». */}
      {exit(
        <Button variant="subtle" size="sm" className={`w-full ${INK_ACTION}`} disabled={disabled}>
          <LogOut /> Вийти…
        </Button>
      )}
    </Card>
  )
}
