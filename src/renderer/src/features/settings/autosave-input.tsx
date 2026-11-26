import { useEffect, useId, useRef, useState, type ReactElement } from 'react'
import { Check } from 'lucide-react'
import { useAutosave } from '@/hooks/use-autosave'
import { cn } from '@/lib/utils'
import { CharCount } from '@/components/common/page'
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

/**
 * A short text setting that saves while you type (as record fields do). Under the field: «Збережено» with a tick
 * for a moment, only once main has accepted the value (a failed save shows the common error toast instead), and
 * the common «N / max» counter. The line takes no room from the typed text, and the field stays centred in the row.
 * Saving only on blur, with no sign of it, left people asking whether it was kept.
 */
export function AutosaveInput({
  id,
  value,
  onSave,
  placeholder,
  maxLength,
  tooLong,
  className
}: {
  id: string
  value: string
  /** Must start its mutation synchronously (useAutosave); null — nothing to save. */
  onSave: (next: string) => Promise<unknown> | null
  placeholder?: string
  maxLength: number
  /** Shown instead of the status for a value stored before the limit was lowered: it is not saved until shorter. */
  tooLong: string
  className?: string
}): ReactElement {
  const [saved, setSaved] = useState(false)
  const errorId = useId()
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** The latest edit: an answer to an older one says nothing about what is in the field now. */
  const edit = useRef(0)
  const forget = (): void => {
    if (hide.current) clearTimeout(hide.current)
    setSaved(false)
  }
  const [draft, setDraft] = useAutosave(value, (next: string) => {
    if (next.trim().length > maxLength) return
    const sentAt = edit.current
    void onSave(next.trim())?.then(
      () => {
        if (edit.current !== sentAt) return
        setSaved(true)
        hide.current = setTimeout(() => setSaved(false), 2000)
      },
      // Already reported by the mutation's error toast.
      () => undefined
    )
  })
  useEffect(() => () => void (hide.current && clearTimeout(hide.current)), [])
  const over = draft.length > maxLength
  return (
    <div className={cn('group/field relative -my-2 py-5', className)}>
      <Input
        id={id}
        value={draft}
        onChange={(e) => {
          edit.current++
          forget()
          setDraft(e.target.value)
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-invalid={over || undefined}
        aria-describedby={over ? errorId : undefined}
        autoComplete="off"
        spellCheck={false}
        className="text-ellipsis"
      />
      <div className="absolute inset-x-3 bottom-0 flex h-4 items-center justify-between gap-2">
        {over ? (
          <FieldError id={errorId} className="truncate text-meta">
            {tooLong}
          </FieldError>
        ) : (
          // Always in the tree so the screen reader hears the change.
          <span role="status" className="flex items-center gap-1 text-meta text-muted-foreground">
            {saved && (
              <>
                <Check aria-hidden className="size-3 text-success" />
                Збережено
              </>
            )}
          </span>
        )}
        <CharCount length={draft.length} max={maxLength} className="ml-auto" />
      </div>
    </div>
  )
}
