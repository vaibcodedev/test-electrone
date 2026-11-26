import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Check } from 'lucide-react'
import { useAutosave } from '@/hooks/use-autosave'
import { cn } from '@/lib/utils'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'

/**
 * A text setting that saves while you type (as record fields do) and says so inside the field: «Збережено» with a
 * tick for a moment, only once main has accepted the value (a failed save shows the common error toast instead).
 * Saving only on blur, with no sign of it, left people asking whether it was kept.
 */
export function AutosaveInput({
  id,
  value,
  onSave,
  placeholder,
  maxLength,
  className
}: {
  id: string
  value: string
  /** Must start its mutation synchronously (useAutosave); null — nothing to save. */
  onSave: (next: string) => Promise<unknown> | null
  placeholder?: string
  maxLength?: number
  className?: string
}): ReactElement {
  const [saved, setSaved] = useState(false)
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** The latest edit: an answer to an older one says nothing about what is in the field now. */
  const edit = useRef(0)
  const forget = (): void => {
    if (hide.current) clearTimeout(hide.current)
    setSaved(false)
  }
  const [draft, setDraft] = useAutosave(value, (next: string) => {
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
  return (
    <InputGroup className={cn(className)}>
      <InputGroupInput
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
        autoComplete="off"
        spellCheck={false}
        className="text-ellipsis"
      />
      {/* Always in the tree so the screen reader hears the change; empty, it takes no room. */}
      <InputGroupAddon align="inline-end" className={cn(!saved && 'pr-0')}>
        <span role="status" className="flex items-center gap-1 text-caption font-normal">
          {saved && (
            <>
              <Check aria-hidden className="size-3.5 text-success" />
              Збережено
            </>
          )}
        </span>
      </InputGroupAddon>
    </InputGroup>
  )
}
