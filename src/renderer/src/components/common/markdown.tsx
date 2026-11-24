import { useState, type ComponentProps } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Eye, Pencil } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useReadOnly } from './detail-mode'
import { Textarea } from '@/components/ui/textarea'
import { FieldLabel } from '@/components/ui/field'
import { Segmented } from './page'
import { CopyButton } from './copy-button'

function Pre(props: ComponentProps<'pre'>) {
  // Extract raw text of the code block for the copy button.
  const text = extractText(props.children)
  return (
    <div className="group/code relative">
      <pre {...props} />
      <CopyButton
        text={text}
        variant="ghost"
        className="absolute top-2 right-2 text-[var(--code-fg)] opacity-0 transition-opacity group-hover/code:opacity-100 hover:bg-white/10"
      />
    </div>
  )
}

function extractText(node: unknown): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (node && typeof node === 'object' && 'props' in node) {
    return extractText((node as { props: { children?: unknown } }).props.children)
  }
  return ''
}

/** Renders GitHub-flavoured markdown with highlighted code blocks; links open in the system browser. */
export function Markdown({ source, className }: { source: string; className?: string }) {
  return (
    <div className={cn('prose-vault [overflow-wrap:anywhere]', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          pre: Pre,
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault()
                if (href && /^(https?|mailto):/i.test(href)) void api.app.openExternal(href)
              }}
            >
              {children}
            </a>
          )
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}

/**
 * Markdown field: shadcn Textarea for writing (regular font, auto-grows) + rendered preview.
 * Mode switch is a shadcn ToggleGroup above the content, never on top of the text.
 */
export function MarkdownField({
  value,
  onChange,
  placeholder = 'Пишіть у Markdown: **жирний**, списки, ```код```',
  minHeight = '160px',
  className,
  defaultMode,
  label,
  maxLength
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minHeight?: string
  className?: string
  defaultMode?: 'edit' | 'preview'
  label?: string
  /** From the schema (limitsOf); the counter appears in the label row after 80%. */
  maxLength?: number
}) {
  const near = maxLength ? value.length >= maxLength * 0.8 : false
  const viewMode = useReadOnly()
  const [mode, setMode] = useState<'edit' | 'preview'>(defaultMode ?? (value.trim() ? 'preview' : 'edit'))
  // Record view mode: rendered text only; an empty field disappears.
  if (viewMode) {
    if (!value.trim()) return null
    return (
      <div className={cn('flex flex-col gap-2', className)}>
        {label && <FieldLabel>{label}</FieldLabel>}
        <Markdown source={value} />
      </div>
    )
  }
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Label row has the label's height: the compact toggle (h-7, -my-1) must not push the control down,
          so label → control is 8px like every other Field (docs/design-system.md → Формы). */}
      <div className="flex items-center justify-between gap-2">
        {label ? <FieldLabel>{label}</FieldLabel> : <span />}
        {near && (
          <span
            className={cn('ml-auto text-meta tabular-nums', value.length >= maxLength! ? 'text-warn' : 'text-muted-foreground')}
            aria-live="polite"
          >
            {value.length} / {maxLength}
          </span>
        )}
        <Segmented
          size="xs"
          className="-my-1 h-7 p-0.5 [&>button]:h-6 [&>button]:px-2.5 [&>button]:text-meta"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'edit', label: <><Pencil /> Текст</> },
            { value: 'preview', label: <><Eye /> Перегляд</> }
          ]}
        />
      </div>
      {mode === 'edit' ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          style={{ minHeight }}
          className="px-4 py-3 text-lead leading-relaxed"
        />
      ) : (
        <div
          className="cursor-text rounded-xl bg-surface px-5 py-4"
          style={{ minHeight: `calc(${minHeight} / 2)` }}
          onDoubleClick={() => setMode('edit')}
          title="Подвійний клік — редагувати"
        >
          {value.trim() ? (
            <Markdown source={value} />
          ) : (
            <span className="text-body text-muted-foreground">Порожньо. Перемкніться на «Текст», щоб написати.</span>
          )}
        </div>
      )}
    </div>
  )
}
