/**
 * Autosaving field primitives shared by the text-knowledge modules
 * (Claude, snippets, libraries, fixes, bookmarks). All built on shadcn
 * (Field/FieldLabel, Input, Textarea, Select, ToggleGroup) + common MarkdownField/CodeEditor.
 * Each field keeps a local draft and saves itself after typing stops (useAutosave).
 * Key the detail by entity id so pending edits flush to the right record when switching items.
 */
import { useId, useMemo, useState, type ComponentProps, type ReactNode } from 'react'
import { normalizeUrl } from '@/lib/open-url'
import { X } from 'lucide-react'
import { useAutosave } from '@/hooks/use-autosave'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { InlineTitle } from '@/components/common/master-detail'
import { MarkdownField } from '@/components/common/markdown'
import { CodeEditor, detectLanguage, LANGUAGE_LABEL, type CodeLanguage } from '@/components/common/code'
import { Button } from '@/components/ui/button'
import { useReadOnly } from '@/components/common/detail-mode-context'
import { cn } from '@/lib/utils'
import { isLikelyUrl, URL_ERROR } from '@/lib/limits'

/** Vertical rhythm for editor bodies: one gap everywhere. */
export function EditorStack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-5', className)}>{children}</div>
}

export function AutoTitle({
  value,
  onSave,
  placeholder,
  maxLength
}: {
  value: string
  onSave: (value: string) => void
  placeholder?: string
  /** From the schema (limitsOf): typing stops where the server would reject. */
  maxLength?: number
}) {
  const [draft, setDraft] = useAutosave(value, (v) => v.trim() && onSave(v.trim()))
  return <InlineTitle value={draft} onChange={setDraft} placeholder={placeholder} maxLength={maxLength} />
}

function AutoInput({
  value,
  onSave,
  ...props
}: { value: string; onSave: (value: string) => void } & Omit<ComponentProps<typeof Input>, 'value' | 'onChange'>) {
  const [draft, setDraft] = useAutosave(value, onSave)
  return <Input value={draft} onChange={(e) => setDraft(e.target.value)} {...props} />
}

/** Markdown with its own label row (Текст / Перегляд switch sits next to the label, never over text). */
export function AutoMarkdown({
  value,
  onSave,
  placeholder,
  minHeight,
  label,
  maxLength
}: {
  value: string
  onSave: (value: string) => void
  placeholder?: string
  minHeight?: string
  label?: string
  /** From the schema (limitsOf): typing past it is impossible, so autosave never gets rejected. */
  maxLength?: number
}) {
  const [draft, setDraft] = useAutosave(value, onSave, 800)
  return (
    <MarkdownField
      value={draft}
      onChange={setDraft}
      defaultMode="edit"
      placeholder={placeholder}
      minHeight={minHeight}
      label={label}
      maxLength={maxLength}
    />
  )
}

/** Code editor (CodeMirror — shadcn has no code editor), framed like the other fields. */
export function AutoCode({
  value,
  onSave,
  language,
  lineNumbers,
  minHeight,
  placeholder,
  maxLength
}: {
  value: string
  onSave: (value: string) => void
  language: CodeLanguage
  lineNumbers?: boolean
  minHeight?: string
  placeholder?: string
  maxLength?: number
}) {
  const readOnly = useReadOnly()
  const [draft, setDraft] = useAutosave(value, onSave, 800)
  // Reading an empty field: no dark box with a placeholder that reads as content — the Field hides itself
  // (globals.css → empty fields) and the pane's «only a title» hint can show.
  if (readOnly && !draft.trim()) return <div data-empty hidden />
  return (
    <CodeEditor
      value={draft}
      onChange={setDraft}
      language={language}
      lineNumbers={lineNumbers}
      minHeight={minHeight}
      placeholder={placeholder}
      maxLength={maxLength}
      className="rounded-xl"
    />
  )
}

/** Labelled field (shadcn Field + FieldLabel). Optional hint under the control. */
export function Block({
  label,
  hint,
  error,
  count,
  children,
  className,
  htmlFor
}: {
  label: string
  hint?: ReactNode
  /** Shown under the control in the destructive colour (replaces the hint). */
  error?: ReactNode
  /** Character counter next to the label, visible from 80% of the limit (same as common Field). */
  count?: { length: number; max?: number }
  children: ReactNode
  className?: string
  htmlFor?: string
}) {
  const near = count?.max ? count.length >= count.max * 0.8 : false
  return (
    <Field className={cn('min-w-0 gap-2', className)} data-invalid={error ? true : undefined}>
      <div className="flex items-baseline justify-between gap-3">
        <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
        {near && count?.max && (
          <span
            className={cn('text-meta tabular-nums', count.length >= count.max ? 'text-warn' : 'text-muted-foreground')}
            aria-live="polite"
          >
            {count.length} / {count.max}
          </span>
        )}
      </div>
      {children}
      {error ? (
        <FieldError className="text-caption">{error}</FieldError>
      ) : (
        hint && <FieldDescription className="text-caption">{hint}</FieldDescription>
      )}
    </Field>
  )
}

