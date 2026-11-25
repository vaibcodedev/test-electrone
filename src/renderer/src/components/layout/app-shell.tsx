import {
  lazy,
  Suspense,
  useCallback,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode
} from 'react'
import { Outlet, useLocation, useMatches, useNavigate } from 'react-router'
import { ArrowLeft, ArrowRight, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { MainEvents } from '@shared/api'
import { CloseConfirmHost } from '@/components/common/detail-mode'
import { PageSkeleton, SKELETON_KINDS, type SkeletonKind } from '@/components/common/page-skeleton'
import type { RouteHandle } from '@/app/router'
import { Button } from '@/components/ui/button'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { SidebarProvider } from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CommandPalette } from '@/features/command-palette'
import { QuickAddDialog } from '@/features/quick-add'
import { ShortcutsDialog } from '@/features/shortcuts-dialog'
import { useUi } from '@/stores/ui-store'
import { useMainEvent, useMainEventsBridge } from '@/hooks/use-main-events'
import { useHotkey } from '@/hooks/use-hotkey'
import { useGlobalShortcuts } from '@/hooks/use-global-shortcuts'
import { AppSidebar } from './sidebar'

const PlatformDialogHost = lazy(async () => ({
  default: (await import('@/modules/freelance')).PlatformDialogHost
}))

/** One width for the sidebar and the title bar that lines up with it. */
const SHELL_VARS = { '--sidebar-width': '244px' } as CSSProperties

function HistoryButton({
  label,
  keyHint,
  disabled,
  onClick,
  children
}: {
  label: string
  keyHint: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          disabled={disabled}
          className="text-muted-foreground hover:bg-card"
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-2">
        {label}
        <Kbd>{keyHint}</Kbd>
      </TooltipContent>
    </Tooltip>
  )
}

function TitleBar(): ReactElement {
  const setPaletteOpen = useUi((s) => s.setPaletteOpen)
  const navigate = useNavigate()
  // React Router keeps the position in the history stack in history.state.idx; useLocation re-renders on moves.
  useLocation()
  const atStart = ((window.history.state as { idx?: number } | null)?.idx ?? 0) === 0
  return (
    <div className="drag flex h-11 shrink-0 items-center gap-2 pr-[150px] pl-[calc(var(--sidebar-width)+14px)]">
      <div className="no-drag flex gap-1">
        <HistoryButton label="Назад" keyHint="[" disabled={atStart} onClick={() => navigate(-1)}>
          <ArrowLeft />
        </HistoryButton>
        {/* Not disabled: the browser does not say how deep the forward stack is. */}
        <HistoryButton label="Вперед" keyHint="]" onClick={() => navigate(1)}>
          <ArrowRight />
        </HistoryButton>
      </div>
      <Button
        variant="ghost"
        onClick={() => setPaletteOpen(true)}
        className="no-drag h-8 w-[min(420px,40vw)] justify-start gap-2 bg-card/70 px-3.5 font-normal text-muted-foreground hover:bg-card"
      >
        <Search />
        <span className="flex-1 text-left">Знайти всюди</span>
        <KbdGroup>
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </Button>
    </div>
  )
}

/** Window layout: custom title bar on the sage frame, sidebar, and the main paper panel. */
export function AppShell(): ReactElement {
  const { pathname } = useLocation()
  // The route says what the page looks like (handle in app/router.tsx); default — a list.
  const matches = useMatches()
  const handle = matches[matches.length - 1]?.handle as Partial<RouteHandle> | undefined
  const skeleton: SkeletonKind =
    handle?.skeleton && SKELETON_KINDS.includes(handle.skeleton) ? handle.skeleton : 'list'
  const setQuickAddOpen = useUi((s) => s.setQuickAddOpen)
  // The freelance chunk loads on the first «Додати платформу», not on every start; once mounted it stays,
  // so the closing animation is not cut off.
  const platformOpen = useUi((s) => s.platformDialogOpen)
  const [platformMounted, setPlatformMounted] = useState(false)
  if (platformOpen && !platformMounted) setPlatformMounted(true)
  useMainEventsBridge()
  // Background messages from main (e.g. «команда code не найдена»).
  const onToast = useCallback((t: MainEvents['toast']) => {
    if (t.kind === 'error') toast.error(t.message)
    else if (t.kind === 'success') toast.success(t.message)
    else toast.info(t.message)
  }, [])
  useMainEvent('toast', onToast)
  useGlobalShortcuts()
  useHotkey('mod+n', () => setQuickAddOpen(true), { allowInInputs: true })

  return (
    <div className="flex h-full flex-col bg-frame" style={SHELL_VARS}>
      <TitleBar />
      {/* SidebarProvider sets its own default width on itself, so the same value goes there too. */}
      <SidebarProvider className="min-h-0 flex-1 gap-2.5 px-2.5 pb-2.5" style={SHELL_VARS}>
        <AppSidebar />
        <main className="panel relative flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Keyed by path: every page enters with the same short fade-up. Tabs of one hub share the key, so
              switching a tab doesn't fade the same header and tab row out and in again. */}
          <div key={handle?.hub ?? pathname} className="flex min-h-0 flex-1 animate-page flex-col">
            <Suspense fallback={<PageSkeleton kind={skeleton} filters={handle?.filters} />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </SidebarProvider>
      <CommandPalette />
      <QuickAddDialog />
      <ShortcutsDialog />
      <CloseConfirmHost />
      {platformMounted && (
        <Suspense fallback={null}>
          <PlatformDialogHost />
        </Suspense>
      )}
    </div>
  )
}
