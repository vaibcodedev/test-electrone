import { useCallback, Suspense, type CSSProperties } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { PageSkeleton } from '@/components/common/page-skeleton'
import { ArrowLeft, ArrowRight, Search } from 'lucide-react'
import { AppSidebar } from './sidebar'
import { Button } from '@/components/ui/button'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { SidebarProvider } from '@/components/ui/sidebar'
import { CommandPalette } from '@/features/command-palette'
import { QuickAddDialog } from '@/features/quick-add'
import { lazy } from 'react'

const PlatformDialogHost = lazy(async () => ({
  default: (await import('@/modules/freelance')).PlatformDialogHost
}))
import { useUi } from '@/stores/ui-store'
import { useMainEvent, useMainEventsBridge } from '@/hooks/use-main-events'
import { toast } from 'sonner'
import type { MainEvents } from '@shared/api'
import { useHotkey } from '@/hooks/use-hotkey'
import { useGlobalShortcuts } from '@/hooks/use-global-shortcuts'
import { ShortcutsDialog } from '@/features/shortcuts-dialog'

function TitleBar() {
  const setPaletteOpen = useUi((s) => s.setPaletteOpen)
  const navigate = useNavigate()
  return (
    <div className="drag flex h-11 shrink-0 items-center gap-2 pr-[150px] pl-[258px]">
      <div className="no-drag flex gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Назад"
          className="text-muted-foreground hover:bg-card"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Вперед"
          className="text-muted-foreground hover:bg-card"
          onClick={() => navigate(1)}
        >
          <ArrowRight />
        </Button>
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
export function AppShell() {
  const { pathname } = useLocation()
  const setQuickAddOpen = useUi((s) => s.setQuickAddOpen)
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
    <div className="flex h-full flex-col bg-frame">
      <TitleBar />
      <SidebarProvider
        className="min-h-0 flex-1 gap-2.5 px-2.5 pb-2.5"
        style={{ '--sidebar-width': '244px' } as CSSProperties}
      >
        <AppSidebar />
        <main className="panel relative flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Keyed by path: every page enters with the same short fade-up. */}
          <div key={pathname} className="flex min-h-0 flex-1 animate-page flex-col">
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </SidebarProvider>
      <CommandPalette />
      <QuickAddDialog />
      <ShortcutsDialog />
      <Suspense fallback={null}>
        <PlatformDialogHost />
      </Suspense>
    </div>
  )
}
