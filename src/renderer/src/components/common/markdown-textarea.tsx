import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactElement
} from 'react'
import { toast } from 'sonner'
import type { EntitySummary } from '@shared/domain/common'
import { refKey, wikiLink } from '@shared/wikilinks'
import { useEntitySearch } from '@/hooks/use-entity-search'
import { useWikiTrigger } from '@/hooks/use-wiki-trigger'
import { useCurrentRecord } from '@/hooks/use-current-record'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandList } from '@/components/ui/command'
import { Separator } from '@/components/ui/separator'
import { Kbd } from '@/components/ui/kbd'
import { EntityOption } from './entity-options'

type Props = Omit<ComponentProps<typeof Textarea>, 'value' | 'onChange' | 'ref'> & {
  value: string
  onChange: (value: string) => void
}

/**
 * The Markdown textarea with the «[[» menu: typing `[[` opens a list of records under it (recent ones, then search
 * by what follows); ↑↓ choose, Enter or Tab insert a link to the record, Esc closes the menu for this `[[`. Focus
 * stays in the text the whole time (Notion / Obsidian), the list is a shadcn `Command` driven from the textarea.
 */
export function MarkdownTextarea({
  value,
  onChange,
  onKeyDown,
  onBlur,
  onSelect,
  onScroll,
  maxLength,
  ...props
}: Props): ReactElement {
  const ref = useRef<HTMLTextAreaElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const { trigger, anchor, update, close, dismiss } = useWikiTrigger()
  const open = !!trigger
  const found = useEntitySearch(trigger?.query ?? '', { enabled: open, recent: 9, hits: 9 })
  const { searching, loading } = found
  // Not the record being written: it was edited a moment ago and would always top «Нещодавні».
  const self = useCurrentRecord()
  const items = useMemo(
    () => found.items.filter((i) => !self || refKey(i) !== refKey(self)).slice(0, 8),
    [found.items, self]
  )
  const [picked, setPicked] = useState('')
  // The highlighted row follows the list: the first one when the list changed under it.
  const active = items.some((i) => refKey(i) === picked) ? picked : items[0] ? refKey(items[0]) : ''

  // The highlighted row stays in view, and a screen reader hears it while focus stays in the text: the textarea
  // points at cmdk's listbox and option (their ids are cmdk's own, so they are read from the DOM). By value, not
  // data-selected: cmdk marks the row a render later.
  useEffect(() => {
    const field = ref.current
    if (!field) return
    const box = list.current
    const option =
      open && active
        ? box?.querySelector<HTMLElement>(`[data-entity="${CSS.escape(active)}"]`)
        : null
    option?.scrollIntoView({ block: 'nearest' })
    const set = (name: string, id: string | undefined): void => {
      if (id) field.setAttribute(name, id)
      else field.removeAttribute(name)
    }
    set('aria-controls', open ? box?.id : undefined)
    set('aria-activedescendant', option?.id)
  }, [open, active, items])

  const insert = (item: EntitySummary): void => {
    const el = ref.current
    if (!el || !trigger) return
    const link = wikiLink(item, item.title)
    const caret = el.selectionStart
    if (maxLength && value.length - (caret - trigger.start) + link.length > maxLength) {
      toast.error('Посилання не вміщається: у полі закінчилося місце')
      return
    }
    el.focus()
    el.setSelectionRange(trigger.start, caret)
    // insertText keeps the browser's undo history (Ctrl+Z takes the link back out); setting a controlled
    // value would wipe it. The input event it fires reaches onChange like typing does.
    if (!document.execCommand('insertText', false, link)) {
      onChange(value.slice(0, trigger.start) + link + value.slice(caret))
      const at = trigger.start + link.length
      requestAnimationFrame(() => el.setSelectionRange(at, at))
    }
    close()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (open && !e.nativeEvent.isComposing && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const index = items.findIndex((i) => refKey(i) === active)
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && items.length) {
        e.preventDefault()
        const step = e.key === 'ArrowDown' ? 1 : -1
        setPicked(refKey(items[(index + step + items.length) % items.length]))
        return
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey) {
        if (index >= 0) {
          e.preventDefault()
          insert(items[index])
          return
        }
        // Nothing to choose: Enter is a new line again.
        close()
      }
      if (e.key === 'Escape') {
        // Radix has already closed the popover; this keeps Esc from also leaving the record's edit mode.
        e.preventDefault()
        e.stopPropagation()
        dismiss()
        return
      }
    }
    onKeyDown?.(e)
  }

  return (
    <Popover open={open} onOpenChange={(next) => !next && close()}>
      <div className="relative w-full min-w-0">
        <Textarea
          {...props}
          ref={ref}
          value={value}
          maxLength={maxLength}
          onChange={(e) => {
            onChange(e.target.value)
            update(e.target)
          }}
          onKeyDown={handleKeyDown}
          // Caret moved (arrows, click): the menu closes once the caret leaves the «[[запит».
          onSelect={(e) => {
            if (open) update(e.currentTarget)
            onSelect?.(e)
          }}
          // The field scrolls to the caret after the input event: the anchor is measured again then.
          onScroll={(e) => {
            if (open) update(e.currentTarget)
            onScroll?.(e)
          }}
          onBlur={(e) => {
            close()
            onBlur?.(e)
          }}
          aria-autocomplete="list"
        />
        <PopoverAnchor asChild>
          <span
            aria-hidden
            className="pointer-events-none absolute w-px"
            style={{ top: anchor.top, left: anchor.left, height: anchor.height }}
          />
        </PopoverAnchor>
      </div>
      <PopoverContent
        align="start"
        className="w-80 rounded-2xl p-0"
        // Focus never leaves the text: the list is driven from the textarea, a click must not blur it.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
        onEscapeKeyDown={dismiss}
      >
        <Command shouldFilter={false} value={active} onValueChange={setPicked} loop>
          <CommandList ref={list} label="Записи для посилання">
            <CommandEmpty>
              {loading
                ? 'Шукаю…'
                : searching
                  ? 'Нічого не знайдено'
                  : 'Почніть вводити назву запису'}
            </CommandEmpty>
            {items.length > 0 && (
              <CommandGroup heading={searching ? 'Результати' : 'Нещодавні'}>
                {items.map((item) => (
                  <EntityOption key={refKey(item)} item={item} onSelect={() => insert(item)} />
                ))}
              </CommandGroup>
            )}
          </CommandList>
          <Separator />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-meta text-muted-foreground">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> вибрати
            </span>
            <span className="flex items-center gap-1">
              <Kbd>Enter</Kbd> вставити
            </span>
            <span className="flex items-center gap-1">
              <Kbd>Esc</Kbd> закрити
            </span>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
