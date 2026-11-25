import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { ArrowUp } from 'lucide-react'
import { toast } from 'sonner'
import { ENTITY_META } from '@shared/entity-types'
import { QUICK_ADD_TARGETS, quickAddSchema, type QuickAddTarget } from '@shared/domain/system'
import { api } from '@/lib/api'
import { useApiMutation } from '@/lib/query'
import { limitsOf } from '@/lib/limits'
import { ENTITY_ICON } from '@/app/navigation'
import { restoreFocus, useUi } from '@/stores/ui-store'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

/** Same limit as quickAddSchema.text (first line + body in one field). */
const QUICK_LIMITS = limitsOf(quickAddSchema)

const TARGET_LABEL: Record<QuickAddTarget, string> = {
  idea: 'Ідея',
  card: 'Завдання',
  claude: 'Claude',
  snippet: 'Сніпет',
  bookmark: 'Закладка',
  word: 'Слово',
  event: 'Подія'
}

const PLACEHOLDER: Record<QuickAddTarget, string> = {
  idea: 'Що спало на думку?',
  card: 'Завдання в першу колонку дошки',
  claude: 'Промт або нотатка для Claude',
  snippet: 'Назва сніпета, код — з другого рядка',
  bookmark: 'Посилання або назва статті',
  word: 'deploy — розгорнути',
  event: 'Назва події — стане на завтра о 10:00'
}

/**
 * One-line capture used by both the global-hotkey popup window and the in-app dialog.
 * Tab / Shift+Tab switches the target, Enter saves, Shift+Enter adds a line, Esc closes.
 */
export function QuickAddForm({
  onDone,
  onOpen,
  initialTarget,
  initialText
}: {
  onDone: () => void
  /** In-app dialog: the success toast gets «Відкрити». The popup window closes at once, so it has none. */
  onOpen?: (route: string) => void
  initialTarget?: QuickAddTarget
  initialText?: string
}): ReactElement {
  const [target, setTarget] = useState<QuickAddTarget>(initialTarget ?? 'idea')
  const [text, setText] = useState(initialText ?? '')
  const add = useApiMutation('app', 'quickAdd')
  const ref = useRef<HTMLTextAreaElement>(null)

  // Focus follows the target switch (Tab, chips); on mount it puts the popup window's caret in the field.
  useEffect(() => {
    ref.current?.focus()
  }, [target])

  const submit = (): void => {
    if (!text.trim() || add.isPending) return
    add.mutate(
      { target, text },
      {
        onSuccess: (created) => {
          const route = ENTITY_META[created.type].route(created.id)
          toast.success(
            `Додано: ${ENTITY_META[created.type].label} — ${created.title}`,
            onOpen ? { action: { label: 'Відкрити', onClick: () => onOpen(route) } } : undefined
          )
          setText('')
          onDone()
        }
      }
    )
  }

  const cycle = (dir: 1 | -1): void => {
    const i = QUICK_ADD_TARGETS.indexOf(target)
    setTarget(QUICK_ADD_TARGETS[(i + dir + QUICK_ADD_TARGETS.length) % QUICK_ADD_TARGETS.length])
  }

  return (
    <div className="flex flex-col gap-3">
      <ToggleGroup
        type="single"
        variant="chip"
        size="sm"
        value={target}
        onValueChange={(v) => v && setTarget(v as QuickAddTarget)}
        aria-label="Куди додати"
      >
        {QUICK_ADD_TARGETS.map((t) => {
          const Icon = ENTITY_ICON[t]
          return (
            <ToggleGroupItem key={t} value={t}>
              <Icon />
              {TARGET_LABEL[t]}
            </ToggleGroupItem>
          )
        })}
      </ToggleGroup>
      <InputGroup className="rounded-2xl">
        <InputGroupTextarea
          ref={ref}
          aria-label={`Текст: ${TARGET_LABEL[target]}`}
          value={text}
          rows={2}
          maxLength={QUICK_LIMITS.text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER[target]}
          className="max-h-40 min-h-12 px-4 text-lead"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            } else if (e.key === 'Tab') {
              e.preventDefault()
              cycle(e.shiftKey ? -1 : 1)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              onDone()
            }
          }}
        />
        <InputGroupAddon align="inline-end" className="self-end pb-2">
          <InputGroupButton
            size="icon-sm"
            variant="default"
            className="size-10 rounded-full"
            disabled={!text.trim() || add.isPending}
            onClick={submit}
            aria-label="Зберегти"
          >
            {add.isPending ? <Spinner /> : <ArrowUp className="size-5" />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <div className="flex flex-wrap items-center gap-3 text-meta text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Kbd>Enter</Kbd> зберегти
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>Tab</Kbd> змінити тип
        </span>
        <span className="flex items-center gap-1.5">
          <KbdGroup>
            <Kbd>Shift</Kbd>
            <Kbd>Enter</Kbd>
          </KbdGroup>
          новий рядок
        </span>
      </div>
    </div>
  )
}

/** In-app version (sidebar "+" and command palette). */
export function QuickAddDialog(): ReactElement {
  const open = useUi((s) => s.quickAddOpen)
  const target = useUi((s) => s.quickAddTarget)
  const initialText = useUi((s) => s.quickAddText)
  const setOpen = useUi((s) => s.setQuickAddOpen)
  const navigate = useNavigate()
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="rounded-3xl p-5 sm:max-w-[600px]"
        showCloseButton={false}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).querySelector('textarea')?.focus()
        }}
        onCloseAutoFocus={restoreFocus}
      >
        <DialogTitle className="font-display text-heading">Швидко додати</DialogTitle>
        <DialogDescription className="sr-only">Enter зберігає, Tab змінює тип запису</DialogDescription>
        <QuickAddForm
          key={`${target ?? 'default'}:${initialText ?? ''}`}
          initialTarget={target}
          initialText={initialText}
          onOpen={(route) => navigate(route)}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

/** Route rendered inside the frameless popup window opened by the global hotkey. */
export function QuickAddWindow(): ReactElement {
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
          <Avatar className="size-7">
            <AvatarFallback className="bg-lime text-caption font-semibold text-lime-foreground">V</AvatarFallback>
          </Avatar>
          <span className="font-display text-heading">Швидко додати</span>
        </div>
        <div className="no-drag">
          <QuickAddForm key={key} initialTarget={target} onDone={() => void api.app.closeQuickAdd()} />
        </div>
      </div>
    </div>
  )
}
