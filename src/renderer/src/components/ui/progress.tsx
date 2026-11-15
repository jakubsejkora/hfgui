"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Progress as ProgressPrimitive } from "radix-ui"

/** `value` is 0–100 (clamped). */
function Progress({
  className,
  indicatorClassName,
  indeterminate = false,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
  indicatorClassName?: string
  /** For work with no measurable progress (verifying, waiting for data). */
  indeterminate?: boolean
}) {
  const pct = Math.min(100, Math.max(0, value ?? 0))
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "relative h-1.5 w-full overflow-hidden rounded-full bg-primary/12",
        className
      )}
      value={indeterminate ? null : pct}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          // No transition: progress arrives four times a second, so a glide never
          // settled and the window redrew at the display's full frame rate.
          "h-full w-full flex-1 rounded-full bg-primary",
          indeterminate && "progress-indeterminate w-2/5 transition-none",
          indicatorClassName
        )}
        style={indeterminate ? undefined : { transform: `translateX(-${100 - pct}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
