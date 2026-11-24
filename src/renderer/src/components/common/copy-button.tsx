import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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
  variant?: 'soft' | 'lime' | 'default' | 'ghost'
  size?: 'sm' | 'icon-sm' | 'xs' | 'default'
}) {
  const [done, setDone] = useState(false)
  return (
    <Button
      type="button"
      variant={variant}
      size={label ? size : size === 'sm' ? 'icon-sm' : size}
      className={cn(className)}
      title="Скопіювати"
      onClick={async (e) => {
        e.stopPropagation()
        await copyText(text)
        onCopied?.()
        setDone(true)
        setTimeout(() => setDone(false), 1400)
      }}
    >
      {done ? <Check /> : <Copy />}
      {label}
    </Button>
  )
}
