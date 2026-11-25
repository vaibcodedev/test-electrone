import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { reportError } from '@/lib/error-reporting'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** Copies via the main process clipboard and says how it went; never throws. false — nothing was copied. */
export async function copyText(text: string, message = 'Скопійовано'): Promise<boolean> {
  try {
    await api.app.copyText(text)
    toast.success(message)
    return true
  } catch (e) {
    toast.error('Не вдалося скопіювати. Спробуйте ще раз.')
    reportError(e, 'copy')
    return false
  }
}

const ICON_SIZE = { xs: 'icon-xs', sm: 'icon-sm', default: 'icon' } as const

/** Copies text via the main process clipboard. `onCopied` (only after a successful copy) lets modules count usage. */
export function CopyButton({
  text,
  label,
  message,
  onCopied,
  className,
  variant = 'soft',
  size = 'sm'
}: {
  text: string
  label?: string
  /** Toast after copying («Промт скопійовано»); «Скопійовано» by default. */
  message?: string
  onCopied?: () => void
  className?: string
  variant?: 'soft' | 'subtle' | 'lime' | 'default' | 'ghost' | 'code'
  size?: 'sm' | 'icon-sm' | 'xs' | 'default'
}) {
  const [done, setDone] = useState(false)
  const button = (
    <Button
      type="button"
      variant={variant}
      // Without a label the button is a square icon button of the same height.
      size={label || size === 'icon-sm' ? size : ICON_SIZE[size]}
      className={className}
      aria-label={label ? undefined : 'Скопіювати'}
      onClick={async (e) => {
        e.stopPropagation()
        if (!(await copyText(text, message))) return
        onCopied?.()
        setDone(true)
        setTimeout(() => setDone(false), 1400)
      }}
    >
      {done ? <Check /> : <Copy />}
      {label}
    </Button>
  )
  if (label) return button
  // Icon only: the name is spoken (aria-label) and shown (Tooltip), like every icon button.
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>Скопіювати</TooltipContent>
    </Tooltip>
  )
}
