import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { QuickAddTarget } from '@shared/domain/system'

/** Client-only UI state. Server data lives in TanStack Query, not here. */
interface UiState {
  paletteOpen: boolean
  setPaletteOpen: (open: boolean) => void
  quickAddOpen: boolean
  shortcutsOpen: boolean
  setShortcutsOpen: (open: boolean) => void
  /** Target preselected when the quick-add dialog opens (e.g. 'card' from the «Новая задача» tile). */
  quickAddTarget: QuickAddTarget | undefined
  setQuickAddOpen: (open: boolean, target?: QuickAddTarget) => void
  /** Per-module view preferences, e.g. { boards: 'kanban' }. */
  views: Record<string, string>
  setView: (module: string, view: string) => void
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  /** «Новая платформа» dialog (opened from the sidebar). */
  platformDialogOpen: boolean
  setPlatformDialogOpen: (open: boolean) => void
  /** Expanded hubs in the sidebar. */
  openHubs: Record<string, boolean>
  setHubOpen: (id: string, open: boolean) => void
  /** Increments when something goes to the trash: the sidebar trash icon plays a short "received" motion. */
  trashBump: number
  bumpTrash: () => void
  /** Ids playing the leave animation right before they are removed (list rows, detail pane). */
  leaving: Record<string, true>
  setLeaving: (id: string, on: boolean) => void
  /** Records created a moment ago: their detail pane opens straight in edit mode. */
  justCreated: Record<string, true>
  markCreated: (id: string) => void
  takeCreated: (id: string) => boolean
}

export const useUi = create<UiState>()(
  persist(
    (set, get) => ({
      paletteOpen: false,
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      quickAddOpen: false,
      shortcutsOpen: false,
      setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
      quickAddTarget: undefined,
      setQuickAddOpen: (quickAddOpen, quickAddTarget) =>
        set(quickAddOpen ? { quickAddOpen, quickAddTarget } : { quickAddOpen }),
      views: {},
      setView: (module, view) => set((s) => ({ views: { ...s.views, [module]: view } })),
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      platformDialogOpen: false,
      setPlatformDialogOpen: (platformDialogOpen) => set({ platformDialogOpen }),
      openHubs: { work: true, freelance: true },
      setHubOpen: (id, open) => set((s) => ({ openHubs: { ...s.openHubs, [id]: open } })),
      trashBump: 0,
      bumpTrash: () => set((s) => ({ trashBump: s.trashBump + 1 })),
      justCreated: {},
      markCreated: (id) => set((s) => ({ justCreated: { ...s.justCreated, [id]: true } })),
      takeCreated: (id) => {
        const was = !!get().justCreated[id]
        if (was)
          set((s) => {
            const justCreated = { ...s.justCreated }
            delete justCreated[id]
            return { justCreated }
          })
        return was
      },
      leaving: {},
      setLeaving: (id, on) =>
        set((s) => {
          const leaving = { ...s.leaving }
          if (on) leaving[id] = true
          else delete leaving[id]
          return { leaving }
        })
    }),
    {
      name: 'vault-ui',
      partialize: (s) => ({ views: s.views, sidebarCollapsed: s.sidebarCollapsed, openHubs: s.openHubs })
    }
  )
)
