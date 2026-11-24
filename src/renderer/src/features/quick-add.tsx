import { useEffect, useRef, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { toast } from 'sonner'
import { ENTITY_META } from '@shared/entity-types'
import { QUICK_ADD_TARGETS, type QuickAddTarget } from '@shared/domain/system'
import { api } from '@/lib/api'
import { invalidateAll } from '@/lib/query'
import { ENTITY_ICON } from '@/app/navigation'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useUi } from '@/stores/ui-store'
import { Kbd } from '@/components/common/page'
import { cn } from '@/lib/utils'

const TARGET_LABEL: Record<QuickAddTarget, string> = {
  idea: 'Идея',
  card: 'Задача',
  claude: 'Заметка',
  snippet: 'Сниппет',
  bookmark: 'Закладка',
  word: 'Слово',
  event: 'Событие'
}

const PLACEHOLDER: Record<QuickAddTarget, string> = {
  idea: 'Что пришло в голову?',
  card: 'Задача в первую колонку доски',
  claude: 'Заметка для раздела Claude',
  snippet: 'Название сниппета, код — со второй строки',
  bookmark: 'Ссылка или название статьи',
  word: 'deploy — развернуть',
  event: 'Событие на завтра 10:00'
}

const TARGET_TYPE: Record<QuickAddTarget, keyof typeof ENTITY_META> = {
  idea: 'idea',
  card: 'card',
  claude: 'claude',
  snippet: 'snippet',
  bookmark: 'bookmark',
  word: 'word',
  event: 'event'
}

/**
 * One-line capture used by both the global-hotkey popup window and the in-app dialog.
 * Tab / Shift+Tab switches the target, Enter saves, Shift+Enter adds a line, Esc closes.
 */
export function QuickAddForm({ onDone, initialTarget }: { onDone: () => void; initialTarget?: QuickAddTarget }) {
  const [target, setTarget] = useState<QuickAddTarget>(initialTarget ?? 'idea')
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    ref.current?.focus()
  }, [target])

  const submit = async (): Promise<void> => {
    if (!text.trim() || saving) return
    setSaving(true)
    try {
      const created = await api.app.quickAdd({ target, text })
      toast.success(`${ENTITY_META[created.type].label} добавлена: ${created.title}`)
      setText('')
      invalidateAll()
      onDone()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const cycle = (dir: 1 | -1): void => {
    const i = QUICK_ADD_TARGETS.indexOf(target)
    setTarget(QUICK_ADD_TARGETS[(i + dir + QUICK_ADD_TARGETS.length) % QUICK_ADD_TARGETS.length])
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {QUICK_ADD_TARGETS.map((t) => {
          const Icon = ENTITY_ICON[TARGET_TYPE[t]]
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTarget(t)}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] transition-colors',
                target === t ? 'bg-ink text-ink-foreground' : 'bg-surface hover:bg-accent'
              )}
            >
              <Icon className={cn('size-3.5', target === t && 'text-lime')} />
              {TARGET_LABEL[t]}
            </button>
          )
        })}
      </div>
      <div className="flex items-end gap-2 rounded-2xl bg-surface p-2 pl-4 focus-within:ring-[3px] focus-within:ring-ring/25">
        <textarea
          ref={ref}
          value={text}
          rows={2}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER[target]}
          className="max-h-40 min-h-12 flex-1 resize-none bg-transparent py-2 text-[15px] outline-none [field-sizing:content] placeholder:text-muted-foreground"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void submit()
            } else if (e.key === 'Tab') {
              e.preventDefault()
              cycle(e.shiftKey ? -1 : 1)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              onDone()
            }
          }}
        />
        <button
          type="button"
          disabled={!text.trim() || saving}
          onClick={() => void submit()}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-lime transition-opacity disabled:opacity-40"
          aria-label="Сохранить"
        >
          <ArrowUp className="size-5" />
        </button>
      </div>
      <div className="flex items-center gap-3 text-[11.5px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Kbd>Enter</Kbd> сохранить
        </span>
        <span className="flex items-center gap-1">
          <Kbd>Tab</Kbd> тип
        </span>
        <span className="flex items-center gap-1">
          <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> новая строка
        </span>
      </div>
    </div>
  )
}

/** In-app version (sidebar "+" and command palette). */
export function QuickAddDialog() {
  const open = useUi((s) => s.quickAddOpen)
  const setOpen = useUi((s) => s.setQuickAddOpen)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="rounded-3xl p-5 sm:max-w-[600px]" showCloseButton={false}>
        <DialogTitle className="font-display text-xl">Быстро добавить</DialogTitle>
        <QuickAddForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

/** Route rendered inside the frameless popup window opened by the global hotkey. */
export function QuickAddWindow() {
  const [key, setKey] = useState(0)
  const [target, setTarget] = useState<QuickAddTarget | undefined>()
  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    return window.vault.on('quick-add:open', (p) => {
      const t = (p as { target?: string }).target
      setTarget(QUICK_ADD_TARGETS.includes(t as QuickAddTarget) ? (t as QuickAddTarget) : undefined)
      setKey((k) => k + 1)
    })
  }, [])
  return (
    <div className="h-screen p-3">
      <div className="drag flex h-full flex-col rounded-[26px] bg-card p-5 shadow-2xl ring-1 ring-border">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-full bg-lime text-[12px] font-semibold text-lime-foreground">V</span>
          <span className="font-display text-[18px]">Быстро добавить</span>
        </div>
        <div className="no-drag">
          <QuickAddForm key={key} initialTarget={target} onDone={() => void api.app.closeQuickAdd()} />
        </div>
      </div>
    </div>
  )
}
