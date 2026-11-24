import type { ReactElement } from 'react'
import { ExternalLink } from 'lucide-react'
import { useAutosave } from '@/hooks/use-autosave'
import { isLikelyUrl, URL_ERROR } from '@/lib/limits'
import { normalizeUrl, openUrl } from '@/lib/open-url'
import { Input } from '@/components/ui/input'
import { FieldError } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Field } from '@/components/common/page'
import { useReadOnly } from '@/components/common/detail-mode-context'

/**
 * Labelled one-line text field that autosaves the record. In view mode the input renders as text
 * (CSS of the shared `Input`). `maxLength` comes from the schema (`limitsOf`).
 */
export function TextField({
  label,
  value,
  onSave,
  placeholder,
  className,
  maxLength
}: {
  label: string
  value: string
  onSave: (v: string) => void
  placeholder?: string
  className?: string
  /** From the schema via limitsOf(): the input stops where the server would reject. */
  maxLength?: number
}): ReactElement {
  const [draft, setDraft] = useAutosave(value, onSave)
  return (
    <Field label={label} className={className}>
      <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} maxLength={maxLength} />
    </Field>
  )
}

/**
 * URL input that autosaves, with an «open in browser» button. Typing is never blocked; a value that
 * doesn't look like a link shows URL_ERROR under the field and is not saved; a link typed without a
 * scheme is saved with `https://` (docs/design-system.md → Формы). With `label` it is a whole
 * `Field`; without it, put it inside your own `Field`. The error is hidden in view mode.
 */
export function LinkInput({
  value,
  onSave,
  label,
  placeholder = 'https://…',
  maxLength = 2000,
  strict = true,
  openLabel = 'Відкрити посилання'
}: {
  value: string
  onSave: (v: string) => void
  label?: string
  placeholder?: string
  maxLength?: number
  /** false: links or plain text are both fine (e.g. "call link or office address"). */
  strict?: boolean
  /** aria-label of the open button: «Відкрити вакансію»… */
  openLabel?: string
}): ReactElement {
  const readOnly = useReadOnly()
  const [draft, setDraft] = useAutosave(value, (v) => {
    if (!strict || isLikelyUrl(v)) onSave(strict ? normalizeUrl(v) : v.trim())
  })
  const bad = strict && !isLikelyUrl(draft)
  const canOpen = !bad && /^https?:\/\//i.test(draft.trim())
  const input = (
    <InputGroup>
      <InputGroupInput
        type={strict ? 'url' : 'text'}
        inputMode={strict ? 'url' : undefined}
        spellCheck={false}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-label={label}
        aria-invalid={bad || undefined}
      />
      {canOpen && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" className="rounded-full" aria-label={openLabel} onClick={() => void openUrl(draft)}>
            <ExternalLink />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  )
  if (label)
    return (
      <Field label={label} error={bad ? URL_ERROR : undefined}>
        {input}
      </Field>
    )
  return (
    <>
      {input}
      {bad && !readOnly && <FieldError className="text-caption">{URL_ERROR}</FieldError>}
    </>
  )
}
