import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { DetailModeContext, type DetailMode } from './detail-mode-context'

export {
  DetailModeContext,
  EditableScope,
  useDetailMode,
  useReadOnly,
  type DetailMode
} from './detail-mode-context'
import { toast } from 'sonner'
import type { RecordSnapshot } from '@shared/api'
import type { EntityType } from '@shared/entity-types'
import { api } from '@/lib/api'
import { flushAndSettle, invalidateAll } from '@/lib/query'
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
 * Mode state for a record editor: view first, edit right away for a record created a moment ago.
 * Editing is a transaction from the user's point of view: fields autosave (nothing is lost on a crash),
 * but «Зберегти» confirms, «Скасувати» reverts to the snapshot taken on «Редагувати» — and a record created
 * in this session disappears entirely. Leaving with unsaved changes asks «Зберегти зміни?».
 */
export function useRecordMode(id: string, type?: EntityType): DetailMode {
  const [isNew] = useState(() => useUi.getState().takeCreated(id))
  const [editing, setEditing] = useState(isNew)
  const fresh = useRef(isNew)
  // The snapshot is a promise: «Скасувати» pressed before it arrived waits for it instead of reverting nothing.
  const snap = useRef<Promise<RecordSnapshot | null>>(Promise.resolve(null))

  useEffect(() => {
    if (!editing || !type) {
      snap.current = Promise.resolve(null)
      return
    }
    snap.current = api.records.snapshot({ type, id }).catch(() => {
      // Without a snapshot «Скасувати» can't revert: say so now, not silently later.
      toast.warning('«Скасувати» зараз недоступне — зміни зберігатимуться одразу')
      return null
    })
  }, [editing, id, type])

  return useMemo<DetailMode>(() => {
    const ref = type ? { type, id } : null
    /** Pending autosaves first, then ask the server whether anything differs from the snapshot. */
    /** Unsaved-edit failures from the last flush (server rejected a field): saving must not pretend success. */
    let lastFailed = 0
    const hasChanges = async (): Promise<boolean> => {
      // Wait for the saves to land: otherwise «changed» is asked before the last keystrokes reach main.
      lastFailed = (await flushAndSettle()).failed
      const s = await snap.current
      if (!ref || !s) return false
      return api.records.changed({ ref, snapshot: s }).catch(() => false)
    }
    const save = async (): Promise<void> => {
      const changed = await hasChanges()
      if (lastFailed > 0) {
        // The field's own error toast already said what; stay in edit mode so the text isn't lost.
        toast.error('Не все збережено — виправте поле з помилкою й натисніть «Зберегти» ще раз')
        return
      }
      fresh.current = false
      setEditing(false)
      if (changed) toast.success('Збережено')
    }
    const cancel = ref
      ? async (close?: () => void): Promise<void> => {
          // Pending saves must land before the revert, or they'd arrive after it and undo it.
          await flushAndSettle()
          const s = await snap.current
          if (s) {
            try {
              await api.records.revert({ ref, snapshot: s })
            } catch (e) {
              toast.error(`Не вдалося скасувати: ${(e as Error).message}`)
              return
            }
          }
          // A record created a moment ago and then cancelled shouldn't stay as an empty leftover.
          if (fresh.current) {
            const discarded = await api.trash.discardNew(ref).catch(() => false)
            invalidateAll()
            setEditing(false)
            if (discarded) {
              toast('Запис не створено')
              close?.()
            }
            return
          }
          invalidateAll()
          if (s) toast('Зміни скасовано')
          setEditing(false)
        }
      : undefined
    /** Leave editing (Esc): asks only when something actually changed. */
    const exit = (close?: () => void): void => {
      void hasChanges().then((changed) => {
        if (!changed) return fresh.current && cancel ? void cancel(close) : setEditing(false)
        useUi.getState().askClose({ keep: () => void save(), discard: () => void cancel?.(close) })
      })
    }
    const confirmClose = (close: () => void): void => {
      if (!editing || !ref) return close()
      void hasChanges().then((changed) => {
        // Untouched: just close (an untouched new record is removed by the pane's draft cleanup).
        if (!changed) return close()
        useUi.getState().askClose({
          keep: () => void save().then(close),
          discard: () => void cancel?.().then(close)
        })
      })
    }
    return { editing, setEditing, save, cancel, exit, confirmClose }
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

/**
 * «Редагувати» in view mode; «Скасувати» + «Зберегти» while editing. E edits, Esc leaves editing
 * (asks «Зберегти зміни?» when something changed). `onClose` closes the record after cancelling a new one.
 */
export function EditToggle({ mode, onClose }: { mode: DetailMode; onClose?: () => void }) {
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
      {/* Esc target for the global shortcut layer: invisible, but not display:none (offsetParent check). */}
      <Button
        variant="ghost"
        size="sm"
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        data-close-detail
        onClick={() => (mode.exit ? mode.exit(onClose) : mode.setEditing(false))}
      />
      {mode.cancel && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => void mode.cancel?.(onClose)}>
              <Undo2 /> Скасувати
            </Button>
          </TooltipTrigger>
          <TooltipContent>Повернути все як було до «Редагувати»</TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="lime" size="sm" data-save onClick={() => void (mode.save ? mode.save() : mode.setEditing(false))}>
            <Check /> Зберегти
          </Button>
        </TooltipTrigger>
        <TooltipContent>Зберегти й повернутися до перегляду · Esc</TooltipContent>
      </Tooltip>
    </span>
  )
}

/** «Зберегти зміни?» dialog for exit / confirmClose; mounted once in AppShell. Esc = keep editing. */
export function CloseConfirmHost() {
  const ask = useUi((s) => s.closeAsk)
  const clear = useUi((s) => s.askClose)
  return (
    <AlertDialog open={!!ask} onOpenChange={(o) => !o && clear(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Зберегти зміни?</AlertDialogTitle>
          <AlertDialogDescription>
            Запис змінено, але зміни ще не збережено. «Не зберігати» поверне все як було до «Редагувати».
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => {
              ask?.discard()
              clear(null)
            }}
          >
            Не зберігати
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              ask?.keep()
              clear(null)
            }}
          >
            Зберегти
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * Record editors inside a Sheet: Radix closes the sheet itself on Esc / outside click, bypassing
 * «Зберегти зміни?». The editor publishes its mode into this ref; the sheet routes closing through it.
 */
export function useModeRef(): RefObject<DetailMode | null> {
  return useRef<DetailMode | null>(null)
}

/** Call inside the editor: keeps the sheet's ref pointed at the current mode. */
export function usePublishMode(ref: RefObject<DetailMode | null> | undefined, mode: DetailMode): void {
  useEffect(() => {
    if (!ref) return
    ref.current = mode
    return () => {
      ref.current = null
    }
  }, [ref, mode])
}

/** `onOpenChange` for <Sheet> and `onEscapeKeyDown` for <SheetContent> of a record editor. */
export function guardSheet(ref: RefObject<DetailMode | null>, close: () => void) {
  return {
    onOpenChange: (open: boolean): void => {
      if (open) return
      const m = ref.current
      if (m?.confirmClose) m.confirmClose(close)
      else close()
    },
    onEscapeKeyDown: (e: KeyboardEvent): void => {
      const m = ref.current
      // Esc while editing leaves editing first (same as a DetailPane), the next Esc closes.
      if (m?.editing) {
        e.preventDefault()
        if (m.exit) m.exit(close)
        else m.setEditing(false)
      }
    }
  }
}
