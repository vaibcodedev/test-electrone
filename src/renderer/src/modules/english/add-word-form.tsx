import { useId, useRef, useState, type ReactElement } from 'react'
import { Plus } from 'lucide-react'
import { useApiMutation } from '@/lib/query'
import { wordInputSchema } from '@shared/domain/english'
import { limitsOf } from '@/lib/limits'
import { Field } from '@/components/common/page'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const EMPTY = { term: '', translation: '', example: '', context: '' }
const LIMITS = limitsOf(wordInputSchema)

const FIELDS: { key: keyof typeof EMPTY; label: string; placeholder: string }[] = [
  { key: 'term', label: 'Слово', placeholder: 'rollout' },
  { key: 'translation', label: 'Переклад', placeholder: 'викатка' },
  { key: 'example', label: 'Речення', placeholder: "We'll do a staged rollout" },
  { key: 'context', label: 'Джерело', placeholder: 'Slack' }
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
  const create = useApiMutation('english', 'create', { successMessage: 'Слово додано' })

  const submit = (): void => {
    if (create.isPending) return
    if (!form.term.trim()) {
      setMissingTerm(true)
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
    // Container query: on a narrow window «Речення» and «Джерело» move to a second line instead of clipping.
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
            <Field key={key} label={label} htmlFor={`${id}-${key}`} error={invalid ? 'Введіть слово або фразу' : undefined}>
              <Input
                id={`${id}-${key}`}
                ref={key === 'term' ? termRef : undefined}
                value={form[key]}
                maxLength={LIMITS[key]}
                placeholder={placeholder}
                aria-invalid={invalid || undefined}
                className="bg-card"
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
      </form>
    </div>
  )
}
