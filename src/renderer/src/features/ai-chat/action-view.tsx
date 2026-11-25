import { Fragment, useId, type ReactElement, type ReactNode } from 'react'
import {
  AI_ACTION_SCHEMAS,
  AI_ACTIONS,
  parseLocalWhen,
  type AiAction
} from '@shared/domain/ai-actions'
import type { AiActionPreview } from '@shared/domain/ai-chat'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { CodeBlock } from '@/components/common/code'
import { EventDate } from '@/components/common/event-date'
import { Markdown } from '@/components/common/markdown'
import { Field } from '@/components/common/page'
import { templateVariables, variableLabel } from '@/modules/freelance/g2-labels'
import { limitsOf } from '@/lib/limits'
import { cn } from '@/lib/utils'
import { isList, rawOf, summaryOf, teaserOf, whenOf, type RawEdits } from './action-text'

/** The card's teaser lines: code keeps its font, the rest is quiet text. */
export function Teaser({ action }: { action: AiAction }): ReactElement | null {
  const lines = teaserOf(action)
  if (!lines.length) return null
  const code = action.type === 'create_snippet' || action.type === 'create_component'
  const list =
    action.type === 'create_checklist' ||
    (action.type === 'create_card' && action.checks.length > 0)
  return (
    <ul
      className={cn(
        'flex min-w-0 flex-col gap-0.5 text-caption text-muted-foreground',
        code && 'font-mono'
      )}
    >
      {lines.map((l, i) => (
        <li key={i} className="truncate">
          {list ? `· ${l}` : l}
        </li>
      ))}
    </ul>
  )
}

/* ───────────── The full preview: the record as it will look ───────────── */

/** {variables} of a template stand out in its text, as when the template is filled in. */
function TemplateText({ text }: { text: string }): ReactElement {
  const parts = text.split(/(\{[\p{L}\w-]+\})/gu)
  return (
    <p className="text-lead leading-relaxed whitespace-pre-wrap wrap-anywhere">
      {parts.map((p, i) =>
        /^\{[\p{L}\w-]+\}$/u.test(p) ? (
          <mark key={i} className="rounded-md bg-foreground/10 px-1 font-medium text-foreground">
            {p}
          </mark>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        )
      )}
    </p>
  )
}

/** A labelled block of the record, as the module shows it while reading. */
function Part({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h3 className="text-caption font-semibold text-muted-foreground">{label}</h3>
      {children}
    </section>
  )
}

function Md({ label, text }: { label: string; text: string }): ReactElement | null {
  if (!text.trim()) return null
  return (
    <Part label={label}>
      <Markdown source={text} />
    </Part>
  )
}

function Plain({ label, text }: { label: string; text: string }): ReactElement | null {
  if (!text.trim()) return null
  return (
    <Part label={label}>
      <p className="text-lead leading-relaxed whitespace-pre-wrap wrap-anywhere">{text}</p>
    </Part>
  )
}

/** Checklist rows as on the «Чек-листи» page: a box per step (not tickable here), the hint under it. */
function CheckRows({
  items
}: {
  items: (string | { text: string; hint?: string })[]
}): ReactElement {
  const base = useId()
  return (
    <ul className="flex flex-col gap-1">
      {items.map((raw, i) => {
        const it = typeof raw === 'string' ? { text: raw, hint: '' } : raw
        const id = `${base}-${i}`
        return (
          <li key={id} className="flex items-start gap-3 rounded-xl px-1 py-1.5">
            <Checkbox
              id={id}
              disabled
              className="mt-0.5"
              aria-describedby={it.hint ? `${id}-hint` : undefined}
            />
            <label htmlFor={id} className="min-w-0">
              <span className="text-lead leading-snug">{it.text}</span>
              {it.hint && (
                <span id={`${id}-hint`} className="mt-0.5 block text-caption text-muted-foreground">
                  {it.hint}
                </span>
              )}
            </label>
          </li>
        )
      })}
    </ul>
  )
}

