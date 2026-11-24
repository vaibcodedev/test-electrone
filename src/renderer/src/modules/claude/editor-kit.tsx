/**
 * Small autosaving field primitives shared by the text-knowledge modules
 * (Claude, snippets, libraries, fixes, bookmarks). Each field keeps a local draft
 * and saves itself after typing stops (see useAutosave). Key the detail by entity id
 * so pending edits flush to the right record when switching items.
 */
import type { ComponentProps, ReactNode } from 'react'
import { useAutosave } from '@/hooks/use-autosave'
import { useHotkey } from '@/hooks/use-hotkey'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { InlineTitle } from '@/components/common/master-detail'
import { MarkdownField } from '@/components/common/markdown'
import { CodeEditor, type CodeLanguage } from '@/components/common/code'
import { cn } from '@/lib/utils'

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

export function AutoTextarea({
  value,
  onSave,
  ...props
}: { value: string; onSave: (value: string) => void } & Omit<ComponentProps<typeof Textarea>, 'value' | 'onChange'>) {
  const [draft, setDraft] = useAutosave(value, onSave)
  return <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} {...props} />
}

export function AutoMarkdown({
  value,
  onSave,
  placeholder,
  minHeight
}: {
  value: string
  onSave: (value: string) => void
  placeholder?: string
  minHeight?: string
}) {
  const [draft, setDraft] = useAutosave(value, onSave, 800)
  return <MarkdownField value={draft} onChange={setDraft} placeholder={placeholder} minHeight={minHeight} />
}

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
    />
  )
}

/** Labelled block inside a detail pane. */
export function Block({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('flex flex-col gap-2', className)}>
      <h3 className="text-[12px] text-muted-foreground">{label}</h3>
      {children}
    </section>
  )
}

/** Single-select pill group for enum fields (status, kind, language). */
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
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            'rounded-full transition-colors',
            size === 'sm' ? 'h-8 px-3 text-[12.5px]' : 'h-6 px-2.5 text-[11.5px]',
            value === o.value ? 'bg-ink font-medium text-ink-foreground' : 'bg-surface hover:bg-accent'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
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
