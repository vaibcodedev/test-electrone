import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror, { EditorView, Prec, keymap, type Extension, type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { canFormat, formatCode } from '@/lib/format-code'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { createTheme } from '@uiw/codemirror-themes'
import { tags as t } from '@lezer/highlight'
import { javascript } from '@codemirror/lang-javascript'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { sql } from '@codemirror/lang-sql'
import { StreamLanguage } from '@codemirror/language'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import hljs from 'highlight.js/lib/common'
import { cn } from '@/lib/utils'
import { useReadOnly } from './detail-mode'

/** Language ids used across modules (snippets, components, markdown fences). */
export type CodeLanguage =
  | 'typescript'
  | 'javascript'
  | 'tsx'
  | 'jsx'
  | 'graphql'
  | 'liquid'
  | 'css'
  | 'html'
  | 'json'
  | 'bash'
  | 'sql'
  | 'markdown'
  | 'text'

function languageExtension(lang: CodeLanguage): Extension[] {
  switch (lang) {
    case 'typescript':
      return [javascript({ typescript: true })]
    case 'tsx':
      return [javascript({ typescript: true, jsx: true })]
    case 'jsx':
    case 'javascript':
      return [javascript({ jsx: true })]
    case 'css':
      return [css()]
    case 'html':
    case 'liquid':
      return [html()]
    case 'json':
      return [json()]
    case 'markdown':
      return [markdown()]
    case 'sql':
      return [sql()]
    case 'bash':
      return [StreamLanguage.define(shell)]
    default:
      return []
  }
}

/** One theme for both modes: code always sits on an ink surface. Colours come from code.css variables. */
const vaultTheme = createTheme({
  theme: 'dark',
  settings: {
    background: 'var(--code-bg)',
    foreground: 'var(--code-fg)',
    caret: 'var(--lime)',
    selection: 'var(--code-selection)',
    selectionMatch: 'var(--code-selection)',
    lineHighlight: 'var(--code-line)',
    gutterBackground: 'var(--code-bg)',
    gutterForeground: 'var(--code-muted)',
    gutterBorder: 'transparent',
    fontFamily: 'var(--font-mono)'
  },
  styles: [
    { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--code-muted)', fontStyle: 'italic' },
    { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword, t.bool, t.null], color: 'var(--code-keyword)' },
    { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--code-string)' },
    { tag: [t.number], color: 'var(--code-number)' },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--code-fn)' },
    { tag: [t.typeName, t.className, t.tagName], color: 'var(--code-type)' },
    { tag: [t.attributeName, t.propertyName], color: 'var(--code-attr)' },
    { tag: [t.heading], color: 'var(--code-keyword)', fontWeight: '600' },
    { tag: [t.link, t.url], color: 'var(--code-fn)', textDecoration: 'underline' },
    // Tags used by css / html / json / sql / markdown / shell, so each language actually looks different.
    { tag: [t.atom, t.unit, t.color, t.constant(t.variableName), t.list], color: 'var(--code-number)' },
    { tag: [t.definition(t.variableName), t.definition(t.propertyName), t.labelName], color: 'var(--code-fn)' },
    { tag: [t.special(t.variableName), t.self, t.namespace], color: 'var(--code-attr)' },
    { tag: [t.operator, t.derefOperator, t.compareOperator, t.arithmeticOperator], color: 'var(--code-keyword)', opacity: '0.8' },
    { tag: [t.punctuation, t.separator, t.bracket, t.angleBracket], color: 'var(--code-muted)' },
    { tag: [t.meta, t.processingInstruction, t.documentMeta], color: 'var(--code-muted)' },
    { tag: [t.monospace, t.escape], color: 'var(--code-string)' },
    { tag: [t.quote], color: 'var(--code-muted)', fontStyle: 'italic' },
    { tag: [t.emphasis], fontStyle: 'italic' },
    { tag: [t.strong], fontWeight: '700' },
    { tag: [t.invalid], color: '#ff7b7b' }
  ]
})

