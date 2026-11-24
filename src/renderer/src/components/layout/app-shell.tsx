import { Suspense, useEffect, type CSSProperties } from 'react'
import { Outlet, useNavigate } from 'react-router'
import { ArrowLeft, ArrowRight, Search } from 'lucide-react'
import { AppSidebar } from './sidebar'
import { Button } from '@/components/ui/button'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { SidebarProvider } from '@/components/ui/sidebar'
import { CommandPalette } from '@/features/command-palette'
import { QuickAddDialog } from '@/features/quick-add'
import { useUi } from '@/stores/ui-store'
import { useMainEventsBridge } from '@/hooks/use-main-events'
import { useHotkey } from '@/hooks/use-hotkey'
import { ALL_NAV_ITEMS } from '@/app/navigation'

function TitleBar() {
  const setPaletteOpen = useUi((s) => s.setPaletteOpen)
  const navigate = useNavigate()
  return (
    <div className="drag flex h-11 shrink-0 items-center gap-2 pr-[150px] pl-[258px]">
      <div className="no-drag flex gap-1">
        <Button variant="ghost" size="icon-sm" aria-label="Назад" className="text-muted-foreground hover:bg-card" onClick={() => navigate(-1)}>
          <ArrowLeft />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Вперёд" className="text-muted-foreground hover:bg-card" onClick={() => navigate(1)}>
          <ArrowRight />
        </Button>
      </div>
      <Button
        variant="ghost"
        onClick={() => setPaletteOpen(true)}
        className="no-drag h-8 w-[min(420px,40vw)] justify-start gap-2 bg-card/70 px-3.5 font-normal text-muted-foreground hover:bg-card"
      >
        <Search />
        <span className="flex-1 text-left">Найти везде</span>
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
  const navigate = useNavigate()
  const setQuickAddOpen = useUi((s) => s.setQuickAddOpen)
  useMainEventsBridge()
  // Alt+1…9 → first nine sections.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.altKey || e.ctrlKey || e.metaKey || !/^Digit[1-9]$/.test(e.code)) return
      const item = ALL_NAV_ITEMS[Number(e.code.slice(5)) - 1]
      if (!item) return
      e.preventDefault()
      navigate(item.path)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])
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
          <Suspense fallback={<div className="p-8 text-muted-foreground">Загрузка…</div>}>
            <Outlet />
          </Suspense>
        </main>
      </SidebarProvider>
      <CommandPalette />
      <QuickAddDialog />
    </div>
  )
}