/** Labelled autosaving textarea with a character counter (limit from the schema). */
export function TextareaBlock({
  label,
  value,
  onSave,
  maxLength,
  hint,
  className,
  ...props
}: { label: string; value: string; onSave: (value: string) => void; maxLength?: number; hint?: ReactNode } & Omit<
  ComponentProps<typeof Textarea>,
  'value' | 'onChange' | 'maxLength'
>) {
  const id = useId()
  const [draft, setDraft] = useAutosave(value, onSave)
  return (
    <Block label={label} htmlFor={id} hint={hint} count={{ length: draft.length, max: maxLength }}>
      <Textarea
        id={id}
        rows={1}
        value={draft}
        maxLength={maxLength}
        onChange={(e) => setDraft(e.target.value)}
        {...props}
        className={cn('min-h-9 px-3 py-2', className)}
      />
    </Block>
  )
}

/**
 * Labelled autosaving link field: type="url", an error under the field for text that isn't a link,
 * and an invalid non-empty value is never saved. `trailing` renders next to the input (e.g. open button).
 */
export function UrlBlock({
  label,
  value,
  onSave,
  maxLength,
  placeholder = 'https://…',
  trailing,
  hint
}: {
  label: string
  value: string
  onSave: (value: string) => void
  maxLength?: number
  placeholder?: string
  trailing?: (draft: string) => ReactNode
  hint?: ReactNode
}) {
  const id = useId()
  const readOnly = useReadOnly()
  const [draft, setDraft] = useAutosave(value, (v) => {
    if (isLikelyUrl(v)) onSave(normalizeUrl(v))
  })
  const invalid = !isLikelyUrl(draft)
  return (
    <Block label={label} htmlFor={id} hint={hint} error={invalid && !readOnly ? URL_ERROR : undefined}>
      <div className="flex gap-2">
        <Input
          id={id}
          type="url"
          inputMode="url"
          spellCheck={false}
          value={draft}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          onChange={(e) => setDraft(e.target.value)}
        />
        {trailing?.(draft)}
      </div>
    </Block>
  )
}

/** Labelled autosaving text input in one line. */
export function InputField({
  label,
  value,
  onSave,
  ...props
}: { label: string; value: string; onSave: (value: string) => void } & Omit<
  ComponentProps<typeof Input>,
  'value' | 'onChange'
>) {
  const id = useId()
  return (
    <Field className="min-w-0 gap-2">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <AutoInput id={id} value={value} onSave={onSave} {...props} />
    </Field>
  )
}

/** Single-select pill group for short enums (shadcn ToggleGroup, chip variant; can't be cleared). */
export function PillSelect<T extends string>({
  options,
  value,
  onChange,
  size = 'sm'
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'xs'
}) {
  return (
    <ToggleGroup
      type="single"
      variant="chip"
      size={size}
      spacing={1}
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
    >
      {options.map((o) => (
        <ToggleGroupItem key={o.value} value={o.value}>
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/** Dropdown for longer enums (shadcn Select). */
export function EnumSelect<T extends string>({
  options,
  value,
  onChange,
  className,
  ariaLabel
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  className?: string
  ariaLabel?: string
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger aria-label={ariaLabel} className={cn('w-full', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Counts items per key, for chip counters. */
export function countBy<T, K extends string>(items: T[], key: (item: T) => K): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {}
  for (const item of items) {
    const k = key(item)
    out[k] = (out[k] ?? 0) + 1
  }
  return out
}

/**
 * Selected language → detections it already covers. TSX is a superset of JSX: a TSX component without type
 * annotations is detected as JSX, but it renders fine, so «Схоже на JSX» would be a false alarm.
 */
const COMPATIBLE: Partial<Record<string, string[]>> = {
  tsx: ['jsx', 'typescript', 'javascript'],
  typescript: ['javascript'],
  jsx: ['javascript']
}

/**
 * «Схоже на JSON — Перемкнути» under a code editor: shown while editing when the code looks like another of
 * the allowed languages than the selected one. Never switches silently; ✕ hides it for this record.
 */
export function LanguageSuggestion<L extends string>({
  code,
  language,
  languages,
  onSwitch
}: {
  code: string
  language: L
  languages: readonly L[]
  onSwitch: (language: L) => void
}) {
  // Switching changes the record, so it is offered only after «Редагувати».
  const readOnly = useReadOnly()
  const [dismissed, setDismissed] = useState<string | null>(null)
  const detected = useMemo(() => detectLanguage(code), [code])
  const suggestion = detected && (languages as readonly string[]).includes(detected) ? (detected as L) : null
  if (readOnly || !suggestion || suggestion === language || dismissed === suggestion) return null
  if (COMPATIBLE[language]?.includes(suggestion)) return null
  return (
    <div className="flex animate-enter items-center gap-2 rounded-xl bg-foreground/5 py-1.5 pr-1.5 pl-3 text-caption">
      <span className="flex-1 text-muted-foreground">
        Схоже на <span className="font-medium text-foreground">{LANGUAGE_LABEL[suggestion as CodeLanguage] ?? suggestion}</span>
      </span>
      <Button variant="subtle" size="xs" onClick={() => onSwitch(suggestion)}>
        Перемкнути
      </Button>
      <Button variant="ghost" size="icon-xs" aria-label="Сховати підказку" onClick={() => setDismissed(suggestion)}>
        <X />
      </Button>
    </div>
  )
}
