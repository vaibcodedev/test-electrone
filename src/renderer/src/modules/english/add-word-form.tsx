import { useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { useApiMutation } from '@/lib/query'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const EMPTY = { term: '', translation: '', example: '', context: '' }

/** Inline capture (shadcn Input + Button in a surface row): four fields, Enter anywhere saves. */
export function AddWordForm() {
  const [form, setForm] = useState(EMPTY)
  const termRef = useRef<HTMLInputElement>(null)
  const create = useApiMutation('english', 'create', { successMessage: 'Слово добавлено' })

  const submit = (): void => {
    if (!form.term.trim()) return termRef.current?.focus()
    create.mutate(form, {
      onSuccess: () => {
        setForm(EMPTY)
        termRef.current?.focus()
      }
    })
  }

  const field = (key: keyof typeof EMPTY) => ({
    value: form[key],
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
      <Input ref={termRef} aria-label="Слово или фраза" placeholder="Слово или фраза" className="bg-card" {...field('term')} />
      <Input aria-label="Перевод" placeholder="Перевод" className="bg-card" {...field('translation')} />
      <Input aria-label="Пример из работы" placeholder="Пример из работы" className="bg-card" {...field('example')} />
      <Input aria-label="Где встретил" placeholder="Где встретил" className="bg-card" {...field('context')} />
      <Button type="submit" variant="lime" disabled={!form.term.trim() || create.isPending}>
        <Plus /> Добавить
      </Button>
    </form>
  )
}
