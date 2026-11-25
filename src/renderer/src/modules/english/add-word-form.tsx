import { useId, useRef, useState, type ReactElement } from 'react'
import { Plus } from 'lucide-react'
import { useApiMutation } from '@/lib/query'
import { wordInputSchema } from '@shared/domain/english'
import { limitsOf } from '@/lib/limits'
import { Field } from '@/components/common/page'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'

const EMPTY = { term: '', translation: '', example: '', context: '' }
const LIMITS = limitsOf(wordInputSchema)

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
  const [missingTerm, setMissingTerm] = useState(false)
  const termRef = useRef<HTMLInputElement>(null)
  const id = useId()
  const errorId = `${id}-term-error`
  const create = useApiMutation('english', 'create', { successMessage: 'Слово додано' })

  const submit = (): void => {
    if (create.isPending) return
    if (!form.term.trim()) {
      // An untouched form (N, or «Додати» right away) just puts the cursor in «Слово»; the error is for a
      // word that was really started without its term.
      if (Object.values(form).some((v) => v.trim())) setMissingTerm(true)
      termRef.current?.focus()
      return
    }
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
        className="grid grid-cols-2 items-end gap-2 rounded-3xl bg-surface p-3 @3xl:grid-cols-[1.1fr_1.1fr_1.6fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        {FIELDS.map(({ key, label, placeholder }) => {
          const invalid = key === 'term' && missingTerm
          return (
            <Field key={key} label={label} htmlFor={`${id}-${key}`}>
              <Input
                id={`${id}-${key}`}
                ref={key === 'term' ? termRef : undefined}
                value={form[key]}
                maxLength={LIMITS[key]}
                placeholder={placeholder}
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? errorId : undefined}
                onChange={(e) => {
                  setForm((f) => ({ ...f, [key]: e.target.value }))
                  if (key === 'term' && e.target.value.trim()) setMissingTerm(false)
                }}
              />
            </Field>
          )
        })}
        <Button type="submit" variant="lime" disabled={create.isPending} className="col-span-2 justify-self-end @3xl:col-span-1">
          <Plus /> Додати
        </Button>
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
