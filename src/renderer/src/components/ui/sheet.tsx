import { X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import type { ReactNode } from 'react'
import { Button } from './button'

export const SheetTitle = Dialog.Title

export interface SheetProps {
  open: boolean
  onOpenChange(open: boolean): void
  children: ReactNode
}

/** Right-hand slide-over panel. */
export function Sheet({ open, onOpenChange, children }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-fade-in fixed inset-0 z-40 bg-black/55" />
        <Dialog.Content
          aria-describedby={undefined}
          className="bg-surface border-border animate-slide-in fixed top-0 right-0 z-50 flex h-full w-[620px] max-w-[92vw] flex-col border-l shadow-2xl shadow-black/60 focus:outline-none"
        >
          <Dialog.Close asChild>
            <Button variant="ghost" size="icon" className="absolute top-4 right-4 z-10" aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
