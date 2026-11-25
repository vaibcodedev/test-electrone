import { useMemo, useState, type ReactElement } from 'react'
import { MAX } from '@shared/domain/limits'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldLabel } from '@/components/ui/field'
import { FormDialog } from '@/components/common/form-dialog'
import { fillTemplate, templateVariables, variableLabel } from './g2-labels'

/**
 * Fills a template's {variables} before its text is used: one field per variable (named in Ukrainian, the raw
 * `{name}` next to it), the finished text below. Empty ones stay in braces. Shared by «Скопіювати» on the
 * templates page and «Вставити» in a proposal. `initial` pre-fills what Vault already knows (the person's name).
 */
export function TemplateFillDialog({
  open,
  onOpenChange,
  heading,
  title,
  body,
  submitLabel,
  onSubmit,
  initial
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The dialog's own title: «Скопіювати шаблон», «Вставити шаблон». */
  heading: string
  /** The template's name, shown in the body (a long one without spaces ran under ✕ in the title). */
  title: string
  body: string
  submitLabel: string
  onSubmit: (filled: string) => void | Promise<unknown>
  initial?: Record<string, string>
}): ReactElement {
  const vars = useMemo(() => templateVariables(body), [body])
  const [values, setValues] = useState<Record<string, string>>({})
  const merged = { ...initial, ...values }
  const filled = fillTemplate(body, merged)
  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) setValues({})
      }}
      title={heading}
      description={
        vars.length
          ? 'Заповніть змінні — порожні лишаться у фігурних дужках.'
          : 'Змінних немає, текст піде як є.'
      }
      submitLabel={submitLabel}
      onSubmit={() => onSubmit(filled)}
      className="sm:max-w-2xl"
    >
      <p className="line-clamp-2 text-body font-medium wrap-anywhere" title={title}>
        {title}
      </p>
      {vars.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {vars.map((v, i) => (
            <Field key={v} className="gap-1.5">
              <FieldLabel
                htmlFor={`var-${v}`}
                className="flex w-full min-w-0 flex-wrap items-baseline justify-between gap-x-2"
              >
                <span className="min-w-0">{variableLabel(v)}</span>
                <span
                  className="min-w-0 truncate font-mono text-meta font-normal text-muted-foreground"
                  title={`{${v}}`}
                >
                  {`{${v}}`}
                </span>
              </FieldLabel>
              <Input
                id={`var-${v}`}
                autoFocus={i === 0}
                value={merged[v] ?? ''}
                maxLength={MAX.title}
                onChange={(e) => setValues((s) => ({ ...s, [v]: e.target.value }))}
              />
            </Field>
          ))}
        </div>
      )}
      <Field className="gap-1.5">
        <FieldLabel htmlFor="template-filled">Готовий текст</FieldLabel>
        <Textarea
          id="template-filled"
          readOnly
          value={filled}
          className="max-h-72 min-h-32 text-body leading-relaxed"
        />
      </Field>
    </FormDialog>
  )
}
