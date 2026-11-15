import type { ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Tooltip shorthand. Never wrap the buttons the e2e drivers click right before
 * pressing Escape (`download-*`, `destination-*`, `omnibox-open`): an open
 * tooltip takes that Escape instead of the sheet.
 */
export function Tip({
  content,
  children,
  side = 'top'
}: {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} sideOffset={6} className="max-w-72">
        {content}
      </TooltipContent>
    </Tooltip>
  )
}
