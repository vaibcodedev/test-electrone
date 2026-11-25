import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type Ref,
  type SyntheticEvent
} from 'react'
import { Annotation, Compartment, EditorState, Transaction } from '@codemirror/state'
import { EditorView, placeholder as placeholderExtension } from '@codemirror/view'
import { Link2Off } from 'lucide-react'
import { toast } from 'sonner'
import type { EntitySummary } from '@shared/domain/common'
import { ENTITY_TYPES } from '@shared/entity-types'
import { wikiLink } from '@shared/wikilinks'
import { ENTITY_ICON } from '@/app/navigation'
import { useWikiLinkTargets } from '@/hooks/use-wiki-link-targets'
import { closeMenu, dismissMenu, openMenu, type MenuTrigger } from '@/lib/md-editor/menu'
import { setLinkTargets } from '@/lib/md-editor/link-chips'
import {
  filterSlashCommands,
  slashCommandEdit,
  type SlashCommand
} from '@/lib/md-editor/slash-commands'
import { diffText, lengthLimit, markdownEditorSetup, type MenuKey } from '@/lib/md-editor/setup'
import { useFieldControl, useFieldCount } from '@/components/ui/field-control'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { SlashMenuList, WikiMenuList } from './markdown-menus'

/** A value set from outside (the record reverted, another window): not echoed back through onChange. */
const External = Annotation.define<boolean>()

/** The chip icon: the same inline icon as a record link in rendered Markdown (wiki-link.tsx). */
const CHIP_ICON = 'mr-1 inline size-[0.95em] align-[-0.125em]'

const NO_ROOM = 'Блок не вміщається: у полі закінчилося місце'

export interface MarkdownEditorHandle {
  focus: () => void
}

/**
 * The text editor of a Markdown field (CodeMirror 6; shadcn has no editor): controlled `value` + `onChange`,
 * `maxLength`, a placeholder, grows with the text like a Textarea and is framed like one. Inside:
 * - record links `[Назва](vault:…)` show as chips with the record's current title (lib/md-editor/link-chips.ts);
 * - `/` at the start of a line opens the block menu, `[[` the record menu (lib/md-editor/menu.ts);
 * - lists continue on Enter, Tab nests an item, Ctrl+B / Ctrl+I / Ctrl+K wrap the selection (smart-keys.ts).
 * One view per mounted field, made once; a new `value` from outside is applied as the smallest edit, not by
 * rebuilding the view.
 */
