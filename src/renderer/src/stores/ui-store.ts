import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { QuickAddTarget } from '@shared/domain/system'

/**
 * Element to focus when the palette, quick add or the shortcuts help closes. They open from a hotkey, not a
 * Radix trigger, so Radix had nothing to return focus to and it fell to <body>. Opening one of them from
 * inside another (quick add or the help from the palette) keeps the element saved by the first one; focus
 * inside any other dialog (a card sheet) is itself the origin, so closing the help returns into that sheet.
 */
function focusOrigin(prev: HTMLElement | null): HTMLElement | null {
  const el = document.activeElement
  if (!(el instanceof HTMLElement) || el === document.body) return null
  return el.closest('[data-hotkey-dialog]') ? prev : el
}

/**
 * `onCloseAutoFocus` for the palette, quick add and the shortcuts help: focus goes back to where it was
 * before they opened, once — the saved element is dropped right after. When another of these dialogs took
 * over (quick add or the help from the palette), that one manages focus itself. A palette pick that
 * navigates drops the element first (`dropReturnFocus`).
 */
export function restoreFocus(e: Event): void {
  const { returnFocus, paletteOpen, quickAddOpen, shortcutsOpen, aiAskFocus } = useUi.getState()
  if (paletteOpen || quickAddOpen || shortcutsOpen) return e.preventDefault()
  // «Спитати ШІ» from the palette: the answer comes in the chat — focus goes to its composer (the panel focuses
  // it itself when it is still loading), not back into the page.
  if (aiAskFocus) {
    e.preventDefault()
    useUi.setState({ aiAskFocus: false, returnFocus: null })
    document.querySelector<HTMLElement>('[data-ai-chat-input]')?.focus()
    return
  }
  if (returnFocus?.isConnected) {
    e.preventDefault()
    returnFocus.focus()
  }
  useUi.setState({ returnFocus: null })
}

/** Props for the DialogContent of a dialog opened by a hotkey (palette, quick add, shortcuts help). */
export const HOTKEY_DIALOG_PROPS = { 'data-hotkey-dialog': '', onCloseAutoFocus: restoreFocus }

/**
 * The question asked when a record in edit mode is closed with changes. `fresh` — a record created a moment
 * ago and never saved: «Не зберігати» removes it instead of rolling back.
 */
/**
 * Chat ШІ panel width, px; it opens at the widest. The cap (the width the person chose) keeps the page usable next
 * to it — at 60% of the window the home tiles broke into one word per line; wider — «На всю сторінку».
 */
export const AI_CHAT_MIN = 300
export const AI_CHAT_MAX = 380

