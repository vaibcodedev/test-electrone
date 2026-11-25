import { useId, useRef, useState, type ReactElement } from 'react'
import { Plus } from 'lucide-react'
import { useApiMutation } from '@/lib/query'
import { wordInputSchema } from '@shared/domain/english'
import { limitsOf, requiredOf } from '@/lib/limits'
import { Field } from '@/components/common/page'
import { SubmitButton } from '@/components/common/submit-button'
import { useFormGate } from '@/hooks/use-form-gate'
import { Input } from '@/components/ui/input'
import { FieldError } from '@/components/ui/field'

const EMPTY = { term: '', translation: '', example: '', context: '' }
const LIMITS = limitsOf(wordInputSchema)
const REQUIRED = requiredOf(wordInputSchema)

/** Same names as in the word card: what was typed here is recognised there. */
const FIELDS: { key: keyof typeof EMPTY; label: string; placeholder: string }[] = [
  { key: 'term', label: 'Слово', placeholder: 'Напр.: rollout' },
  { key: 'translation', label: 'Переклад', placeholder: 'Напр.: викатка' },
  { key: 'example', label: 'Приклад', placeholder: "Напр.: We'll do a staged rollout" },
  { key: 'context', label: 'Джерело', placeholder: 'Напр.: Slack, PR' }
]

/**
 * Inline capture in a surface row: four labelled fields, Enter in any of them saves (form submit).
 * `onAdded` lets the page clear filters that would hide the new word.
 */
export function AddWordForm({ onAdded }: { onAdded?: () => void }): ReactElement {
  const [form, setForm] = useState(EMPTY)
  const termRef = useRef<HTMLInputElement>(null)
  const id = useId()
  const errorId = `${id}-term-error`
  const create = useApiMutation('english', 'create', { successMessage: 'Слово додано' })
  // «Слово» is required: «Додати» is off until it is typed; Enter without it puts the cursor there and says so.
  const { attach, reason, attempted, submit } = useFormGate()
  const missingTerm = attempted && !form.term.trim()

  const send = (): void => {
    if (create.isPending) return
    create.mutate(form, {
      onSuccess: () => {
        setForm(EMPTY)
        onAdded?.()
        termRef.current?.focus()
      }
    })
  }

  return (
    // Container query: on a narrow window «Приклад» and «Джерело» move to a second line instead of clipping.
    <div className="@container">
      <form
        ref={attach}
        className="grid grid-cols-2 items-end gap-2 rounded-3xl bg-surface p-3 @3xl:grid-cols-[1.1fr_1.1fr_1.6fr_1fr_auto]"
        onSubmit={(e) => submit(e, send)}
      >
        {FIELDS.map(({ key, label, placeholder }) => {
          const invalid = key === 'term' && missingTerm
          return (
            <Field key={key} label={label} htmlFor={`${id}-${key}`}>
              <Input
                id={`${id}-${key}`}
                ref={key === 'term' ? termRef : undefined}
                // N puts the cursor here: «Додати» is off while the form is empty, so N can't press it.
                data-page-new={key === 'term' || undefined}
                required={(key === 'term' && REQUIRED.term) || undefined}
                value={form[key]}
                maxLength={LIMITS[key]}
                placeholder={placeholder}
                aria-invalid={invalid || undefined}
                data-missing={invalid || undefined}
                aria-describedby={invalid ? errorId : undefined}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </Field>
          )
        })}
        {/* The grid cell is a wrapper: a disabled button sits inside its reason's tooltip span. */}
        <div className="col-span-2 justify-self-end @3xl:col-span-1">
          <SubmitButton variant="lime" reason={reason} pending={create.isPending}>
            <Plus /> Додати
          </SubmitButton>
        </div>
        {/* Its own row under the fields: inside the «Слово» field it lifted that one above the rest (items-end). */}
        {missingTerm && (
          <FieldError id={errorId} className="col-span-full text-caption">
            Введіть слово або фразу
          </FieldError>
        )}
      </form>
    </div>
  )
}
