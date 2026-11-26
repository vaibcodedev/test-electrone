import type { ReactElement } from 'react'
import { Volume2 } from 'lucide-react'
import { IconAction } from '@/components/common/icon-action'
import { DisabledHint } from '@/components/common/disabled-hint'
import { NO_VOICE_REASON, usePronounce, type Pronounce } from './use-pronounce'

/** 🔊 next to a word: ghost icon with a tooltip; without an English voice — disabled with the reason. */
export function SpeakButton({
  text,
  size = 'icon-sm',
  shortcut,
  pronounce
}: {
  text: string
  size?: 'icon-xs' | 'icon-sm'
  shortcut?: string
  /** The page's own hook result (the trainer shares one with its hotkey); otherwise the button reads it. */
  pronounce?: Pronounce
}): ReactElement {
  const own = usePronounce()
  const p = pronounce ?? own
  return (
    <DisabledHint reason={p.canSpeak ? undefined : NO_VOICE_REASON}>
      <IconAction
        label="Вимовити"
        size={size}
        shortcut={shortcut}
        disabled={!p.canSpeak || !text.trim()}
        onClick={(e) => {
          e.stopPropagation()
          p.say(text)
        }}
      >
        <Volume2 />
      </IconAction>
    </DisabledHint>
  )
}