export interface CloseAsk {
  keep: () => void
  discard: () => void
  fresh?: boolean
  /** Why «Зберегти» is off in the question (a field with an error, an open inline form): only «Не зберігати» or Esc. */
  blocked?: string
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
  /** Leaving by a palette pick: focus must not jump back into the field the palette was opened from. */
  dropReturnFocus: () => void
  /** Per-module view preferences, e.g. { boards: 'kanban' }. */
  views: Record<string, string>
  setView: (module: string, view: string) => void
  /** «Новая платформа» dialog (opened from the sidebar). */
  platformDialogOpen: boolean
  setPlatformDialogOpen: (open: boolean) => void
  /** Expanded hubs in the sidebar. */
  openHubs: Record<string, boolean>
  setHubOpen: (id: string, open: boolean) => void
  /** Sidebar expanded (244 px) or folded to the 56 px strip of icons — Ctrl+B, remembered between runs. */
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  /** Collapsed page sections, e.g. { 'designs.moodboards': true } — the row of moodboards over the gallery. */
  collapsed: Record<string, boolean>
  setCollapsed: (id: string, on: boolean) => void
  /** Increments when something goes to the trash: the sidebar trash icon plays a short "received" motion. */
  trashBump: number
  bumpTrash: () => void
  /** Ids playing the leave animation right before they are removed (list rows, detail pane). */
  leaving: Record<string, true>
  setLeaving: (id: string, on: boolean) => void
  /** Pending «Зберегти зміни?» question (CloseConfirmHost). */
  closeAsk: CloseAsk | null
  askClose: (ask: CloseAsk | null) => void
  /** «Чат ШІ» on the right (Ctrl+J, «ШІ» in the title bar). */
  aiChatOpen: boolean
  setAiChatOpen: (open: boolean) => void
  toggleAiChat: () => void
  /** The chat takes the whole page (header button); closing the chat ends it. Not remembered between starts. */
  aiChatFull: boolean
  setAiChatFull: (full: boolean) => void
  /** Width of the chat panel in px, remembered between runs. */
  aiChatWidth: number
  setAiChatWidth: (width: number) => void
  /** A question to send as soon as the chat opens (Ctrl+K «Спитати ШІ: …»); the panel takes it once. */
  aiAsk: { text: string; id: number } | null
  /** The palette closing after «Спитати ШІ» hands the focus to the chat (restoreFocus). */
  aiAskFocus: boolean
  askAi: (text: string) => void
  takeAiAsk: () => { text: string; id: number } | null
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
        set((s) =>
          paletteOpen ? { paletteOpen, returnFocus: focusOrigin(s.returnFocus) } : { paletteOpen }
        ),
      quickAddOpen: false,
      shortcutsOpen: false,
      setShortcutsOpen: (shortcutsOpen) =>
        set((s) =>
          shortcutsOpen
            ? { shortcutsOpen, returnFocus: focusOrigin(s.returnFocus) }
            : { shortcutsOpen }
        ),
      quickAddTarget: undefined,
      quickAddText: undefined,
      setQuickAddOpen: (quickAddOpen, quickAddTarget, quickAddText) =>
        set((s) =>
          quickAddOpen
            ? {
                quickAddOpen,
                quickAddTarget,
                quickAddText,
                returnFocus: focusOrigin(s.returnFocus)
              }
            : { quickAddOpen }
        ),
      returnFocus: null,
      dropReturnFocus: () => set({ returnFocus: null }),
      views: {},
      setView: (module, view) => set((s) => ({ views: { ...s.views, [module]: view } })),
      platformDialogOpen: false,
      setPlatformDialogOpen: (platformDialogOpen) => set({ platformDialogOpen }),
      openHubs: { work: true, freelance: true },
      setHubOpen: (id, open) => set((s) => ({ openHubs: { ...s.openHubs, [id]: open } })),
      sidebarOpen: true,
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      // Older saved state has no `collapsed`: persist merges shallowly, so it starts as {} (all expanded).
      collapsed: {},
      setCollapsed: (id, on) => set((s) => ({ collapsed: { ...s.collapsed, [id]: on } })),
      trashBump: 0,
      bumpTrash: () => set((s) => ({ trashBump: s.trashBump + 1 })),
      closeAsk: null,
      askClose: (closeAsk) => set({ closeAsk }),
      aiChatOpen: false,
      setAiChatOpen: (aiChatOpen) =>
        set(aiChatOpen ? { aiChatOpen } : { aiChatOpen, aiChatFull: false }),
      toggleAiChat: () =>
        set((s) =>
          s.aiChatOpen ? { aiChatOpen: false, aiChatFull: false } : { aiChatOpen: true }
        ),
      aiChatFull: false,
      setAiChatFull: (aiChatFull) => set({ aiChatFull }),
      aiChatWidth: AI_CHAT_MAX,
      setAiChatWidth: (width) =>
        set({ aiChatWidth: Math.round(Math.min(Math.max(width, AI_CHAT_MIN), AI_CHAT_MAX)) }),
      aiAsk: null,
      aiAskFocus: false,
      askAi: (text) => set({ aiChatOpen: true, aiAsk: { text, id: Date.now() }, aiAskFocus: true }),
      takeAiAsk: () => {
        const ask = get().aiAsk
        if (ask) set({ aiAsk: null })
        return ask
      },
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
      partialize: (s) => ({
        views: s.views,
        openHubs: s.openHubs,
        collapsed: s.collapsed,
        sidebarOpen: s.sidebarOpen,
        aiChatWidth: s.aiChatWidth
      }),
      // persist doesn't validate what it reads: a hand-edited or foreign `sidebarOpen` must not leave the
      // panel in a state no button shows. The version stays — without a migrate a bump would drop views too.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<UiState>
        return {
          ...current,
          ...p,
          sidebarOpen: typeof p.sidebarOpen === 'boolean' ? p.sidebarOpen : current.sidebarOpen,
          // A width saved before the cap (up to 900) comes back as the widest allowed now.
          aiChatWidth:
            typeof p.aiChatWidth === 'number' && p.aiChatWidth >= AI_CHAT_MIN
              ? Math.min(p.aiChatWidth, AI_CHAT_MAX)
              : current.aiChatWidth
        }
      }
    }
  )
)
