import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject
} from 'react'
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
import { reportError } from '@/lib/error-reporting'
import { flushAndSettle, invalidateAll } from '@/lib/query'
import { resetAllAutosaves } from '@/hooks/use-autosave'
import { Check, Pencil, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { cn } from '@/lib/utils'
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
  // Peek during render, take after commit: a render React throws away (Suspense while the record loads) must
  // not eat the one-shot flag, or the mounted editor opens a just-created record in view mode.
  const [isNew] = useState(() => !!useUi.getState().justCreated[id])
  useEffect(() => {
    if (isNew) useUi.getState().takeCreated(id)
  }, [id, isNew])
  const [editing, setEditing] = useState(isNew)
  // State, not a ref: the context must see «no longer fresh» after «Зберегти», or a title re-mounted on E
  // would select itself again.
  const [fresh, setFresh] = useState(isNew)
  // The snapshot is a promise: «Скасувати» pressed before it arrived waits for it instead of reverting nothing.
  const snap = useRef<Promise<RecordSnapshot | null>>(Promise.resolve(null))
  // Open inline forms (holdOpen): a ref, not state — registering one must not rebuild the mode for everyone.
  const openForms = useRef(new Map<symbol, string | undefined>())

  useEffect(() => {
    if (!editing || !type) {
      snap.current = Promise.resolve(null)
      return
    }
    snap.current = api.records.snapshot({ type, id }).catch((e) => {
      reportError(e, 'detail-mode:snapshot')
      // Without a snapshot «Скасувати» can't revert: say so now, not silently later.
      toast.warning('«Скасувати» зараз недоступне — зміни зберігатимуться одразу')
      return null
    })
  }, [editing, id, type])

  return useMemo<DetailMode>(() => {
    const ref = type ? { type, id } : null
    // Unsaved-edit failures from the last flush (server rejected a field): saving must not pretend success.
    let lastFailed = 0
    /** Pending autosaves first, then ask the server whether anything differs from the snapshot. */
    const hasChanges = async (): Promise<boolean> => {
      // Wait for the saves to land: otherwise «changed» is asked before the last keystrokes reach main.
      lastFailed = (await flushAndSettle()).failed
      // An open inline form is an unsaved change: leaving asks instead of dropping what was typed in it.
      if (openForms.current.size) return true
      const s = await snap.current
      if (!ref || !s) return false
      return api.records.changed({ ref, snapshot: s }).catch((e) => {
        reportError(e, 'detail-mode:changed')
        return false
      })
    }
    const save = async (): Promise<boolean> => {
      const changed = await hasChanges()
      if (lastFailed > 0) {
        // The field's own error toast already said what; stay in edit mode so the text isn't lost.
        toast.error('Не все збережено — виправте поле з помилкою й натисніть «Зберегти» ще раз')
        return false
      }
      if (openForms.current.size) {
        // Leaving edit mode closes inline forms: «Зберегти» would drop the typed stage / login and say «Збережено».
        const what = [...openForms.current.values()].find(Boolean)
        toast.warning(`Спершу додайте або скасуйте ${what ?? 'відкриту форму'}`)
        return false
      }
      setFresh(false)
      setEditing(false)
      if (changed) toast.success('Збережено')
      return true
    }
    const cancel = ref
      ? async (close?: () => void): Promise<boolean> => {
          // Pending saves must land before the revert, or they'd arrive after it and undo it.
          await flushAndSettle()
          const s = await snap.current
          if (s) {
            try {
              await api.records.revert({ ref, snapshot: s })
            } catch (e) {
              // The technical reason goes to the log, not to the person.
              toast.error('Не вдалося скасувати зміни. Спробуйте ще раз.')
              reportError(e, 'detail-mode:revert')
              return false
            }
            resetAllAutosaves()
          }
          // A record created a moment ago and then cancelled shouldn't stay as an empty leftover.
          if (fresh) {
            const discarded = await api.trash.discardNew(ref).catch((e) => {
              reportError(e, 'detail-mode:discardNew')
              return false
            })
            invalidateAll()
            setEditing(false)
            if (discarded) {
              toast('Запис не створено')
              close?.()
            }
            return true
          }
          invalidateAll()
          if (s) toast('Зміни скасовано')
          setEditing(false)
          return true
        }
      : undefined
    /**
     * An untouched new record left by Esc / ✕: only an empty draft (a DRAFT_TITLES name, nothing else — the
     * server checks) disappears. A name typed before creating it (quick add, a form) keeps the record:
     * only «Скасувати» means «don't create it». true — the draft is gone.
     */
    const dropDraft = (): Promise<boolean> =>
      ref
        ? api.trash.discardDraft(ref).then(
            (gone) => {
              if (gone) invalidateAll()
              return gone
            },
            (e) => {
              reportError(e, 'detail-mode:discardDraft')
              return false
            }
          )
        : Promise.resolve(false)
    /** Leave editing (Esc): asks only when something actually changed. */
    const exit = (close?: () => void): void => {
      void hasChanges().then((changed) => {
        if (!changed) {
          if (!fresh) return setEditing(false)
          return void dropDraft().then((gone) => {
            setFresh(false)
            setEditing(false)
            if (gone) {
              toast('Запис не створено')
              close?.()
            }
          })
        }
        // A variable, not a literal: `fresh` changes the dialog's description (CloseConfirmHost).
        const ask = { keep: () => void save(), discard: () => void cancel?.(close), fresh }
        useUi.getState().askClose(ask)
      })
    }
    const confirmClose = (close: () => void): void => {
      if (!editing || !ref) return close()
      void hasChanges().then((changed) => {
        // Untouched: just close; an untouched new record goes only if it is an empty draft (sheets and pages
        // have no pane cleanup of their own).
        if (!changed) {
          if (fresh) void dropDraft()
          return close()
        }
        const ask = {
          // A rejected field or a failed revert keeps the record open, so the typed text isn't lost.
          keep: () => void save().then((ok) => ok && close()),
          discard: () => void cancel?.().then((ok) => ok && close()),
          fresh
        }
        useUi.getState().askClose(ask)
      })
    }
    const holdOpen = (what?: string): (() => void) => {
      const key = Symbol()
      openForms.current.set(key, what)
      return () => void openForms.current.delete(key)
    }
    return { editing, setEditing, fresh, save, cancel, exit, confirmClose, holdOpen }
  }, [editing, fresh, id, type])
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
          <Button variant="soft" size="sm" data-edit-detail onClick={() => mode.setEditing(true)}>
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
            <Button variant="soft" size="sm" onClick={() => void mode.cancel?.(onClose)}>
              <Undo2 /> Скасувати
            </Button>
          </TooltipTrigger>
          {/* A record created a moment ago is not reverted but discarded («Запис не створено»). */}
          <TooltipContent>
            {mode.fresh ? 'Не створювати запис' : 'Повернути все як було до «Редагувати»'}
          </TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="lime"
            size="sm"
            data-save
            onClick={() => void (mode.save ? mode.save() : mode.setEditing(false))}
          >
            <Check /> Зберегти
          </Button>
        </TooltipTrigger>
        {/* No «· Esc»: Esc leaves editing and asks «Зберегти зміни?», it doesn't save. */}
        <TooltipContent>Зберегти й повернутися до перегляду</TooltipContent>
      </Tooltip>
    </span>
  )
}