const baseTheme = EditorView.theme({
  '&': { fontSize: '12.5px' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.65' },
  '.cm-content': { padding: '14px 0' },
  // Gutter width in `ch`: it follows the real mono font. Measured in px it was computed with the fallback font
  // before JetBrains Mono loaded, and wider digits got clipped at the left edge.
  '.cm-gutters': { paddingLeft: '8px' },
  '.cm-lineNumbers .cm-gutterElement': { minWidth: '3ch', padding: '0 10px 0 2px' },
  '&.cm-focused': { outline: 'none' },
  // Active line only while editing: an unfocused editor (e.g. an empty field) shows no stray stripe.
  '&:not(.cm-focused) .cm-activeLine, &:not(.cm-focused) .cm-activeLineGutter': { backgroundColor: 'transparent' },
  '.cm-placeholder': { color: 'var(--code-muted)' }
})

/** Editable code with syntax highlighting (CodeMirror 6). */
export function CodeEditor({
  value,
  onChange,
  language = 'typescript',
  minHeight = '160px',
  maxHeight,
  readOnly: readOnlyProp,
  className,
  placeholder,
  lineNumbers = true,
  autoFocus
}: {
  value: string
  onChange?: (value: string) => void
  language?: CodeLanguage
  minHeight?: string
  maxHeight?: string
  readOnly?: boolean
  className?: string
  placeholder?: string
  lineNumbers?: boolean
  autoFocus?: boolean
}) {
  const viewMode = useReadOnly()
  const readOnly = readOnlyProp || viewMode
  const cm = useRef<ReactCodeMirrorRef>(null)
  const [formatting, setFormatting] = useState(false)
  const formattable = !readOnly && canFormat(language)

  // Prettier: replaces the whole doc in one transaction, so Ctrl+Z restores the original; onChange fires from it.
  const runFormat = useCallback(async (): Promise<void> => {
    const view = cm.current?.view
    if (!view || !canFormat(language)) return
    setFormatting(true)
    try {
      const source = view.state.doc.toString()
      const formatted = await formatCode(source, language)
      if (formatted !== source) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: formatted } })
    } catch (e) {
      toast.error(`Не вдалося відформатувати: ${String((e as Error).message ?? e).split('\n')[0]}`)
    } finally {
      setFormatting(false)
    }
  }, [language])
  const formatRef = useRef(runFormat)
  useEffect(() => {
    formatRef.current = runFormat
  })

  const extensions = useMemo(
    () => [
      ...languageExtension(language),
      baseTheme,
      EditorView.lineWrapping,
      Prec.high(keymap.of([{ key: 'Shift-Alt-f', run: () => (void formatRef.current(), true) }]))
    ],
    [language]
  )

  // Re-measure once web fonts are in: gutter and line heights depend on the mono font.
  useEffect(() => {
    void document.fonts?.ready.then(() => cm.current?.view?.requestMeasure())
  }, [])

  return (
    <div className={cn('relative flex min-w-0 flex-col overflow-hidden rounded-2xl bg-[var(--code-bg)]', className)}>
      {!readOnly && (
        <div className="flex justify-end px-2 pt-2">
          <Tooltip>
            <TooltipTrigger asChild>
              {/* span: a disabled button doesn't fire pointer events, the tooltip still has to explain why */}
              <span tabIndex={formattable ? -1 : 0}>
                <Button
                  type="button"
                  variant="subtle"
                  size="xs"
                  disabled={!formattable || formatting}
                  onClick={() => void runFormat()}
                  className="bg-white/8 text-[var(--code-fg)] hover:bg-white/14"
                >
                  <Wand2 /> Форматувати
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{formattable ? 'Prettier · Shift+Alt+F' : 'Форматування недоступне для цієї мови'}</TooltipContent>
          </Tooltip>
        </div>
      )}
      <CodeMirror
        ref={cm}
        value={value}
        onChange={onChange}
        theme={vaultTheme}
        extensions={extensions}
        readOnly={readOnly}
        editable={!readOnly}
        minHeight={minHeight}
        maxHeight={maxHeight}
        placeholder={placeholder}
        autoFocus={autoFocus}
        basicSetup={{
          lineNumbers,
          foldGutter: false,
          highlightActiveLine: !readOnly,
          highlightActiveLineGutter: !readOnly,
          autocompletion: false,
          searchKeymap: true,
          tabSize: 2
        }}
      />
    </div>
  )
}

const HLJS_ALIAS: Partial<Record<string, string>> = {
  tsx: 'typescript',
  jsx: 'javascript',
  liquid: 'xml',
  html: 'xml',
  text: 'plaintext',
  graphql: 'graphql'
}

