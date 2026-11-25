import { useId, useState, type ComponentProps, type ReactElement } from 'react'
import { openUrl } from '@/lib/open-url'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Eye, Image as ImageIcon, Pencil } from 'lucide-react'
import { parseVaultHref } from '@shared/wikilinks'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useDetailMode, useReadOnly } from './detail-mode-context'
import { FieldLabel } from '@/components/ui/field'
import { CharCount, Segmented } from './page'
import { Kbd } from '@/components/ui/kbd'
import { ShowMore } from './show-more'
import { CopyButton } from './copy-button'
import { MarkdownTextarea } from './markdown-textarea'
import { useWikiLinkTargets } from '@/hooks/use-wiki-link-targets'
import { WikiLink, WikiLinkTargets } from './wiki-link'

/** Record links (`vault:note/<id>`) survive; everything else goes through react-markdown's safe-URL filter. */
const urlTransform = (url: string): string => (parseVaultHref(url) ? url : defaultUrlTransform(url))

function Pre(props: ComponentProps<'pre'>): ReactElement {
  // Extract raw text of the code block for the copy button.
  const text = extractText(props.children)
  return (
    <div className="group/code relative">
      <pre {...props} />
      <CopyButton
        text={text}
        variant="code"
        className="absolute top-2 right-2 opacity-0 transition-opacity group-hover/code:opacity-100 group-focus-within/code:opacity-100 focus-visible:opacity-100"
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

/**
 * Images from the internet don't load by themselves (they would reveal your IP and work as tracking pixels,
 * e.g. in text captured by the Chrome extension): a quiet placeholder loads the image on click.
 */
function ExternalImage({ src, alt }: { src?: string; alt?: string }): ReactElement | null {
  const [shown, setShown] = useState(false)
  const external = !!src && /^https?:/i.test(src)
  if (!src) return null
  if (!external || shown) return <img src={src} alt={alt ?? ''} className="max-w-full rounded-xl" />
  let host = src
  try {
    host = new URL(src).host
  } catch {
    /* keep raw */
  }
  return (
    <Button
      variant="subtle"
      size="sm"
      className="my-1 max-w-full"
      onClick={() => setShown(true)}
      title={src}
    >
      <ImageIcon />
      <span className="truncate">
        Показати зображення{alt ? ` «${alt}»` : ''} з {host}
      </span>
    </Button>
  )
}

/**
 * Renders GitHub-flavoured markdown with highlighted code blocks; links open in the system browser, record links
 * («[[», shared/wikilinks.ts) open the record.
 */
export function Markdown({
  source,
  className
}: {
  source: string
  className?: string
}): ReactElement {
  const targets = useWikiLinkTargets(source)
  return (
    <WikiLinkTargets value={targets}>
      <div className={cn('prose-vault wrap-anywhere', className)}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
          urlTransform={urlTransform}
          components={{
            pre: Pre,
            img: ({ src, alt }) => (
              <ExternalImage src={typeof src === 'string' ? src : undefined} alt={alt} />
            ),
            a: ({ href, children }) => {
              const target = parseVaultHref(href)
              if (target) return <WikiLink target={target}>{children}</WikiLink>
              return (
                <a
                  href={href}
                  onClick={(e) => {
                    e.preventDefault()
                    if (href && /^(https?|mailto):/i.test(href)) void openUrl(href)
                  }}
                >
                  {children}
                </a>
              )
            }
          }}
        >
          {source}
        </ReactMarkdown>
      </div>
    </WikiLinkTargets>
  )
}

/**
 * Markdown field: shadcn Textarea for writing (regular font, auto-grows) + rendered preview.
 * Mode switch is a shadcn ToggleGroup above the content, never on top of the text.
 */
export function MarkdownField({
  value,
  onChange,
  placeholder = 'Пишіть у Markdown: **жирний**, списки, ```код```; [[ — посилання на запис',
  minHeight = '160px',
  className,
  defaultMode,
  label,
  maxLength,
  fold = true
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
  /**
   * While reading, a text taller than ~16 lines folds under «Показати повністю» (a wall of text pushed tags,
   * links and dates out of reach). Off for a field that is the record itself (a Claude prompt).
   */
  fold?: boolean
}): ReactElement | null {
  const viewMode = useReadOnly()
  // A record has its own view mode (it has `save`); outside one (week review, «Про дошку») there is none.
  const inRecord = !!useDetailMode().save
  const id = useId()
  // In record editing «Редагувати» means writing, so the field opens on «Текст». Outside a record a filled
  // field opens on «Перегляд»: otherwise its text (and «- [ ]» checkboxes) would only ever show as raw markdown.
  const [mode, setMode] = useState<'edit' | 'preview'>(
    defaultMode ?? (inRecord || !value.trim() ? 'edit' : 'preview')
  )
  // Record view mode: rendered text only; an empty field disappears.
  if (viewMode) {
    if (!value.trim()) return null
    return (
      <div data-has-content className={cn('flex flex-col gap-2', className)}>
        {label && <FieldLabel>{label}</FieldLabel>}
        <ShowMore enabled={fold && 'auto'} collapsedClass="max-h-96 overflow-hidden">
          <Markdown source={value} />
        </ShowMore>
      </div>
    )
  }
  return (
    // group/field: the «N / max» counter (CharCount) shows while the text is being written.
    <div className={cn('group/field relative flex flex-col gap-2', className)}>
      {/* Label row has the label's height: the compact toggle (h-7, -my-1.5 → 16px in flow, below the
          label's ≈17px) must not push the control down, so label → control is 8px like every other Field
          (docs/design-system.md → Формы). */}
      <div className="flex items-center justify-between gap-2">
        {label ? (
          <FieldLabel htmlFor={mode === 'edit' ? id : undefined} className="min-w-0">
            {label}
          </FieldLabel>
        ) : (
          <span />
        )}
        <CharCount length={value.length} max={maxLength} className="ml-auto" />
        <Segmented
          size="xs"
          className="-my-1.5 h-7 shrink-0 p-0.5 [&>button]:h-6 [&>button]:px-2.5 [&>button]:text-meta"
          value={mode}
          onChange={setMode}
          options={[
            {
              value: 'edit',
              label: (
                <>
                  <Pencil /> Текст
                </>
              )
            },
            {
              value: 'preview',
              label: (
                <>
                  <Eye /> Перегляд
                </>
              )
            }
          ]}
        />
      </div>
      {mode === 'edit' ? (
        <MarkdownTextarea
          id={id}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          maxLength={maxLength}
          style={{ minHeight }}
          className="px-4 py-3 text-lead leading-relaxed"
        />
      ) : (
        // «Перегляд» shows the text as it will read: no box, flush with the label. A bg-surface box with px-5 was
        // invisible on a surface card and left only a stray 20px indent.
        <div
          className="cursor-text"
          style={{ minHeight: `calc(${minHeight} / 2)` }}
          onDoubleClick={() => setMode('edit')}
          title="Подвійний клік — редагувати"
        >
          {value.trim() ? (
            <Markdown source={value} />
          ) : (
            <span className="text-body text-muted-foreground">
              Порожньо. Перемкніться на «Текст», щоб написати.
            </span>
          )}
        </div>
      )}
      {/* «[[» links a record from any text, but nothing said so: a quiet line under the field while writing in it,
          set in the gap below (absolute), so nothing moves when it shows. */}
      {mode === 'edit' && (
        <p className="pointer-events-none absolute top-full left-1 mt-1 flex items-center gap-1 text-meta text-muted-foreground opacity-0 transition-opacity group-focus-within/field:opacity-100">
          <Kbd>[[</Kbd> — посилання на запис
        </p>
      )}
    </div>
  )
}
