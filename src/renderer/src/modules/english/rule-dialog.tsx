import { useId, useState, type ReactElement } from 'react'
import { wordInputSchema } from '@shared/domain/english'
import { useApiMutation } from '@/lib/query'
import { limitsOf, requiredOf } from '@/lib/limits'
import { freshOnOpen } from '@/components/common/fresh-on-open'
import { FormDialog } from '@/components/common/form-dialog'
import { Field } from '@/components/common/page'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { gapsSummary } from './labels'

const LIMITS = limitsOf(wordInputSchema)
const REQUIRED = requiredOf(wordInputSchema)

function RuleDialogForm({
  open,
  onOpenChange,
  onCreated
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (id: string) => void
}): ReactElement {
  const id = useId()
  const [form, setForm] = useState({ term: '', translation: '', example: '' })
  const create = useApiMutation('english', 'create', {
    successMessage: 'Правило створено',
    openInEdit: false
  })
  const set = (key: keyof typeof form, value: string): void =>
    setForm((f) => ({ ...f, [key]: value }))

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Нове правило"
      description="Коротко правило і кілька речень-прикладів: тренування зробить з них картки «заповни пропуск»."
      submitLabel="Створити правило"
      pending={create.isPending}
      className="sm:max-w-xl"
      onSubmit={() =>
        create.mutate(
          { ...form, kind: 'rule' },
          {
            onSuccess: (rule) => {
              onOpenChange(false)
              onCreated(rule.id)
            }
          }
        )
      }
    >
      <Field label="Назва" htmlFor={`${id}-term`} required={REQUIRED.term}>
        <Input
          id={`${id}-term`}
          autoFocus
          value={form.term}
          maxLength={LIMITS.term}
          placeholder="Напр.: Past Simple"
          onChange={(e) => set('term', e.target.value)}
        />
      </Field>
      <Field label="Правило" htmlFor={`${id}-rule`}>
        <Textarea
          id={`${id}-rule`}
          value={form.translation}
          maxLength={LIMITS.translation}
          placeholder="Напр.: Завершена дія в минулому: дієслово + -ed або друга форма неправильного"
          onChange={(e) => set('translation', e.target.value)}
        />
      </Field>
      <Field label="Приклади" htmlFor={`${id}-examples`} hint={gapsSummary(form.example)}>
        <Textarea
          id={`${id}-examples`}
          value={form.example}
          maxLength={LIMITS.example}
          className="min-h-28"
          placeholder={'Yesterday I [went|go] home.\nShe [didn’t/did not] call me.'}
          onChange={(e) => set('example', e.target.value)}
        />
      </Field>
    </FormDialog>
  )
}

/** «Правило» in the English header: a grammar entry with fill-the-gap examples. */
export const RuleDialog = freshOnOpen(RuleDialogForm)
