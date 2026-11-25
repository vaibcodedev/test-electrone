import { CircleCheck, Info, LoaderCircle, OctagonX, TriangleAlert } from 'lucide-react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { useResolvedTheme } from '@/hooks/use-theme'
import { useUi } from '@/stores/ui-store'

const Toaster = (props: ToasterProps) => {
  const theme = useResolvedTheme()
  // With the chat ШІ open on the right, toasts stay in the page's corner: over the chat they hid its composer.
  const chat = useUi((s) => (s.aiChatOpen ? s.aiChatWidth : 0))
  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      containerAriaLabel="Сповіщення"
      offset={chat ? { right: chat + 44, bottom: 24 } : undefined}
      className="toaster group"
      icons={{
        success: <CircleCheck className="size-4 text-success" />,
        info: <Info className="size-4" />,
        warning: <TriangleAlert className="size-4 text-warn" />,
        error: <OctagonX className="size-4 text-destructive" />,
        loading: <LoaderCircle className="size-4 animate-spin" />
      }}
      toastOptions={{
        closeButtonAriaLabel: 'Закрити сповіщення',
        classNames: {
          toast:
            'rounded-2xl! border-border! bg-popover! text-popover-foreground! font-sans! shadow-lg!',
          // A long record title used to stretch the toast to half the screen, «Відкрити» ended up mid-height.
          title: 'line-clamp-2',
          description: 'line-clamp-3',
          actionButton: 'rounded-full! bg-lime! text-lime-foreground!',
          // «Скасувати» next to «Відкрити» (chat ШІ actions): a neutral state layer, the lime stays with the action.
          cancelButton: 'rounded-full! bg-foreground/8! text-foreground!'
        }
      }}
      {...props}
    />
  )
}

export { Toaster }
