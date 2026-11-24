import { useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { useApiMutation } from '@/lib/query'
import { wordInputSchema } from '@shared/domain/english'
import { limitsOf } from '@/lib/limits'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const EMPTY = { term: '', translation: '', example: '', context: '' }
const LIMITS = limitsOf(wordInputSchema)

/** Inline capture (shadcn Input + Button in a surface row): four fields, Enter anywhere saves. */
/** `onAdded` lets the page clear filters that would hide the new word. */
export function AddWordForm({ onAdded }: { onAdded?: () => void }) {
  const [form, setForm] = useState(EMPTY)
  const termRef = useRef<HTMLInputElement>(null)
  const create = useApiMutation('english', 'create', { successMessage: 'Слово додано' })

  const submit = (): void => {
    if (!form.term.trim()) return termRef.current?.focus()
    create.mutate(form, {
      onSuccess: () => {
        setForm(EMPTY)
        onAdded?.()
        termRef.current?.focus()
      }
    })
  }

  const field = (key: keyof typeof EMPTY) => ({
    value: form[key],
    maxLength: LIMITS[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        submit()
      }
    }
  })

  return (
    <form
      className="grid grid-cols-[1.1fr_1.1fr_1.6fr_1fr_auto] gap-2 rounded-3xl bg-surface p-2"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <Input ref={termRef} aria-label="Слово або фраза" placeholder="Слово, напр. rollout" className="bg-card" {...field('term')} />
      <Input aria-label="Переклад" placeholder="Переклад: викатка" className="bg-card" {...field('translation')} />
      <Input aria-label="Речення, де трапилося слово" title="Речення з листування чи коду, де трапилося слово" placeholder="Речення: We'll do a staged rollout" className="bg-card" {...field('example')} />
      <Input aria-label="Джерело" title="Де трапилося: чат, код-ревʼю, дзвінок" placeholder="Джерело: Slack, ревʼю…" className="bg-card" {...field('context')} />
      <Button type="submit" variant="lime" disabled={!form.term.trim() || create.isPending}>
        <Plus /> Додати
      </Button>
    </form>
  )
}
