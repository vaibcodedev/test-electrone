import { Suspense, useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router'
import { ArrowLeft, ArrowRight, Search } from 'lucide-react'
import { Sidebar } from './sidebar'
import { CommandPalette } from '@/features/command-palette'
import { QuickAddDialog } from '@/features/quick-add'
import { useUi } from '@/stores/ui-store'
import { useMainEventsBridge } from '@/hooks/use-main-events'
import { useHotkey } from '@/hooks/use-hotkey'
import { ALL_NAV_ITEMS } from '@/app/navigation'
import { Kbd } from '@/components/common/page'

function TitleBar() {
  const setPaletteOpen = useUi((s) => s.setPaletteOpen)
  const navigate = useNavigate()
  return (
    <div className="drag flex h-11 shrink-0 items-center gap-2 pr-[150px] pl-[258px]">
      <div className="no-drag flex gap-1">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground"
          aria-label="Назад"
        >
          <ArrowLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => navigate(1)}
          className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground"
          aria-label="Вперёд"
        >
          <ArrowRight className="size-4" />
        </button>
      </div>
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="no-drag flex h-8 w-[min(420px,40vw)] items-center gap-2 rounded-full bg-card/70 px-3.5 text-[12.5px] text-muted-foreground transition-colors hover:bg-card"
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left">Найти везде</span>
        <Kbd>Ctrl</Kbd>
        <Kbd>K</Kbd>
      </button>
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
      <div className="flex min-h-0 flex-1 gap-2.5 px-2.5 pb-2.5">
        <Sidebar />
        <main className="panel relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <Suspense fallback={<div className="p-8 text-muted-foreground">Загрузка…</div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <CommandPalette />
      <QuickAddDialog />
    </div>
  )
}
