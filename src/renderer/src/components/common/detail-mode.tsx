import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { Check, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useUi } from '@/stores/ui-store'

/**
 * View / edit mode of an open record (docs/design-system.md → Просмотр и редактирование).
 * A click opens a record for reading; «Редагувати» (or E) switches the pane to editing.
 * Shared fields read this context: in view mode inputs are read-only text, markdown is rendered,
 * selects and toggles show only their value, edit-only buttons hide.
 * Outside a DetailPane there is no provider → everything stays editable (dialogs, forms, pages).
 */
export interface DetailMode {
  editing: boolean
  setEditing: (editing: boolean) => void
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

/** Mode state for a record editor: view first, edit right away for a record created a moment ago. */
export function useRecordMode(id: string): DetailMode {
  const [editing, setEditing] = useState(() => useUi.getState().takeCreated(id))
  return useMemo(() => ({ editing, setEditing }), [editing])
}

/** Wrap a custom record editor (sheet, page) so its fields follow the view/edit mode. */
export function RecordMode({ mode, children }: { mode: DetailMode; children: ReactNode }) {
  return (
    <DetailModeContext.Provider value={mode}>
      <div data-detail-mode={mode.editing ? 'edit' : 'view'} className="contents">
        {children}
      </div>
    </DetailModeContext.Provider>
  )
}

/** «Редагувати» / «Готово» for a record header. E edits; Esc leaves edit mode (data-close-detail). */
export function EditToggle({ mode }: { mode: DetailMode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {mode.editing ? (
          <Button variant="subtle" size="sm" data-close-detail onClick={() => mode.setEditing(false)}>
            <Check className="text-success" /> Готово
          </Button>
        ) : (
          <Button variant="subtle" size="sm" data-edit-detail onClick={() => mode.setEditing(true)}>
            <Pencil /> Редагувати
          </Button>
        )}
      </TooltipTrigger>
      <TooltipContent>{mode.editing ? 'Зберігається саме · Esc' : 'Редагувати · E'}</TooltipContent>
    </Tooltip>
  )
}
