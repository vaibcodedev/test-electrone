import * as React from "react"
import { EditableScope } from "@/components/common/detail-mode-context"
import { cn } from "@/lib/utils"
import { XIcon } from "lucide-react"
import { Dialog as SheetPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    // z-40, one below the content: Radix gives the overlay and the content separate portals, so a sheet reopened
    // during its close animation re-mounts the overlay AFTER the content and, at an equal z-index, it covered
    // the sheet and swallowed the next click. Page layers stop at z-30; dialogs over a sheet are z-50.
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-40 bg-black/50 ease-soft data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-300",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  onOpenAutoFocus,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        // Focus the sheet itself, not its first header button: that popped the button's tooltip on open.
        // A field with autoFocus (new record) already holds focus, so Radix doesn't call this.
        onOpenAutoFocus={
          onOpenAutoFocus ??
          ((e) => {
            e.preventDefault()
            ;(e.currentTarget as HTMLElement).focus({ preventScroll: true })
          })
        }
        className={cn(
          "fixed z-50 flex flex-col gap-4 bg-card shadow-lg outline-none ease-soft data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=open]:animate-in data-[state=open]:duration-300",
          side === "right" &&
            // Below the window buttons (titleBarOverlay, 44px): the sheet header must never sit under them.
            "top-12 bottom-2.5 right-2.5 h-auto w-3/4 overflow-hidden rounded-3xl border data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
          side === "left" &&
            "top-12 bottom-2.5 left-2.5 h-auto w-3/4 overflow-hidden rounded-3xl border data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
          side === "top" &&
            "inset-x-0 top-0 h-auto border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
          side === "bottom" &&
            "inset-x-0 bottom-0 h-auto border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
          className
        )}
        {...props}
      >
        <EditableScope>{children}</EditableScope>
        {showCloseButton && (
          // A real 24×24 button with focus-visible (a bare 16px icon lit its ring on a mouse open, since Radix
          // focuses ✕ in a dialog without fields). No Tooltip on purpose: it would pop up on open for the same reason.
          <SheetPrimitive.Close asChild>
            <Button variant="ghost" size="icon-xs" aria-label="Закрити" className="absolute top-4 right-4">
              <XIcon className="size-4" />
            </Button>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-semibold text-foreground", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-body text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
