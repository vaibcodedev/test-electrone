import { useState, type ReactElement } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, LayoutGrid, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { AllMoodboardsDialog } from './all-moodboards-dialog'
import { MoodboardTile, MoreMoodboardsTile } from './shared'
import { useMoodboardStrip, useNewMoodboard, useStripCollapsed } from './use-moodboards'
import { useScrollRow } from './use-scroll-row'

/** One line of the header area: the same 32 px in every state, so the gallery doesn't jump under it. */
const LINE = 'flex h-8 min-w-0 items-center gap-2'

/**
 * The row of moodboards over the design gallery. No boards yet — one line with «Нова добірка» (it used to be a
 * lone dashed pill hanging over the filters). Otherwise a header (collapse, arrows, «Усі добірки», «Нова
 * добірка») over a row of tiles that scrolls by pages without a scrollbar; collapsed — the header only.
 * Gallery filters don't touch it. Hidden entirely when there are neither boards nor designs (the gallery's
 * own empty state says what to do).
 */
export function MoodboardStrip({ galleryEmpty }: { galleryEmpty: boolean }): ReactElement | null {
  const { boards, total, isLoading, isError, retry } = useMoodboardStrip()
  const newBoard = useNewMoodboard()
  const [collapsed, setCollapsed] = useStripCollapsed()
  const [allOpen, setAllOpen] = useState(false)
  const { scroller, track, canPrev, canNext, scrollPage, onKeyDown } = useScrollRow()

  if (isError)
    return (
      // A failed load isn't «no boards»: offering «Нова добірка» here would invite duplicates.
      <div className={LINE}>
        <span className="truncate text-caption text-muted-foreground">
          Не вдалося завантажити добірки.
        </span>
        <Button variant="soft" size="sm" className="shrink-0" onClick={retry}>
          Повторити
        </Button>
      </div>
    )
  if (isLoading)
    // No skeleton tiles: the data is local (milliseconds), and 170 px of skeleton replaced by a 32 px line
    // for someone without boards is the very jump this row had.
    return (
      <div className={LINE}>
        <span className="text-body font-medium text-muted-foreground">Добірки</span>
      </div>
    )
  if (total === 0) {
    if (galleryEmpty) return null
    return (
      <div className={LINE}>
        <LayoutGrid className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="shrink-0 text-body font-medium">Добірок поки немає</span>
        <span className="min-w-0 truncate text-caption text-muted-foreground">
          Збирайте в них схожі дизайни — для проєкту чи настрою.
        </span>
        <NewMoodboardButton {...newBoard} />
      </div>
    )
  }

  const more = total - boards.length
  const scrollable = canPrev || canNext
  return (
    <>
      <Collapsible
        open={!collapsed}
        onOpenChange={(o) => setCollapsed(!o)}
        className="flex flex-col"
      >
        <div className={LINE}>
          <Tooltip>
            <TooltipTrigger asChild>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="-ml-3">
                  <ChevronDown
                    className={cn('transition-transform', collapsed && '-rotate-90')}
                    aria-hidden
                  />
                  Добірки
                  <span className="text-muted-foreground tabular-nums">{total}</span>
                </Button>
              </CollapsibleTrigger>
            </TooltipTrigger>
            <TooltipContent>{collapsed ? 'Розгорнути добірки' : 'Згорнути добірки'}</TooltipContent>
          </Tooltip>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {!collapsed && scrollable && (
              <ButtonGroup>
                <RowArrow
                  label="Попередні добірки"
                  disabled={!canPrev}
                  onClick={() => scrollPage(-1)}
                >
                  <ChevronLeft />
                </RowArrow>
                <RowArrow
                  label="Наступні добірки"
                  disabled={!canNext}
                  onClick={() => scrollPage(1)}
                >
                  <ChevronRight />
                </RowArrow>
              </ButtonGroup>
            )}
            {/* Collapsed, the row can't be measured: the way to every board stays. */}
            {(collapsed || more > 0 || scrollable) && (
              <Button variant="soft" size="sm" onClick={() => setAllOpen(true)}>
                Усі добірки
              </Button>
            )}
            <NewMoodboardButton {...newBoard} />
          </div>
        </div>
        <CollapsibleContent>
          {/* Native horizontal scroll without the bar: a touchpad swipe and Shift+wheel work as is; ←/→ page.
              py-0.5 / px-0.5 keep the tiles' inset focus ring and hover hairline off the clipping edge. The gap
              under the header is mt-2 in here, not gap-2 on the root: the root's gap stayed for the whole fold
              and the gallery jumped 8px when it ended (and before the unfold began). */}
          <div
            ref={scroller}
            data-scroll-row
            role="region"
            aria-label="Добірки"
            onKeyDown={onKeyDown}
            className="-mx-0.5 mt-2 scroll-px-0.5 overflow-x-auto overflow-y-hidden overscroll-x-contain px-0.5 py-0.5 scrollbar-none snap-x snap-mandatory [&::-webkit-scrollbar]:hidden"
          >
            <div ref={track} role="list" className="flex w-max gap-2.5">
              {boards.map((b) => (
                <div key={b.id} role="listitem" data-slot="strip-item" className="flex snap-start">
                  <MoodboardTile board={b} />
                </div>
              ))}
              {more > 0 && (
                <div role="listitem" data-slot="strip-item" className="flex snap-start">
                  <MoreMoodboardsTile count={more} onClick={() => setAllOpen(true)} />
                </div>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
      {/* Outside the row: arrow keys typed in the dialog's search must not page the row behind it. */}
      <AllMoodboardsDialog open={allOpen} onOpenChange={setAllOpen} />
    </>
  )
}

/** Soft, not lime: N on this page presses «Завантажити», the screen's one lime button. */
function NewMoodboardButton({
  create,
  pending
}: {
  create: () => void
  pending: boolean
}): ReactElement {
  return (
    <Button
      variant="soft"
      size="sm"
      className="ml-auto shrink-0"
      disabled={pending}
      onClick={create}
    >
      <Plus /> Нова добірка
    </Button>
  )
}

function RowArrow({
  label,
  disabled,
  onClick,
  children
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: ReactElement
}): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="soft"
          size="icon-sm"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
