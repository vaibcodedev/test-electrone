import { useState, type ComponentProps } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Eye, Pencil } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { CodeEditor } from './code'
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

/** Markdown field with edit/preview toggle. Starts in preview when there is content. */
export function MarkdownField({
  value,
  onChange,
  placeholder = 'Пишите в Markdown…',
  minHeight = '220px',
  className,
  defaultMode
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minHeight?: string
  className?: string
  defaultMode?: 'edit' | 'preview'
}) {
  const [mode, setMode] = useState<'edit' | 'preview'>(defaultMode ?? (value.trim() ? 'preview' : 'edit'))
  return (
    <div className={cn('relative', className)}>
      <div className="absolute top-2 right-2 z-10 flex rounded-full bg-card/90 p-0.5 shadow-sm backdrop-blur">
        {(
          [
            ['edit', Pencil, 'Редактировать'],
            ['preview', Eye, 'Просмотр']
          ] as const
        ).map(([m, Icon, label]) => (
          <button
            key={m}
            type="button"
            title={label}
            onClick={() => setMode(m)}
            className={cn(
              'grid size-7 place-items-center rounded-full transition-colors',
              mode === m ? 'bg-ink text-ink-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="size-3.5" />
          </button>
        ))}
      </div>
      {mode === 'edit' ? (
        <CodeEditor
          value={value}
          onChange={onChange}
          language="markdown"
          lineNumbers={false}
          minHeight={minHeight}
          placeholder={placeholder}
          autoFocus={!value}
        />
      ) : (
        <div
          className="min-h-24 cursor-text rounded-2xl bg-surface p-5 pr-20"
          onDoubleClick={() => setMode('edit')}
          title="Двойной клик — редактировать"
        >
          {value.trim() ? (
            <Markdown source={value} />
          ) : (
            <span className="text-[13px] text-muted-foreground">{placeholder}</span>
          )}
        </div>
      )}
    </div>
  )
}
