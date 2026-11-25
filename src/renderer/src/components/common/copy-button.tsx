import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { reportError } from '@/lib/error-reporting'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export async function copyText(text: string, message = 'Скопійовано'): Promise<void> {
  await api.app.copyText(text)
  toast.success(message)
}

/** Copies text via the main process clipboard. `onCopied` lets modules count usage. */
export function CopyButton({
  text,
  label,
  onCopied,
  className,
  variant = 'soft',
  size = 'sm'
}: {
  text: string
  label?: string
  onCopied?: () => void
  className?: string
  variant?: 'soft' | 'lime' | 'default' | 'ghost' | 'code'
  size?: 'sm' | 'icon-sm' | 'xs' | 'default'
}) {
  const [done, setDone] = useState(false)
  const button = (
    <Button
      type="button"
      variant={variant}
      size={label ? size : size === 'sm' ? 'icon-sm' : size}
      className={cn(className)}
      aria-label={label ? undefined : 'Скопіювати'}
      onClick={async (e) => {
        e.stopPropagation()
        try {
          await copyText(text)
        } catch (err) {
          toast.error('Не вдалося скопіювати')
          reportError(err, 'copy-button')
          return
        }
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
