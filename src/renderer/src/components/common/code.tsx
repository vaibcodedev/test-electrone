import { useMemo } from 'react'
import CodeMirror, { EditorView, type Extension } from '@uiw/react-codemirror'
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
    { tag: [t.link, t.url], color: 'var(--code-fn)', textDecoration: 'underline' }
  ]
})

const baseTheme = EditorView.theme({
  '&': { fontSize: '12.5px' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.65' },
  '.cm-content': { padding: '14px 0' },
  '.cm-gutters': { paddingLeft: '6px' },
  '&.cm-focused': { outline: 'none' }
})

/** Editable code with syntax highlighting (CodeMirror 6). */
export function CodeEditor({
  value,
  onChange,
  language = 'typescript',
  minHeight = '160px',
  maxHeight,
  readOnly,
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
  const extensions = useMemo(() => [...languageExtension(language), baseTheme, EditorView.lineWrapping], [language])
  return (
    <div className={cn('overflow-hidden rounded-2xl bg-[var(--code-bg)]', className)}>
      <CodeMirror
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
  maxLines
}: {
  code: string
  language?: string
  className?: string
  maxLines?: number
}) {
  const shown = maxLines ? code.split('\n').slice(0, maxLines).join('\n') : code
  const htmlOut = useMemo(() => {
    const lang = HLJS_ALIAS[language] ?? language
    try {
      return hljs.getLanguage(lang) ? hljs.highlight(shown, { language: lang }).value : hljs.highlightAuto(shown).value
    } catch {
      return shown.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
    }
  }, [shown, language])
  return (
    <pre
      className={cn(
        'selectable overflow-x-auto rounded-2xl bg-[var(--code-bg)] p-4 font-mono text-[12px] leading-relaxed text-[var(--code-fg)]',
        className
      )}
    >
      <code className="hljs" dangerouslySetInnerHTML={{ __html: htmlOut }} />
    </pre>
  )
}