/** Read-only highlighted code (cheap: highlight.js, no editor instance). */
export function CodeBlock({
  code,
  language = 'typescript',
  className,
  maxLines,
  preview
}: {
  code: string
  language?: string
  className?: string
  maxLines?: number
  /**
   * Card preview: no scrolling or scrollbars, lines wrap, only the first `maxLines` (default 6) are shown with a
   * soft fade when clipped; not interactive, so the surrounding card stays clickable.
   */
  preview?: boolean
}) {
  const limit = preview ? (maxLines ?? 6) : maxLines
  const lines = code.split('\n')
  const clipped = !!limit && lines.length > limit
  const shown = limit ? lines.slice(0, limit).join('\n') : code
  const htmlOut = useMemo(() => {
    const lang = HLJS_ALIAS[language] ?? language
    try {
      return hljs.getLanguage(lang) ? hljs.highlight(shown, { language: lang }).value : hljs.highlightAuto(shown).value
    } catch {
      return shown.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
    }
  }, [shown, language])
  if (preview) {
    return (
      <pre
        aria-hidden
        className={cn(
          'pointer-events-none overflow-hidden rounded-2xl bg-[var(--code-bg)] p-4 font-mono text-caption leading-relaxed whitespace-pre-wrap text-[var(--code-fg)] select-none [overflow-wrap:anywhere]',
          clipped && '[mask-image:linear-gradient(to_bottom,black_60%,transparent)]',
          className
        )}
      >
        <code className="hljs" dangerouslySetInnerHTML={{ __html: htmlOut }} />
      </pre>
    )
  }
  return (
    <pre
      className={cn(
        'selectable overflow-x-auto rounded-2xl bg-[var(--code-bg)] p-4 font-mono text-caption leading-relaxed text-[var(--code-fg)]',
        className
      )}
    >
      <code className="hljs" dangerouslySetInnerHTML={{ __html: htmlOut }} />
    </pre>
  )
}

/* ───────────── Language detection ───────────── */

const SHELL_RE = /^(\$ |#!\/|(sudo|npm|npx|pnpm|yarn|bun|git|cd|ls|mkdir|rm|cp|mv|curl|wget|docker|kubectl|echo|export|brew|pip|apt|chmod)\b)/m
const SQL_RE = /^\s*(select\s.+\sfrom\s|insert\s+into\s|update\s+\w+\s+set\s|delete\s+from\s|create\s+(table|index|view)\s|alter\s+table\s|with\s+\w+\s+as\s*\()/im
const MD_RE = /^(#{1,6}\s+\S|[-*+]\s+\S|\d+\.\s+\S|>\s|```)/m
const GRAPHQL_RE = /^\s*(query|mutation|subscription|fragment)\b[^{]*\{/m

/** highlight.js names → our CodeLanguage (only languages the app supports). */
const FROM_HLJS: Record<string, CodeLanguage> = {
  typescript: 'typescript',
  javascript: 'javascript',
  css: 'css',
  scss: 'css',
  xml: 'html',
  json: 'json',
  bash: 'bash',
  shell: 'bash',
  sql: 'sql',
  markdown: 'markdown',
  graphql: 'graphql'
}

/**
 * Guesses the language of pasted code. Cheap heuristics first, then highlight.js auto-detection
 * over our languages only. Returns null when unsure — the UI suggests a switch, never forces it.
 */
export function detectLanguage(code: string): CodeLanguage | null {
  const src = code.trim()
  if (src.length < 2) return null
  if (/^[[{]/.test(src)) {
    try {
      JSON.parse(src)
      return 'json'
    } catch {
      /* not JSON: an object literal or a block, keep guessing */
    }
  }
  if (/^\{%|\{\{[^}]+\}\}/.test(src) && /\{%\s*(if|for|assign|render|schema)\b/.test(src)) return 'liquid'
  if (/^</.test(src)) {
    if (/^<!doctype|^<html|^<(div|section|span|p|ul|head|body|meta|link|script)[\s>]/i.test(src) && !/\bclassName=|\{[^}]*\}/.test(src)) return 'html'
    return 'tsx'
  }
  if (GRAPHQL_RE.test(src)) return 'graphql'
  if (SQL_RE.test(src)) return 'sql'
  if (SHELL_RE.test(src)) return 'bash'
  if (/\breturn\s*\(?\s*</.test(src) || /<[A-Z]\w*[\s/>]/.test(src)) return /:\s*\w+(\[\])?\s*[,)=]|interface\s|type\s+\w+\s*=/.test(src) ? 'tsx' : 'jsx'
  if (MD_RE.test(src) && !/[;{}]\s*$/m.test(src)) return 'markdown'
  try {
    const res = hljs.highlightAuto(src, Object.keys(FROM_HLJS))
    if (res.language && res.relevance >= 6) return FROM_HLJS[res.language] ?? null
  } catch {
    /* fall through */
  }
  return null
}

/** Human label for a suggestion like «Схоже на JSON». */
export const LANGUAGE_LABEL: Record<CodeLanguage, string> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  tsx: 'TSX',
  jsx: 'JSX',
  graphql: 'GraphQL',
  liquid: 'Liquid',
  css: 'CSS',
  html: 'HTML',
  json: 'JSON',
  bash: 'Bash',
  sql: 'SQL',
  markdown: 'Markdown',
  text: 'Текст'
}
