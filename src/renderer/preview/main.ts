/**
 * Component preview runtime (sandboxed iframe).
 * Receives { type: 'render', code, language, bg } from the parent, transpiles TSX/JSX with sucrase,
 * evaluates it with a tiny CommonJS shim and renders the default export (or App/Demo/Preview).
 */
import '@tailwindcss/browser'
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as ReactDOMClient from 'react-dom/client'
import * as JsxRuntime from 'react/jsx-runtime'
import * as Lucide from 'lucide-react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import * as Cva from 'class-variance-authority'
import { transform } from 'sucrase'

type RenderMessage = { type: 'render'; code: string; language: 'tsx' | 'jsx' | 'html'; bg: string }

const rootEl = document.getElementById('root')!
const errorEl = document.getElementById('error')!
let root: ReactDOMClient.Root | null = null

const cn = (...inputs: Parameters<typeof clsx>): string => twMerge(clsx(inputs))

const MODULES: Record<string, unknown> = {
  react: React,
  'react-dom': ReactDOM,
  'react-dom/client': ReactDOMClient,
  'react/jsx-runtime': JsxRuntime,
  'lucide-react': Lucide,
  clsx: { clsx, default: clsx },
  'tailwind-merge': { twMerge },
  'class-variance-authority': Cva,
  '@/lib/utils': { cn },
  '@/utils': { cn },
  'lib/utils': { cn }
}

function post(status: { ok: boolean; error?: string }): void {
  window.parent.postMessage({ source: 'vault-preview', ...status }, '*')
}

function showError(err: unknown): void {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  errorEl.textContent = msg
  post({ ok: false, error: msg })
}

class Boundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error) {
    showError(error)
  }
  render() {
    return this.state.error ? null : this.props.children
  }
}

function evaluate(code: string): React.ComponentType | null {
  const { code: js } = transform(code, {
    transforms: ['typescript', 'jsx', 'imports'],
    jsxRuntime: 'classic',
    production: true
  })
  const module = { exports: {} as Record<string, unknown> }
  const require = (name: string): unknown => {
    if (name in MODULES) return MODULES[name]
    if (/\.(css|scss)$/.test(name)) return {}
    throw new Error(`Модуль "${name}" недоступний у превʼю. Доступні: ${Object.keys(MODULES).join(', ')}`)
  }
  let rendered: React.ReactNode = null
  const render = (node: React.ReactNode): void => {
    rendered = node
  }
  const fallback =
    ';module.exports.__auto = typeof App !== "undefined" ? App : typeof Demo !== "undefined" ? Demo : typeof Preview !== "undefined" ? Preview : typeof Example !== "undefined" ? Example : undefined;'
  new Function('React', 'require', 'module', 'exports', 'render', js + fallback)(
    React,
    require,
    module,
    module.exports,
    render
  )
  if (rendered) return () => rendered as React.ReactElement
  const exp = module.exports
  const candidate =
    exp.default ?? exp.__auto ?? Object.values(exp).find((v) => typeof v === 'function')
  return typeof candidate === 'function' ? (candidate as React.ComponentType) : null
}

function renderMessage(msg: RenderMessage): void {
  document.body.dataset.bg = msg.bg
  errorEl.textContent = ''
  try {
    if (msg.language === 'html') {
      root?.unmount()
      root = null
      rootEl.innerHTML = msg.code
      post({ ok: true })
      return
    }
    const Component = evaluate(msg.code)
    if (!Component) throw new Error('Нічого показати: додайте `export default function Demo()` або виклик render(<X />)')
    if (!root) {
      rootEl.innerHTML = ''
      root = ReactDOMClient.createRoot(rootEl)
    }
    root.render(React.createElement(Boundary, { key: Date.now(), children: React.createElement(Component) }))
    post({ ok: true })
  } catch (e) {
    showError(e)
  }
}

window.addEventListener('message', (e) => {
  if (e.source !== window.parent) return
  const data = e.data as RenderMessage
  if (data?.type === 'render') renderMessage(data)
})
window.addEventListener('error', (e) => showError(e.error ?? e.message))
window.parent.postMessage({ source: 'vault-preview', ready: true }, '*')
