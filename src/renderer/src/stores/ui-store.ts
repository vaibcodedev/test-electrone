import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { QuickAddTarget } from '@shared/domain/system'

/**
 * Element to focus when the palette, quick add or the shortcuts help closes. They open from a hotkey, not a
 * Radix trigger, so Radix had nothing to return focus to and it fell to <body>. Opening one from inside
 * another dialog (quick add or the shortcuts help from the palette) keeps the element saved by the first one.
 */
function focusOrigin(prev: HTMLElement | null): HTMLElement | null {
  const el = document.activeElement
  if (!(el instanceof HTMLElement) || el === document.body) return null
  return el.closest('[role="dialog"]') ? prev : el
}

/**
 * `onCloseAutoFocus` for the palette, quick add and the shortcuts help: focus goes back to where it was
 * before they opened. When another of these dialogs took over (quick add or the help from the palette),
 * that one manages focus itself. A palette pick that navigates clears `returnFocus` first.
 */
export function restoreFocus(e: Event): void {
  const { returnFocus, paletteOpen, quickAddOpen, shortcutsOpen } = useUi.getState()
  if (paletteOpen || quickAddOpen || shortcutsOpen) return e.preventDefault()
  if (returnFocus?.isConnected) {
    e.preventDefault()
    returnFocus.focus()
  }
}

/** Client-only UI state. Server data lives in TanStack Query, not here. */
interface UiState {
  paletteOpen: boolean
  setPaletteOpen: (open: boolean) => void
  quickAddOpen: boolean
  shortcutsOpen: boolean
  setShortcutsOpen: (open: boolean) => void
  /** Target preselected when the quick-add dialog opens (e.g. 'card' from the «Новая задача» tile). */
  quickAddTarget: QuickAddTarget | undefined
  /** Text prefilled in quick add (e.g. the palette query that found nothing). */
  quickAddText: string | undefined
  setQuickAddOpen: (open: boolean, target?: QuickAddTarget, text?: string) => void
  /** Where focus goes back after the palette / quick add / shortcuts help closes (see focusOrigin). */
  returnFocus: HTMLElement | null
  /** Per-module view preferences, e.g. { boards: 'kanban' }. */
  views: Record<string, string>
  setView: (module: string, view: string) => void
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
  /** Pending «Залишити зміни?» question (CloseConfirmHost). */
  closeAsk: { keep: () => void; discard: () => void } | null
  askClose: (ask: { keep: () => void; discard: () => void } | null) => void
  /** Records created a moment ago: their detail pane opens straight in edit mode. */
  justCreated: Record<string, true>
  markCreated: (id: string) => void
  takeCreated: (id: string) => boolean
}

export const useUi = create<UiState>()(
  persist(
    (set, get) => ({
      paletteOpen: false,
      setPaletteOpen: (paletteOpen) =>
        set((s) => (paletteOpen ? { paletteOpen, returnFocus: focusOrigin(s.returnFocus) } : { paletteOpen })),
      quickAddOpen: false,
      shortcutsOpen: false,
      setShortcutsOpen: (shortcutsOpen) =>
        set((s) => (shortcutsOpen ? { shortcutsOpen, returnFocus: focusOrigin(s.returnFocus) } : { shortcutsOpen })),
      quickAddTarget: undefined,
      quickAddText: undefined,
      setQuickAddOpen: (quickAddOpen, quickAddTarget, quickAddText) =>
        set((s) =>
          quickAddOpen
            ? { quickAddOpen, quickAddTarget, quickAddText, returnFocus: focusOrigin(s.returnFocus) }
            : { quickAddOpen }
        ),
      returnFocus: null,
      views: {},
      setView: (module, view) => set((s) => ({ views: { ...s.views, [module]: view } })),
      platformDialogOpen: false,
      setPlatformDialogOpen: (platformDialogOpen) => set({ platformDialogOpen }),
      openHubs: { work: true, freelance: true },
      setHubOpen: (id, open) => set((s) => ({ openHubs: { ...s.openHubs, [id]: open } })),
      trashBump: 0,
      bumpTrash: () => set((s) => ({ trashBump: s.trashBump + 1 })),
      closeAsk: null,
      askClose: (closeAsk) => set({ closeAsk }),
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
      partialize: (s) => ({ views: s.views, openHubs: s.openHubs })
    }
  )
)