export function MarkdownEditor({
  id,
  value,
  onChange,
  placeholder,
  maxLength,
  minHeight,
  labelledBy,
  label,
  describedBy,
  ref
}: {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  maxLength?: number
  minHeight: string
  /** The id of the visible label. */
  labelledBy?: string
  /** The field's name when there is no visible label. */
  label?: string
  /** Ids of quiet hints about the field (the «[[ · /» line under it). */
  describedBy?: string
  ref?: Ref<MarkdownEditorHandle>
}): ReactElement {
  const host = useRef<HTMLDivElement>(null)
  const icons = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  /** The text this editor last reported (or was given): a `value` equal to it changes nothing. */
  const emitted = useRef(value)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })
  const [menu, setMenu] = useState<MenuTrigger | null>(null)
  const menuFrom = useRef(0)
  const listKeys = useRef<((key: MenuKey) => boolean) | null>(null)
  const shownRef = useRef(false)
  const [aria, setAria] = useState<{ list?: string; option?: string }>({})
  const config = useMemo(
    () => ({ attrs: new Compartment(), limit: new Compartment(), placeholder: new Compartment() }),
    []
  )
  const field = useFieldControl(id)
  useFieldCount(id, value.length, maxLength)

  useImperativeHandle(ref, () => ({ focus: () => viewRef.current?.focus() }), [])

  useLayoutEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: emitted.current,
        extensions: [
          markdownEditorSetup({
            onMenuKey: (key) => {
              if (!shownRef.current) return false
              if (key === 'Escape') {
                view.dispatch({ effects: dismissMenu.of(null) })
                return true
              }
              return listKeys.current?.(key) ?? false
            },
            icons: (key) =>
              icons.current?.querySelector(`[data-icon-for="${key}"]`)?.cloneNode(true) ?? null
          }),
          config.attrs.of([]),
          config.limit.of([]),
          config.placeholder.of([]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !u.transactions.some((tr) => tr.annotation(External))) {
              const text = u.state.doc.toString()
              emitted.current = text
              onChangeRef.current(text)
            }
            const next = openMenu(u.state)
            if (next !== openMenu(u.startState)) {
              if (next) menuFrom.current = next.from
              setMenu(next)
            }
          })
        ]
      })
    })
    viewRef.current = view
    return () => {
      viewRef.current = null
      view.destroy()
    }
  }, [config])

  // A new value from outside (revert, refetch, another window) — not the echo of what was just typed. Not in the
  // undo history: Ctrl+Z takes back the person's own edits, not the server's.
  useLayoutEffect(() => {
    const view = viewRef.current
    if (!view || value === emitted.current) return
    emitted.current = value
    const doc = view.state.doc.toString()
    if (doc === value) return
    view.dispatch({
      changes: diffText(doc, value),
      annotations: [External.of(true), Transaction.addToHistory.of(false)]
    })
  }, [value])

  useLayoutEffect(() => {
    viewRef.current?.dispatch({
      effects: config.limit.reconfigure(maxLength ? lengthLimit(maxLength) : [])
    })
  }, [config, maxLength])

  useLayoutEffect(() => {
    viewRef.current?.dispatch({
      effects: config.placeholder.reconfigure(placeholder ? placeholderExtension(placeholder) : [])
    })
  }, [config, placeholder])

  const describedByAll = [field.describedBy, describedBy].filter(Boolean).join(' ') || undefined
  // A «/» query no block matches is no menu: the keys go to the text again.
  const shown = !!menu && (menu.kind === 'wiki' || filterSlashCommands(menu.query).length > 0)
  useLayoutEffect(() => {
    shownRef.current = shown
  })
  const list = shown ? aria.list : undefined
  const option = shown ? aria.option : undefined
  useLayoutEffect(() => {
    const attrs: Record<string, string> = { id }
    if (labelledBy) attrs['aria-labelledby'] = labelledBy
    else attrs['aria-label'] = label || placeholder || 'Текст'
    if (describedByAll) attrs['aria-describedby'] = describedByAll
    if (field.invalid) attrs['aria-invalid'] = 'true'
    if (placeholder) attrs['aria-placeholder'] = placeholder
    if (list) attrs['aria-controls'] = list
    if (option) attrs['aria-activedescendant'] = option
    viewRef.current?.dispatch({
      effects: config.attrs.reconfigure(EditorView.contentAttributes.of(attrs))
    })
  }, [config, id, labelledBy, label, placeholder, describedByAll, field.invalid, list, option])

  // Current titles of the linked records for the chips: one request per text, like rendered Markdown.
  const targets = useWikiLinkTargets(value)
  useLayoutEffect(() => {
    viewRef.current?.dispatch({ effects: setLinkTargets.of(targets) })
  }, [targets])

  const onActive = useCallback((listId: string | undefined, optionId: string | undefined) => {
    setAria((prev) =>
      prev.list === listId && prev.option === optionId ? prev : { list: listId, option: optionId }
    )
  }, [])

  // The menu hangs under the `/` or `[[` it was opened from, and follows it when the text scrolls or wraps.
  const [anchor] = useState(() => {
    let last = new DOMRect()
    return {
      current: {
        getBoundingClientRect: (): DOMRect => {
          const view = viewRef.current
          if (!view) return last
          try {
            const at = view.coordsAtPos(Math.min(menuFrom.current, view.state.doc.length), 1)
            if (at) last = new DOMRect(at.left, at.top, 0, at.bottom - at.top)
          } catch {
            // Measured during an editor update: the previous place is a frame old at most.
          }
          return last
        },
        // floating-ui listens to the scrolling and resizing of this element's ancestors.
        get contextElement(): Element | undefined {
          return viewRef.current?.contentDOM
        }
      }
    }
  })

  const close = (): void => viewRef.current?.dispatch({ effects: closeMenu.of(null) })

  const insertLink = (item: EntitySummary): void => {
    const view = viewRef.current
    const trigger = view && openMenu(view.state)
    if (!view || !trigger) return
    const link = wikiLink(item, item.title)
    const to = view.state.selection.main.head
    if (maxLength && view.state.doc.length - (to - trigger.from) + link.length > maxLength) {
      toast.error('Посилання не вміщається: у полі закінчилося місце')
      return
    }
    view.dispatch({
      changes: { from: trigger.from, to, insert: link },
      selection: { anchor: trigger.from + link.length },
      effects: closeMenu.of(null),
      scrollIntoView: true,
      userEvent: 'input.complete'
    })
    view.focus()
  }

  const runCommand = (command: SlashCommand): void => {
    const view = viewRef.current
    const trigger = view && openMenu(view.state)
    if (!view || !trigger) return
    const spec = slashCommandEdit(
      view.state,
      command.id,
      trigger.from,
      view.state.selection.main.head
    )
    const tr = view.state.update(spec, {
      // «Посилання на запис» leaves `[[`: the record menu opens on it by itself.
      effects: command.id === 'link' ? [] : closeMenu.of(null),
      scrollIntoView: true,
      userEvent: 'input.complete'
    })
    if (maxLength && tr.newDoc.length > maxLength && tr.newDoc.length > view.state.doc.length) {
      toast.error(NO_ROOM)
      return
    }
    view.dispatch(tr)
    view.focus()
  }

  const preventDefault = (e: Event | SyntheticEvent): void => e.preventDefault()

  return (
    <Popover open={shown} onOpenChange={(next) => !next && close()}>
      <PopoverAnchor virtualRef={anchor} />
      <div
        ref={host}
        data-slot="markdown-editor"
        style={{ '--md-editor-min': minHeight } as CSSProperties}
        className={cn(
          // A Textarea's frame (docs/design-system.md → Формы): border-input + foreground/4, brighter on hover,
          // the ring while the text has focus.
          'w-full min-w-0 overflow-hidden rounded-xl border border-input bg-foreground/4 text-lead leading-relaxed transition-[border-color,box-shadow,background-color] wrap-anywhere hover:border-foreground/40',
          'focus-within:border-ring focus-within:bg-card focus-within:ring-[3px] focus-within:ring-ring/25',
          'has-aria-invalid:border-destructive has-aria-invalid:ring-destructive/20'
        )}
      />
      {/* The type icons the chips copy (lucide, rendered once per field). */}
      <div ref={icons} hidden>
        {ENTITY_TYPES.map((type) => {
          const Icon = ENTITY_ICON[type]
          return <Icon key={type} data-icon-for={type} aria-hidden className={CHIP_ICON} />
        })}
        <Link2Off data-icon-for="missing" aria-hidden className={CHIP_ICON} />
      </div>
      <PopoverContent
        align="start"
        className="w-80 p-0"
        // Focus never leaves the text: the list is driven from the editor, a click must not blur it.
        onOpenAutoFocus={preventDefault}
        onCloseAutoFocus={preventDefault}
        onMouseDown={preventDefault}
        // Radix closes on Esc before the editor sees the key; the menu stays closed for this `/` or `[[`, and
        // Esc doesn't also leave the record's edit mode (Radix marks it handled).
        onEscapeKeyDown={() => viewRef.current?.dispatch({ effects: dismissMenu.of(null) })}
      >
        {menu?.kind === 'slash' ? (
          <SlashMenuList
            query={menu.query}
            onRun={runCommand}
            keysRef={listKeys}
            onActive={onActive}
          />
        ) : menu?.kind === 'wiki' ? (
          <WikiMenuList
            query={menu.query}
            onPick={insertLink}
            onNothing={close}
            keysRef={listKeys}
            onActive={onActive}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
