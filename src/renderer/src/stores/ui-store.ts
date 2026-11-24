import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Client-only UI state. Server data lives in TanStack Query, not here. */
interface UiState {
  paletteOpen: boolean
  setPaletteOpen: (open: boolean) => void
  quickAddOpen: boolean
  setQuickAddOpen: (open: boolean) => void
  /** Per-module view preferences, e.g. { boards: 'kanban' }. */
  views: Record<string, string>
  setView: (module: string, view: string) => void
  sidebarCollapsed: boolean
  toggleSidebar: () => void
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      paletteOpen: false,
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      quickAddOpen: false,
      setQuickAddOpen: (quickAddOpen) => set({ quickAddOpen }),
      views: {},
      setView: (module, view) => set((s) => ({ views: { ...s.views, [module]: view } })),
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }))
    }),
    {
      name: 'vault-ui',
      partialize: (s) => ({ views: s.views, sidebarCollapsed: s.sidebarCollapsed })
    }
  )
)
