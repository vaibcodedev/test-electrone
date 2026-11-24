import { createContext, useContext, type ReactNode } from 'react'

/**
 * View / edit mode of an open record (docs/design-system.md → Просмотр и редактирование).
 * Kept free of UI imports so shadcn wrappers (`components/ui`) can read and reset it without cycles.
 */
export interface DetailMode {
  editing: boolean
  setEditing: (editing: boolean) => void
  /** «Зберегти»: flush autosaves and return to view mode. */
  save?: () => Promise<void>
  /** Revert to the state when editing started; a record created a moment ago is discarded (then `close`). */
  cancel?: (close?: () => void) => Promise<void>
  /** Esc while editing: leave edit mode, asking «Зберегти зміни?» if something changed. */
  exit?: (close?: () => void) => void
  /** Close the record; asks «Зберегти / Не зберігати» if something changed while editing. */
  confirmClose?: (close: () => void) => void
}

const ALWAYS_EDIT: DetailMode = { editing: true, setEditing: () => undefined }

export const DetailModeContext = createContext<DetailMode>(ALWAYS_EDIT)

export function useDetailMode(): DetailMode {
  return useContext(DetailModeContext)
}

/** true when the surrounding record pane is in view mode (fields render as read-only text). */
export function useReadOnly(): boolean {
  return !useContext(DetailModeContext).editing
}

/**
 * Dialogs, sheets and popovers are separate forms: React context passes through their portal,
 * so without this a dialog opened from a record in view mode would get read-only inputs.
 */
export function EditableScope({ children }: { children: ReactNode }) {
  return <DetailModeContext.Provider value={ALWAYS_EDIT}>{children}</DetailModeContext.Provider>
}
