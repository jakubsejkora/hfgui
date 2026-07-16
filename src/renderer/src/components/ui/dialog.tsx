import { Dialog as DialogPrimitive } from 'radix-ui'
import type { ReactNode } from 'react'

export const DialogTitle = DialogPrimitive.Title

export interface DialogProps {
  open: boolean
  onOpenChange(open: boolean): void
  children: ReactNode
}

/** Centered modal. */
export function Dialog({ open, onOpenChange, children }: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="animate-fade-in fixed inset-0 z-40 bg-black/55" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="bg-surface-2 border-border animate-pop-in fixed top-1/2 left-1/2 z-50 w-[440px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-5 shadow-2xl shadow-black/60 focus:outline-none"
        >
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
