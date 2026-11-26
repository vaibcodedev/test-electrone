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
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { SidebarProvider, useSidebar } from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CommandPalette } from '@/features/command-palette'
import { QuickAddDialog } from '@/features/quick-add'
import { ExtensionPairDialog } from '@/features/extension-pair-dialog'
import { ShortcutsDialog } from '@/features/shortcuts-dialog'
import { RecordMenuHost } from '@/features/record-menu/host'
import { useUi } from '@/stores/ui-store'
import { useMainEvent, useMainEventsBridge } from '@/hooks/use-main-events'
import { useHotkey } from '@/hooks/use-hotkey'
import { useGlobalShortcuts } from '@/hooks/use-global-shortcuts'
import { AppSidebar } from './sidebar'
import { SidebarToggle } from './sidebar-toggle'
import { SandboxBadge } from './sandbox-badge'
import { AiChatToggle, ChatLayout } from '@/features/ai-chat/chat-layout'

const PlatformDialogHost = lazy(async () => ({
  default: (await import('@/modules/freelance')).PlatformDialogHost
}))

/** One width for the sidebar and the title bar that lines up with it; the folded strip is 56 px. */
const SHELL_VARS = { '--sidebar-width': '244px', '--sidebar-width-icon': '56px' } as CSSProperties

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
  const { state } = useSidebar()
  return (
    <div className="drag flex h-11 shrink-0 items-center pr-37.5">
      {/* A slot as wide as the sidebar column: the toggle sits over the column, history and search line up with
          the main panel in both widths. Only the button is no-drag — the rest still moves the window. */}
      <div
        className={cn(
          'ml-2.5 flex shrink-0 items-center',
          state === 'collapsed' ? 'w-(--sidebar-width-icon) justify-center' : 'w-(--sidebar-width)'
        )}
      >
        <SidebarToggle />
      </div>
      <div className="no-drag ml-1 flex gap-1">
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
        // min-w-0 + shrink: at 960 px the «Тестовий режим» badge must still fit next to it.
        className="no-drag ml-2 h-8 w-[min(420px,40vw)] min-w-0 shrink justify-start gap-2 bg-card/70 px-3.5 font-normal text-muted-foreground hover:bg-card"
      >
        <Search />
        <span className="min-w-0 flex-1 truncate text-left">Знайти всюди</span>
        <KbdGroup>
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </Button>
      {/* Right end, over the column the chat opens in; the badge (test mode) sits before it. */}
      <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">
        <SandboxBadge />
        <AiChatToggle />
      </div>
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
  const sidebarOpen = useUi((s) => s.sidebarOpen)
  const setSidebarOpen = useUi((s) => s.setSidebarOpen)

  return (
    // The provider is the root: the title bar's toggle and the sidebar read one state (ui-store, persisted).
    <SidebarProvider
      open={sidebarOpen}
      onOpenChange={setSidebarOpen}
      className="h-full min-h-0 flex-col bg-frame"
      style={SHELL_VARS}
    >
      <TitleBar />
      {/* overflow-clip, not hidden: a box with hidden overflow still scrolls on focus or scrollIntoView, and a
          row wider than the window once slid the sidebar off the left edge. */}
      <div className="flex min-h-0 flex-1 gap-2.5 overflow-clip px-2.5 pb-2.5">
        <AppSidebar />
        <ChatLayout>
          <main className="panel relative flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* Keyed by path: every page enters with the same short fade-up. Tabs of one hub share the key, so
              switching a tab doesn't fade the same header and tab row out and in again. */}
            <div
              key={handle?.hub ?? pathname}
              className="flex min-h-0 flex-1 animate-page flex-col"
            >
              <Suspense fallback={<PageSkeleton kind={skeleton} filters={handle?.filters} />}>
                <Outlet />
              </Suspense>
            </div>
          </main>
        </ChatLayout>
      </div>
      <CommandPalette />
      <QuickAddDialog />
      <ShortcutsDialog />
      <CloseConfirmHost />
      {/* Right click and «⋯» on records: one menu for the whole window. */}
      <RecordMenuHost />
      {/* «Під’єднати до Vault» from the browser extension: main brings the window up with this question. */}
      <ExtensionPairDialog />
      {platformMounted && (
        <Suspense fallback={null}>
          <PlatformDialogHost />
        </Suspense>
      )}
    </SidebarProvider>
  )
}