/** The content under the title, per record type. */
function Body({
  action,
  preview
}: {
  action: AiAction
  preview: AiActionPreview
}): ReactElement | null {
  switch (action.type) {
    case 'create_checklist':
      return (
        <>
          {action.description && (
            <p className="text-body text-muted-foreground whitespace-pre-wrap">
              {action.description}
            </p>
          )}
          {action.sections.map((s, i) => (
            <section key={i} className="flex flex-col gap-1">
              <h3 className="px-1 font-display text-heading">{s.title || 'Без розділу'}</h3>
              <CheckRows items={s.items} />
            </section>
          ))}
        </>
      )
    case 'create_idea':
      return <Md label="Текст" text={action.body} />
    case 'create_note':
      return <Md label="Текст" text={action.body} />
    case 'append_text':
      return (
        <Part label={`Буде додано в кінець запису «${preview.title}»`}>
          <Markdown source={action.text} />
        </Part>
      )
    case 'add_tags':
      return (
        <Part label={`Мітки для «${preview.title}»`}>
          <div className="flex flex-wrap gap-1.5">
            {action.tags.map((t) => (
              <Badge key={t} variant="soft">
                {t}
              </Badge>
            ))}
          </div>
        </Part>
      )
    case 'create_snippet':
    case 'create_component':
      return (
        <>
          <Plain label="Опис" text={action.description} />
          <Part label="Код">
            <CodeBlock code={action.code || ' '} language={action.language} />
          </Part>
        </>
      )
    case 'create_card':
      return (
        <>
          <Md label="Опис" text={action.description} />
          {action.checks.length > 0 && (
            <Part label="Підзадачі">
              <CheckRows items={action.checks} />
            </Part>
          )}
        </>
      )
    case 'create_event':
      return <Plain label="Опис" text={action.description} />
    case 'create_board':
      return (
        <>
          <Plain label="Опис" text={action.description} />
          <Part label="Колонки">
            <div className="flex flex-wrap gap-1.5">
              {(action.columns.length
                ? action.columns
                : ['Беклог', 'У роботі', 'Рев’ю', 'Готово']
              ).map((c, i) => (
                <Badge key={i} variant="soft">
                  {c}
                </Badge>
              ))}
            </div>
          </Part>
        </>
      )
    case 'create_word':
      return (
        <>
          {action.transcription && (
            <p className="text-body text-muted-foreground">[{action.transcription}]</p>
          )}
          <Plain label="Переклад" text={action.translation} />
          {action.example && (
            <Part label="Приклад">
              <p className="text-lead italic">{action.example}</p>
              {action.exampleTranslation && (
                <p className="text-body text-muted-foreground">{action.exampleTranslation}</p>
              )}
            </Part>
          )}
          <Md label="Нотатки" text={action.notes} />
        </>
      )
    case 'create_claude':
      return (
        <>
          <Plain label="Коротко" text={action.summary} />
          <Md label="Текст" text={action.content} />
        </>
      )
    case 'create_fix':
      return (
        <>
          {action.errorText && (
            <Part label="Текст помилки">
              <CodeBlock code={action.errorText} language="text" />
            </Part>
          )}
          <Md label="Причина" text={action.cause} />
          <Md label="Рішення" text={action.solution} />
        </>
      )
    case 'create_library':
      return (
        <>
          <Plain label="Для чого" text={action.purpose} />
          {action.installCmd && (
            <Part label="Встановлення">
              <CodeBlock code={action.installCmd} language="bash" />
            </Part>
          )}
          <Md label="Нотатки" text={action.notes} />
        </>
      )
    case 'create_question':
      return <Md label="Відповідь" text={action.answer} />
    case 'create_template': {
      const vars = templateVariables(action.body)
      return (
        <>
          <Plain label="Коли використовувати" text={action.trigger} />
          <Part label="Текст">
            <TemplateText text={action.body} />
            {vars.length > 0 && (
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="text-caption text-muted-foreground">Змінні:</span>
                {vars.map((v) => (
                  <Badge key={v} variant="soft" title={`${variableLabel(v)} {${v}}`}>
                    {variableLabel(v)}{' '}
                    <span className="font-mono text-muted-foreground">{`{${v}}`}</span>
                  </Badge>
                ))}
              </div>
            )}
          </Part>
          <Plain label="Нотатка для себе" text={action.note} />
        </>
      )
    }
    case 'create_redflag':
      return (
        <>
          <Plain label="Ознаки" text={action.signs} />
          <Plain label="Що робити" text={action.action} />
        </>
      )
    case 'create_case':
      return (
        <>
          <Plain label="Задача" text={action.problem} />
          <Plain label="Що зроблено" text={action.whatDone} />
          <Plain label="Результат" text={action.result} />
          <Plain label="Текст для платформи" text={action.textEn} />
        </>
      )
    case 'create_bookmark':
      return (
        <>
          {action.url && <p className="truncate text-body text-muted-foreground">{action.url}</p>}
          <Md label="Нотатки" text={action.notes} />
        </>
      )
  }
}