/** «Натисніть «Редагувати» або E, щоб …» — the one wording of «fill this in» (DetailPane's empty hint too). */
export function EditHintText({ action = 'додати' }: { action?: string }): ReactElement {
  return (
    <>
      Натисніть «Редагувати» або <Kbd>E</Kbd>, щоб {action}.
    </>
  )
}

/**
 * An empty section in view mode: what is missing + how to add it («Етапів ще немає. Натисніть «Редагувати» або E,
 * щоб додати.»). `children` is the first sentence, with its full stop.
 */
export function EditHint({
  children,
  action,
  className
}: {
  children: ReactNode
  action?: string
  className?: string
}): ReactElement {
  return (
    <p className={cn('text-body leading-relaxed text-muted-foreground', className)}>
      {children} <EditHintText action={action} />
    </p>
  )
}

/** «Зберегти зміни?» dialog for exit / confirmClose; mounted once in AppShell. Esc = keep editing. */
export function CloseConfirmHost() {
  const ask = useUi((s) => s.closeAsk)
  const clear = useUi((s) => s.askClose)
  // A record created a moment ago isn't reverted by «Не зберігати» but not created at all (exit / confirmClose).
  const fresh = !!ask && 'fresh' in ask && ask.fresh === true
  return (
    <AlertDialog open={!!ask} onOpenChange={(o) => !o && clear(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Зберегти зміни?</AlertDialogTitle>
          <AlertDialogDescription>
            {fresh
              ? 'Запис ще не збережено. «Не зберігати» його не створить.'
              : 'Запис змінено, але зміни ще не збережено. «Не зберігати» поверне все як було до «Редагувати».'}
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
export function usePublishMode(
  ref: RefObject<DetailMode | null> | undefined,
  mode: DetailMode
): void {
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
