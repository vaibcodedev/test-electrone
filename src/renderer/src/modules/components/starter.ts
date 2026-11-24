import type { ComponentLanguage } from '@shared/domain/components'

/** Starter code for a new component, per language. */
export const STARTER: Record<ComponentLanguage, string> = {
  tsx: `import { useState } from 'react'
import { ArrowUpRight } from 'lucide-react'

export default function Demo() {
  const [count, setCount] = useState(0)
  return (
    <button
      onClick={() => setCount((c) => c + 1)}
      className="flex items-center gap-3 rounded-full bg-[#d4f542] py-2 pr-2 pl-5 text-sm font-medium text-[#14160f] shadow-sm transition active:scale-95"
    >
      Нажато {count}
      <span className="grid size-8 place-items-center rounded-full bg-[#14160f] text-[#d4f542]">
        <ArrowUpRight className="size-4" />
      </span>
    </button>
  )
}
`,
  jsx: `export default function Demo() {
  return (
    <div className="rounded-3xl bg-white p-6 shadow-lg">
      <h2 className="text-2xl font-semibold tracking-tight">Привет</h2>
      <p className="mt-1 text-sm text-neutral-500">Компонент на JSX + Tailwind</p>
    </div>
  )
}
`,
  html: `<div class="rounded-3xl bg-[#14160f] p-6 text-[#eef1e6]">
  <h2 class="text-2xl font-semibold tracking-tight">HTML-блок</h2>
  <p class="mt-1 text-sm opacity-70">Tailwind-классы работают и здесь</p>
</div>
`
}

/** Imports the sandboxed preview can resolve (see src/renderer/preview/main.ts). */
export const PREVIEW_IMPORTS = [
  'react',
  'lucide-react',
  'clsx',
  'tailwind-merge',
  'class-variance-authority',
  '@/lib/utils (cn)'
]
