/**
 * Autosaving field primitives shared by the text-knowledge modules
 * (Claude, snippets, libraries, fixes, bookmarks). All built on shadcn
 * (Field/FieldLabel, Input, Textarea, Select, ToggleGroup) + common MarkdownField/CodeEditor.
 * Each field keeps a local draft and saves itself after typing stops (useAutosave).
 * Key the detail by entity id so pending edits flush to the right record when switching items.
 */
import { useId, type ComponentProps, type ReactNode } from 'react'
import { useAutosave } from '@/hooks/use-autosave'
import { useHotkey } from '@/hooks/use-hotkey'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { InlineTitle } from '@/components/common/master-detail'
import { MarkdownField } from '@/components/common/markdown'
import { CodeEditor, type CodeLanguage } from '@/components/common/code'
import { cn } from '@/lib/utils'

/** Vertical rhythm for editor bodies: one gap everywhere. */
export function EditorStack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-5', className)}>{children}</div>
}

export function AutoTitle({
  value,
  onSave,
  placeholder
}: {
  value: string
  onSave: (value: string) => void
  placeholder?: string
}) {
  const [draft, setDraft] = useAutosave(value, (v) => v.trim() && onSave(v.trim()))
  return <InlineTitle value={draft} onChange={setDraft} placeholder={placeholder} />
}

export function AutoInput({
  value,
  onSave,
  ...props
}: { value: string; onSave: (value: string) => void } & Omit<ComponentProps<typeof Input>, 'value' | 'onChange'>) {
  const [draft, setDraft] = useAutosave(value, onSave)
  return <Input value={draft} onChange={(e) => setDraft(e.target.value)} {...props} />
}

/** Auto-growing textarea (no resize handle — field-sizing: content). */
export function AutoTextarea({
  value,
  onSave,
  className,
  ...props
}: { value: string; onSave: (value: string) => void } & Omit<ComponentProps<typeof Textarea>, 'value' | 'onChange'>) {
  const [draft, setDraft] = useAutosave(value, onSave)
  return (
    <Textarea
      rows={1}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      className={cn('min-h-9 px-3 py-2', className)}
      {...props}
    />
  )
}

/** Markdown with its own label row (Текст / Просмотр switch sits next to the label, never over text). */
export function AutoMarkdown({
  value,
  onSave,
  placeholder,
  minHeight,
  label
}: {
  value: string
  onSave: (value: string) => void
  placeholder?: string
  minHeight?: string
  label?: string
}) {
  const [draft, setDraft] = useAutosave(value, onSave, 800)
  return (
    <MarkdownField value={draft} onChange={setDraft} placeholder={placeholder} minHeight={minHeight} label={label} />
  )
}

/** Code editor (CodeMirror — shadcn has no code editor), framed like the other fields. */
export function AutoCode({
  value,
  onSave,
  language,
  lineNumbers,
  minHeight,
  placeholder
}: {
  value: string
  onSave: (value: string) => void
  language: CodeLanguage
  lineNumbers?: boolean
  minHeight?: string
  placeholder?: string
}) {
  const [draft, setDraft] = useAutosave(value, onSave, 800)
  return (
    <CodeEditor
      value={draft}
      onChange={setDraft}
      language={language}
      lineNumbers={lineNumbers}
      minHeight={minHeight}
      placeholder={placeholder}
      className="rounded-xl"
    />
  )
}

/** Labelled field (shadcn Field + FieldLabel). Optional hint under the control. */
export function Block({
  label,
  hint,
  children,
  className
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <Field className={cn('gap-2', className)}>
      <FieldLabel>{label}</FieldLabel>
      {children}
      {hint && <FieldDescription className="text-caption">{hint}</FieldDescription>}
    </Field>
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
    <Field className="gap-2">
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
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn('w-full rounded-xl border-transparent bg-surface shadow-none dark:bg-surface dark:hover:bg-accent', className)}
      >
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

/** Closes the open detail with Esc (ignored while typing). */
export function useEscapeToClose(onClose: () => void, enabled = true): void {
  useHotkey('escape', onClose, { enabled })
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
