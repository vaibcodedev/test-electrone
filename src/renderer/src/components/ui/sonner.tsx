import { CircleCheck, Info, LoaderCircle, OctagonX, TriangleAlert } from 'lucide-react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { useResolvedTheme } from '@/hooks/use-theme'

const Toaster = (props: ToasterProps) => {
  const theme = useResolvedTheme()
  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      containerAriaLabel="Сповіщення"
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
            '!rounded-2xl !border-border !bg-popover !text-popover-foreground !font-sans !shadow-lg',
          // A long record title used to stretch the toast to half the screen, «Відкрити» ended up mid-height.
          title: 'line-clamp-2',
          description: 'line-clamp-3',
          actionButton: '!rounded-full !bg-lime !text-lime-foreground'
        }
      }}
      {...props}
    />
  )
}

export { Toaster }
