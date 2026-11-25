import type { ReactElement } from 'react'
import { Plus, Sparkles, X } from 'lucide-react'
import type { TagSuggestionsState } from '@/hooks/use-tag-suggestions'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Confirm } from './confirm'
import { IconAction } from './icon-action'

/** The action of the «Мітки» section label (outline xs, like «Зв’язати» and «Додати файл»). */
export function SuggestTagsButton({ state }: { state: TagSuggestionsState }): ReactElement | null {
  if (!state.available) return null
  return (
    <Button variant="outline" size="xs" disabled={state.pending} onClick={state.ask}>
      {state.pending ? <Spinner className="size-3.5" /> : <Sparkles />}
      Запропонувати мітки
    </Button>
  )
}

/** «+ мітка» chips under the picker, the error in place, and the one-time warning before a cloud request. */
export function TagSuggestionChips({ state }: { state: TagSuggestionsState }): ReactElement | null {
  const { consent } = state
  return (
    <>
      {state.suggestions.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-1.5"
          aria-label="Запропоновані мітки"
          role="group"
        >
          {state.suggestions.map((s) => (
            <Button
              key={s.name}
              variant="outline"
              size="sm"
              className="max-w-full rounded-full border-dashed text-muted-foreground hover:text-foreground"
              title={s.tagId ? s.name : `Нова мітка «${s.name}»`}
              aria-label={`Додати мітку «${s.name}»`}
              onClick={() => state.add(s)}
            >
              <Plus />
              {s.color && (
                <span
                  aria-hidden
                  className="size-1.5 shrink-0 rounded-full ring-1 ring-foreground/20"
                  style={{ background: s.color }}
                />
              )}
              <span className="min-w-0 truncate">{s.name}</span>
            </Button>
          ))}
          <IconAction label="Сховати підказки" onClick={state.dismiss}>
            <X />
          </IconAction>
        </div>
      )}
      {state.error && (
        <p role="alert" className="text-caption text-destructive">
          {state.error}
        </p>
      )}
      {state.available && (
        <Confirm
          open={consent.open}
          onOpenChange={consent.setOpen}
          tone="default"
          title={`Надіслати текст запису в ${consent.provider}?`}
          description={`Щоб запропонувати мітки, Vault надішле назву й текст цього запису провайдеру ${consent.provider}${consent.privacy ? `: ${consent.privacy}` : ''}. Спитаємо один раз для цього провайдера. Щоб нічого не йшло в інтернет, виберіть Ollama або LM Studio в Налаштування → Штучний інтелект.`}
          confirmLabel="Надіслати"
          onConfirm={consent.confirm}
        />
      )}
    </>
  )
}
