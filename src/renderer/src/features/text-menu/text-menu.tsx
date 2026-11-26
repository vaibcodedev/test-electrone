import { Fragment, useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import type { EditorView } from '@codemirror/view'
import {
  BookPlus,
  ClipboardPaste,
  ClipboardType,
  Copy,
  ExternalLink,
  Link2,
  Scissors,
  SquareCode,
  TextCursorInput,
  type LucideIcon
} from 'lucide-react'
import { toast } from 'sonner'
import type { TextMenuRequest } from '@shared/domain/text-menu'
import { ApiError, api } from '@/lib/api'
import { openUrl } from '@/lib/open-url'
import { reportError } from '@/lib/error-reporting'
import { useMainEvent } from '@/hooks/use-main-events'
import { copyText } from '@/components/common/copy-button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  codeBlockText,
  editorAt,
  focusField,
  giveBackFocus,
  holdFocus,
  snapshotFocus,
  swallowNextPress,
  takeOrigin,
  watchContextMenu,
  type FocusHold,
  type FocusSnapshot
} from './dom'
import { textMenuGroups, type TextMenuAction, type TextMenuEntry } from './model'

interface Session {
  req: TextMenuRequest
  groups: TextMenuEntry[][]
  x: number
  y: number
  snapshot: FocusSnapshot
  hold: FocusHold
  view: EditorView | null
  codeText: string | null
}

const ICONS: Partial<Record<string, LucideIcon>> = {
  cut: Scissors,
  copy: Copy,
  paste: ClipboardPaste,
  pasteAndMatchStyle: ClipboardType,
  selectAll: TextCursorInput,
  'add-word': BookPlus,
  'open-link': ExternalLink,
  'copy-link': Link2,
  'copy-block': SquareCode
}

const MAC = window.vault?.platform === 'darwin'

async function perform(action: TextMenuAction, s: Session): Promise<void> {
  const id = s.req.id
  try {
    switch (action.kind) {
      case 'edit':
        // The field went away while the menu was open (a refetch re-rendered it): nothing to edit.
        if (s.req.editable && !s.snapshot.el?.isConnected) return
        await api.textMenu.edit({ id, command: action.command })
        return
      case 'replace':
        await api.textMenu.replaceMisspelling({ id, word: action.word })
        return
      case 'addWord':
        await api.textMenu.addToDictionary({ id })
        return
      case 'openLink':
        if (s.req.link) await openUrl(s.req.link)
        return
      case 'copyLink':
        if (s.req.link) await copyText(s.req.link, 'Адресу скопійовано')
        return
      case 'copyBlock':
        if (s.codeText !== null) await copyText(s.codeText, 'Блок коду скопійовано')
        return
      case 'none':
        return
    }
  } catch (e) {
    if (e instanceof ApiError) toast.error(e.message)
    else {
      toast.error('Не вдалося виконати дію. Спробуйте ще раз.')
      reportError(e, 'text-menu')
    }
  }
}

/**
 * Vault's right-click menu for text — fields, the Markdown and code editors, selected text, links, code blocks
 * (main/system/text-menu.ts asks for it, the commands go back there). Mounted once per window. The menu takes
 * focus for the keyboard, but the field it serves never notices (dom.ts → holdFocus): when it closes, focus,
 * caret and selection are back where they were before the command runs.
 */
export function TextMenu(): ReactElement {
  const [session, setSession] = useState<Session | null>(null)
  const [open, setOpen] = useState(false)
  /** The session still holding focus (not yet given back). */
  const active = useRef<Session | null>(null)
  const chosen = useRef<TextMenuAction | null>(null)
  const latest = useRef(0)

  useEffect(() => watchContextMenu(), [])

  const finish = useCallback((s: Session) => {
    if (active.current !== s) return
    active.current = null
    const action = chosen.current
    chosen.current = null
    giveBackFocus(s.snapshot, s.hold, s.view)
    s.hold.release()
    if (action) void perform(action, s)
  }, [])

  // After the menu closed: its focus trap is already off, so focus can go back (and the command run) at once,
  // not after the fade-out.
  useEffect(() => {
    if (!open && session) finish(session)
  }, [open, session, finish])

  useEffect(
    () => () => {
      active.current?.hold.release()
      active.current = null
    },
    []
  )

  const onRequest = useCallback(
    async (req: TextMenuRequest) => {
      latest.current = req.id
      const from = takeOrigin()
      const target = from?.target ?? document.activeElement
      if (!(target instanceof Element)) return
      const view = await editorAt(target)
      if (latest.current !== req.id) return
      const codeText = codeBlockText(target, view)
      const groups = textMenuGroups(req, { codeBlock: codeText !== null, mac: MAC })
      if (!groups.length) return
      if (active.current) finish(active.current)
      if (req.editable) focusField(target, view)
      const snapshot = snapshotFocus()
      const next: Session = {
        req,
        groups,
        x: from?.x ?? req.x,
        y: from?.y ?? req.y,
        snapshot,
        hold: holdFocus(snapshot.el),
        view: view && view.contentDOM === snapshot.el ? view : null,
        codeText
      }
      active.current = next
      chosen.current = null
      setSession(next)
      setOpen(true)
    },
    [finish]
  )
  const onOpenEvent = useCallback((req: TextMenuRequest) => void onRequest(req), [onRequest])
  useMainEvent('text-menu:open', onOpenEvent)

  // The root stays mounted: Radix learns from the last key or press whether the menu was opened from the
  // keyboard (then the first row gets focus) — a root mounted with the menu would miss Shift+F10.
  return (
    <DropdownMenu open={open && !!session} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        {/* Where the pointer (or the caret, from the keyboard) was: the menu hangs from this point. */}
        <span
          aria-hidden
          className="pointer-events-none fixed size-0"
          style={{ left: session?.x ?? 0, top: session?.y ?? 0 }}
        />
      </DropdownMenuTrigger>
      {session && <DropdownMenuContent
        key={session.req.id}
        data-text-menu=""
        layerBranch
        loop
        side="bottom"
        align="start"
        sideOffset={2}
        aria-label="Дії з текстом"
        aria-labelledby={undefined}
        // Fading out it is inert: a row under a moving pointer (or Radix's own late keyboard focus) would take
        // focus back from the field it was just given to, and it would fall to <body> when the menu goes.
        inert={!open}
        className="min-w-56"
        // Focus goes back in finish(), right when the menu closes; Radix would do it again after the fade-out.
        onCloseAutoFocus={(e) => e.preventDefault()}
        // A left click outside only closes the menu. A right click goes on to open the menu where it landed.
        onPointerDownOutside={(e) => e.detail.originalEvent.button === 0 && swallowNextPress()}
      >
        {session.groups.map((group, i) => (
          <Fragment key={group[0]?.key ?? i}>
            {i > 0 && <DropdownMenuSeparator />}
            {group.map((entry) => {
              const Icon = ICONS[entry.key]
              return (
                <DropdownMenuItem
                  key={entry.key}
                  inset={!Icon}
                  disabled={entry.disabled}
                  className={entry.suggestion ? 'font-semibold' : undefined}
                  onSelect={() => {
                    chosen.current = entry.action
                  }}
                >
                  {Icon && <Icon />}
                  <span className="truncate">{entry.label}</span>
                  {entry.shortcut && <DropdownMenuShortcut>{entry.shortcut}</DropdownMenuShortcut>}
                </DropdownMenuItem>
              )
            })}
          </Fragment>
        ))}
      </DropdownMenuContent>}
    </DropdownMenu>
  )
}
