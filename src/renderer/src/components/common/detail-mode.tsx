import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { RecordSnapshot } from '@shared/api'
import type { EntityType } from '@shared/entity-types'
import { api } from '@/lib/api'
import { invalidateAll } from '@/lib/query'
import { flushAllAutosaves } from '@/hooks/use-autosave'
import { Check, Pencil, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
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
  /** Revert to the state when editing started (only when the record type is known). */
  cancel?: () => Promise<void>
  /** Close the record; asks «Залишити / Скасувати зміни» if something changed while editing. */
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
 * Mode state for a record editor: view first, edit right away for a record created a moment ago.
 * With `type`, entering edit takes a server snapshot so «Скасувати» can revert and closing can ask.
 */
export function useRecordMode(id: string, type?: EntityType): DetailMode {
  const [editing, setEditing] = useState(() => useUi.getState().takeCreated(id))
  const snap = useRef<RecordSnapshot | null>(null)

  useEffect(() => {
    snap.current = null
    if (!editing || !type) return
    let alive = true
    api.records
      .snapshot({ type, id })
      .then((s) => {
        if (alive) snap.current = s
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [editing, id, type])

  return useMemo<DetailMode>(() => {
    const ref = type ? { type, id } : null
    const cancel = ref
      ? async (): Promise<void> => {
          const s = snap.current
          // Pending autosaves first, otherwise they'd land after the revert and undo it.
          flushAllAutosaves()
          if (s) {
            await api.records.revert({ ref, snapshot: s })
            invalidateAll()
            toast.success('Зміни скасовано')
          }
          setEditing(false)
        }
      : undefined
    const confirmClose = (close: () => void): void => {
      const s = snap.current
      if (!editing || !ref || !s) return close()
      flushAllAutosaves()
      api.records
        .changed({ ref, snapshot: s })
        .then((changed) => {
          if (!changed) return close()
          useUi.getState().askClose({
            keep: close,
            discard: () => {
              void api.records.revert({ ref, snapshot: s }).then(() => {
                invalidateAll()
                close()
              })
            }
          })
        })
        .catch(() => close())
    }
    return { editing, setEditing, cancel, confirmClose }
  }, [editing, id, type])
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

/** «Редагувати» / «Скасувати» + «Готово» for a record header. E edits; Esc leaves edit mode (data-close-detail). */
export function EditToggle({ mode }: { mode: DetailMode }) {
  if (!mode.editing)
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="subtle" size="sm" data-edit-detail onClick={() => mode.setEditing(true)}>
            <Pencil /> Редагувати
          </Button>
        </TooltipTrigger>
        <TooltipContent>Редагувати · E</TooltipContent>
      </Tooltip>
    )
  return (
    <span className="flex items-center gap-1">
      {mode.cancel && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => void mode.cancel?.()}>
              <Undo2 /> Скасувати
            </Button>
          </TooltipTrigger>
          <TooltipContent>Повернути все як було до «Редагувати»</TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="subtle" size="sm" data-close-detail onClick={() => mode.setEditing(false)}>
            <Check className="text-success" /> Готово
          </Button>
        </TooltipTrigger>
        <TooltipContent>Зміни вже збережено · Esc</TooltipContent>
      </Tooltip>
    </span>
  )
}

/** «Залишити зміни?» dialog for confirmClose; mounted once in AppShell. */
export function CloseConfirmHost() {
  const ask = useUi((s) => s.closeAsk)
  const clear = useUi((s) => s.askClose)
  return (
    <AlertDialog open={!!ask} onOpenChange={(o) => !o && clear(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Залишити зміни?</AlertDialogTitle>
          <AlertDialogDescription>
            Під час редагування запис змінився. Можна залишити зміни або повернути все як було.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => {
              ask?.discard()
              clear(null)
            }}
          >
            Скасувати зміни
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              ask?.keep()
              clear(null)
            }}
          >
            Залишити
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
