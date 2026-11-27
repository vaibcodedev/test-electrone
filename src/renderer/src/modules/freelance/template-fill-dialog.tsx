import { useMemo, useState, type ReactElement } from 'react'
import { MAX } from '@shared/domain/limits'
import { versionLabel } from '@shared/domain/freelance'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldLabel } from '@/components/ui/field'
import { FormDialog } from '@/components/common/form-dialog'
import { fillTemplate, templateVariables, variableLabel } from './g2-labels'
import { freshOnOpen } from '@/components/common/fresh-on-open'
import { Segmented } from '@/components/common/page'

/**
 * Fills a template's {variables} before its text is used: one field per variable (named in Ukrainian, the raw
 * `{name}` next to it), the finished text below. Empty ones stay in braces. Shared by «Скопіювати» on the
 * templates page and «Вставити» in a proposal. `initial` pre-fills what Vault already knows (the person's name).
 * `versions` (translations…) adds a switch on top, starting at `initialVersion`; the variables and the text follow
 * the chosen version, values typed so far stay.
 */
function TemplateFillDialogForm({
  open,
  onOpenChange,
  heading,
  title,
  body,
  versions,
  initialVersion = 0,
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
  /** The text when there is one version (or `versions` is not given). */
  body: string
  versions?: { name: string; body: string }[]
  initialVersion?: number
  submitLabel: string
  onSubmit: (filled: string) => void | Promise<unknown>
  initial?: Record<string, string>
}): ReactElement {
  const [version, setVersion] = useState(() =>
    versions ? Math.min(Math.max(initialVersion, 0), versions.length - 1) : 0
  )
  const text = versions?.[version]?.body ?? body
  const vars = useMemo(() => templateVariables(text), [text])
  const [values, setValues] = useState<Record<string, string>>({})
  const merged = { ...initial, ...values }
  const filled = fillTemplate(text, merged)
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
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
      {versions && versions.length > 1 && (
        <Segmented
          label="Версія"
          size="xs"
          className="data-[variant=segment]:flex-wrap"
          value={String(version)}
          onChange={(v) => setVersion(Number(v))}
          options={versions.map((v, i) => ({ value: String(i), label: versionLabel(v.name) }))}
        />
      )}
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

/** Opens clean every time: created anew on each opening (freshOnOpen). */
export const TemplateFillDialog = freshOnOpen(TemplateFillDialogForm)
