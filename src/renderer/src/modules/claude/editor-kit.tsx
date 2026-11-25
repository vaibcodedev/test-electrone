/**
 * Autosaving field primitives shared by the text-knowledge modules
 * (Claude, snippets, libraries, fixes, bookmarks). All built on shadcn
 * (Input, Textarea, Select) inside the common Field + common MarkdownField/CodeEditor.
 * Each field keeps a local draft and saves itself after typing stops (useAutosave).
 * Key the detail by entity id so pending edits flush to the right record when switching items.
 */
import {
  useId,
  useMemo,
  useState,
  type ComponentProps,
  type ReactElement,
  type ReactNode
} from 'react'
import { X } from 'lucide-react'
import { useAutosave } from '@/hooks/use-autosave'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FieldError } from '@/components/ui/field'
import { overLimitText } from '@/lib/limits'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Field } from '@/components/common/page'
import { InlineTitle } from '@/components/common/master-detail'
import { MarkdownField } from '@/components/common/markdown'
import { CodeEditor } from '@/components/common/code'
import { detectLanguage, LANGUAGE_LABEL, type CodeLanguage } from '@/lib/code-language'
import { Button } from '@/components/ui/button'
import { useReadOnly } from '@/components/common/detail-mode-context'
import { IconAction } from '@/components/common/icon-action'
import { cn } from '@/lib/utils'

/** Vertical rhythm for editor bodies: one gap everywhere. */
export function EditorStack({
  children,
  className
}: {
  children: ReactNode
  className?: string
}): ReactElement {
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
}): ReactElement {
  const [draft, setDraft] = useAutosave(value, (v) => v.trim() && onSave(v.trim()))
  return (
    <InlineTitle
      value={draft}
      onChange={setDraft}
      placeholder={placeholder}
      maxLength={maxLength}
    />
  )
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
}): ReactElement {
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
      // The prompt is the record itself: it is never folded.
      fold={false}
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
}): ReactElement {
  const readOnly = useReadOnly()
  const [draft, setDraft] = useAutosave(value, onSave, 800)
  // Reading an empty field: no dark box with a placeholder that reads as content — the Field hides itself
  // (globals.css → empty fields) and the pane's «only a title» hint can show.
  if (readOnly && !draft.trim()) return <div data-empty hidden />
  return (
    <>
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
      {/* Code stored before the limit was lowered: it opens and can be shortened, nothing is cut. */}
      {!readOnly && maxLength !== undefined && draft.length > maxLength && (
        <FieldError className="text-caption">{overLimitText(draft.length, maxLength)}</FieldError>
      )}
    </>
  )
}

/**
 * Labelled field: the common Field under the name the knowledge modules already use, so the counter
 * («1 600 / 2 000», warn from 90%) and the hidden-in-view error behave the same in every record.
 */
export { Field as Block }

/** Labelled autosaving textarea with a character counter (limit from the schema). */
export function TextareaBlock({
  label,
  value,
  onSave,
  maxLength,
  hint,
  className,
  ...props
}: {
  label: string
  value: string
  onSave: (value: string) => void
  maxLength?: number
  hint?: ReactNode
} & Omit<ComponentProps<typeof Textarea>, 'value' | 'onChange' | 'maxLength'>): ReactElement {
  const id = useId()
  const [draft, setDraft] = useAutosave(value, onSave)
  return (
    <Field label={label} htmlFor={id} hint={hint} count={{ length: draft.length, max: maxLength }}>
      <Textarea
        id={id}
        rows={1}
        value={draft}
        maxLength={maxLength}
        onChange={(e) => setDraft(e.target.value)}
        {...props}
        className={cn('min-h-9 px-3 py-2', className)}
      />
    </Field>
  )
}

/**
 * Labelled autosaving text input in one line: the common Field, so the counter and the view-mode look match the
 * other fields. TextField when the input needs no own props (spellCheck, a mono font).
 */
export function InputField({
  label,
  value,
  onSave,
  maxLength,
  ...props
}: { label: string; value: string; onSave: (value: string) => void } & Omit<
  ComponentProps<typeof Input>,
  'value' | 'onChange'
>): ReactElement {
  const id = useId()
  const [draft, setDraft] = useAutosave(value, onSave)
  return (
    <Field label={label} htmlFor={id} count={{ length: draft.length, max: maxLength }}>
      <Input
        id={id}
        value={draft}
        maxLength={maxLength}
        onChange={(e) => setDraft(e.target.value)}
        {...props}
      />
    </Field>
  )
}

/** Dropdown for longer enums (shadcn Select). `size="sm"` in a narrow aside column (docs/design-system.md → Переключатели). */
export function EnumSelect<T extends string>({
  options,
  value,
  onChange,
  className,
  ariaLabel,
  size
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  className?: string
  ariaLabel?: string
  size?: 'sm' | 'default'
}): ReactElement {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger size={size} aria-label={ariaLabel} className={cn('w-full', className)}>
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
}): ReactElement | null {
  // Switching changes the record, so it is offered only after «Редагувати».
  const readOnly = useReadOnly()
  const [dismissed, setDismissed] = useState<string | null>(null)
  const detected = useMemo(() => detectLanguage(code), [code])
  const suggestion =
    detected && (languages as readonly string[]).includes(detected) ? (detected as L) : null
  if (readOnly || !suggestion || suggestion === language || dismissed === suggestion) return null
  if (COMPATIBLE[language]?.includes(suggestion)) return null
  const name = LANGUAGE_LABEL[suggestion as CodeLanguage] ?? suggestion
  return (
    <div className="flex animate-enter items-center gap-2 rounded-xl bg-foreground/5 py-1.5 pr-1.5 pl-3 text-caption">
      <span className="flex-1 text-muted-foreground">
        Схоже на <span className="font-medium text-foreground">{name}</span>
      </span>
      <Button variant="subtle" size="xs" onClick={() => onSwitch(suggestion)}>
        Перемкнути на {name}
      </Button>
      <IconAction label="Сховати підказку" onClick={() => setDismissed(suggestion)}>
        <X />
      </IconAction>
    </div>
  )
}
