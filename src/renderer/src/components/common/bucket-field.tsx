import type { ReactElement } from 'react'
import { Choice, type ChoiceOption } from './choice'
import { Field } from './page'
import { useReadOnly } from './detail-mode-context'

/**
 * A labelled choice of fixed buckets for a value that used to be free text («Відгуків на вакансію», «Розмір»
 * компанії). An old text that means a bucket shows as that bucket; one that matches none stays the value — an
 * option of its own that can't be picked again — until a bucket replaces it, so nothing typed earlier is lost.
 */
export function BucketField<T extends string>({
  id,
  label,
  value,
  buckets,
  labels,
  bucketOf,
  onChange,
  placeholder
}: {
  id: string
  label: string
  /** The stored text: a bucket, '' or an old free text. */
  value: string
  buckets: readonly T[]
  labels: Record<T, string>
  /** Old free text → its bucket, or null. */
  bucketOf: (text: string) => T | null
  onChange: (value: T | '') => void
  placeholder?: string
}): ReactElement {
  const readOnly = useReadOnly()
  const bucket = bucketOf(value)
  const legacy = value && !bucket ? value : null
  const options: ChoiceOption<string>[] = buckets.map((b) => ({ value: b, label: labels[b] }))
  if (legacy) options.push({ value: legacy, label: legacy, disabled: true })
  return (
    <Field
      label={label}
      htmlFor={id}
      hint={
        legacy && !readOnly
          ? 'Записано вручну до появи списку — виберіть варіант, щоб замінити'
          : undefined
      }
    >
      <Choice
        id={id}
        value={bucket ?? legacy}
        options={options}
        none="Не вказано"
        placeholder={placeholder}
        onChange={(v) => onChange((v ?? '') as T | '')}
      />
    </Field>
  )
}