/**
 * The record as it will look after «Застосувати»: the module's reading view rebuilt from the action (the title
 * as on the record page, Markdown through the app's renderer, code highlighted, checklist rows, the event's date
 * block). The modules' own panes need a saved record, so the pieces are the shared ones they use.
 */
export function RecordPreview({
  action,
  preview
}: {
  action: AiAction
  preview: AiActionPreview
}): ReactElement {
  const facts = preview.fields.filter((f) => f.label !== 'Коли')
  const title = (action as Record<string, unknown>)[AI_ACTIONS[action.type].titleKey]
  const edit = action.type === 'append_text' || action.type === 'add_tags'
  const date = action.type === 'create_event' ? parseLocalWhen(action.start) : null
  return (
    <article className="flex min-w-0 flex-col gap-5">
      <header className="flex min-w-0 items-start gap-3">
        {action.type === 'create_event' && (
          <EventDate
            when={date?.at ?? null}
            withTime={!!date && !date.allDay}
            title={whenOf(action)}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h2 className="font-display text-headline leading-tight wrap-anywhere">
            {edit ? preview.title : typeof title === 'string' ? title : ''}
          </h2>
          {facts.length > 0 && (
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-caption text-muted-foreground">
              {facts.map((f) => (
                <span key={f.label}>
                  {f.label}: <span className="text-foreground">{f.value}</span>
                </span>
              ))}
            </p>
          )}
          {action.type === 'create_checklist' && (
            <p className="text-caption text-muted-foreground">{summaryOf(action, preview)}</p>
          )}
        </div>
      </header>
      <Body action={action} preview={preview} />
    </article>
  )
}

/* ───────────── «Змінити» ───────────── */

/**
 * The fields «Змінити» offers for this action, with the module form's limits (maxLength from the action's own
 * schema; Field shows the counter near the limit). Edits stay raw text until «Застосувати».
 */
export function ActionEditor({
  action,
  raw,
  onChange
}: {
  action: AiAction
  raw: RawEdits
  onChange: (key: string, value: string) => void
}): ReactElement {
  const base = useId()
  const limits = limitsOf(AI_ACTION_SCHEMAS[action.type]) as Record<string, number | undefined>
  return (
    <div className="flex flex-col gap-4">
      {AI_ACTIONS[action.type].edit.map((f, i) => {
        const id = `${base}-${f.key}`
        const value = f.key in raw ? raw[f.key] : rawOf(action, f)
        const common = {
          id,
          value,
          maxLength: isList(f) ? undefined : limits[f.key],
          placeholder: f.placeholder,
          autoFocus: i === 0,
          'aria-required': f.required || undefined,
          onChange: (e: { target: { value: string } }) => onChange(f.key, e.target.value)
        }
        return (
          <Field key={f.key} label={f.label} htmlFor={id}>
            {f.input === 'line' || f.input === 'list' ? (
              <Input {...common} />
            ) : (
              <Textarea
                {...common}
                className={cn(
                  f.input === 'code' && 'font-mono text-caption',
                  (f.input === 'markdown' || f.input === 'code') && 'min-h-40'
                )}
              />
            )}
          </Field>
        )
      })}
    </div>
  )
}
