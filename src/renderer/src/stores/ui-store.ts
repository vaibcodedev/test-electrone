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
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
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
      setHubOpen: (id, open) => set((s) => ({ openHubs: { ...s.openHubs, [id]: open } }))
    }),
    {
      name: 'vault-ui',
      partialize: (s) => ({ views: s.views, sidebarCollapsed: s.sidebarCollapsed, openHubs: s.openHubs })
    }
  )
)
