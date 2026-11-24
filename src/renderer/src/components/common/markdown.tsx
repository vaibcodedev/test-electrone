import { useState, type ComponentProps } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Eye, Pencil } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Textarea } from '@/components/ui/textarea'
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
    <div className={cn('prose-vault', className)}>
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
  placeholder = 'Пишите в Markdown: **жирный**, списки, ```код```',
  minHeight = '160px',
  className,
  defaultMode,
  label
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minHeight?: string
  className?: string
  defaultMode?: 'edit' | 'preview'
  label?: string
}) {
  const [mode, setMode] = useState<'edit' | 'preview'>(defaultMode ?? (value.trim() ? 'preview' : 'edit'))
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between gap-2">
        {label ? <span className="text-[12.5px] font-medium text-muted-foreground">{label}</span> : <span />}
        <Segmented
          size="xs"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'edit', label: <><Pencil /> Текст</> },
            { value: 'preview', label: <><Eye /> Просмотр</> }
          ]}
        />
      </div>
      {mode === 'edit' ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ minHeight }}
          className="px-4 py-3 text-[14px] leading-relaxed"
        />
      ) : (
        <div
          className="cursor-text rounded-xl bg-surface px-5 py-4"
          style={{ minHeight: `calc(${minHeight} / 2)` }}
          onDoubleClick={() => setMode('edit')}
          title="Двойной клик — редактировать"
        >
          {value.trim() ? (
            <Markdown source={value} />
          ) : (
            <span className="text-[13px] text-muted-foreground">Пусто. Переключитесь на «Текст», чтобы написать.</span>
          )}
        </div>
      )}
    </div>
  )
}
