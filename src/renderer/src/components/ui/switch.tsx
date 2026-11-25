import * as React from "react"
import { cn } from "@/lib/utils"
import { useReadOnly } from "@/components/common/detail-mode-context"
import { Switch as SwitchPrimitive } from "radix-ui"

function Switch({
  className,
  size = "default",
  disabled,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default"
}) {
  // Read-only in a record's view mode, for the keyboard too (see SelectTrigger).
  const viewMode = useReadOnly()
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      disabled={disabled || viewMode}
      data-size={size}
      className={cn(
        "peer group/switch inline-flex shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-5 data-[size=default]:w-9 data-[size=sm]:h-3.5 data-[size=sm]:w-6 data-[state=checked]:bg-lime data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-foreground/15",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          // A 2px gap on both sides: track width − 2px border − thumb − 2px (default 36−2−16−2, sm 24−2−12−2).
          // translate-x-full overshot the small track by 2px.
          // On: dark thumb on the lime track in both themes (a white thumb on lime had no contrast in dark).
          // Off: a dark thumb on the light track (a card-coloured thumb blended into the panel in light).
          "pointer-events-none block rounded-full bg-card shadow-sm ring-0 transition-transform group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 data-[state=unchecked]:translate-x-0.5 group-data-[size=default]/switch:data-[state=checked]:translate-x-4 group-data-[size=sm]/switch:data-[state=checked]:translate-x-2 data-[state=checked]:bg-lime-foreground data-[state=unchecked]:bg-foreground/70 dark:data-[state=unchecked]:bg-foreground/85"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
