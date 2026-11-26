import { useEffect, useRef, useState, type ReactElement } from 'react'
import { toast } from 'sonner'
import { CharCount } from '@/components/common/page'
import { DisabledHint } from '@/components/common/disabled-hint'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** No space at the start, one between words: spaces alone looked like an empty field that was somehow full. */
const tidy = (text: string): string => text.replace(/^\s+/, '').replace(/\s{2,}/g, ' ')

/** `tidy` applied to the field itself, with the caret left where the person was typing. */
function tidyInput(input: HTMLInputElement): string {
  const next = tidy(input.value)
  if (next !== input.value) {
    const caret = tidy(input.value.slice(0, input.selectionStart ?? input.value.length)).length
    input.value = next
    input.setSelectionRange(caret, caret)
  }
  return next
}

/**
 * A short text setting, read first like a record: the value and «Змінити»; editing is a field with «Зберегти»
 * (Enter) and «Скасувати» (Esc). A field standing open all the time read as something left to fill in.
 */
export function EditableSetting({
  label,
  value,
  emptyText,
  placeholder,
  maxLength,
  tooLong,
  onSave
}: {
  /** Names the field and the «Змінити» button for a screen reader. */
  label: string
  value: string
  /** Shown instead of an empty value. */
  emptyText: string
  placeholder?: string
  maxLength: number
  /** Why «Зберегти» is off for a value stored before the limit was lowered. */
  tooLong: string
  onSave: (next: string) => Promise<unknown>
}): ReactElement {
  /** The text being edited; null — reading. */
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const editButton = useRef<HTMLButtonElement>(null)
  /** The editor was closed by the person: focus goes back to «Змінити», which only now is on screen again. */
  const returnFocus = useRef(false)
  const editing = draft !== null
  useEffect(() => {
    if (editing || !returnFocus.current) return
    returnFocus.current = false
    editButton.current?.focus()
  }, [editing])

  const close = (): void => {
    returnFocus.current = true
    setDraft(null)
  }

  if (draft === null) {
    return (
      <>
        <span
          title={value || undefined}
          className={value ? 'max-w-80 truncate text-body' : 'text-body text-muted-foreground'}
        >
          {value || emptyText}
        </span>
        <Button
          ref={editButton}
          variant="soft"
          size="sm"
          aria-label={`Змінити: ${label}`}
          onClick={() => setDraft(tidy(value))}
        >
          Змінити
        </Button>
      </>
    )
  }

  const over = draft.length > maxLength
  const changed = draft.trim() !== value
  const save = async (): Promise<void> => {
    if (!changed || over || saving) return
    setSaving(true)
    try {
      await onSave(draft.trim())
      toast.success('Збережено')
      close()
    } catch {
      // Already reported by the mutation's error toast; the typed text stays to try again.
    } finally {
      setSaving(false)
    }
  }
  return (
    <form
      className="group/field flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        close()
      }}
    >
      <CharCount length={draft.length} max={maxLength} />
      <Input
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        aria-label={label}
        value={draft}
        onChange={(e) => setDraft(tidyInput(e.target))}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-invalid={over || undefined}
        autoComplete="off"
        spellCheck={false}
        className="w-64"
      />
      <DisabledHint reason={over ? tooLong : undefined}>
        <Button type="submit" variant="soft" size="sm" disabled={!changed || over || saving}>
          Зберегти
        </Button>
      </DisabledHint>
      <Button variant="soft" size="sm" onClick={close}>
        Скасувати
      </Button>
    </form>
  )
}
