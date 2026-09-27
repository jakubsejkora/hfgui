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
        <Dialog.Overlay className="animate-fade-in fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="bg-surface border-border animate-slide-in rounded-l-sleeve fixed top-0 right-0 z-50 flex h-full w-[660px] max-w-[94vw] flex-col border-l shadow-[var(--shadow-float)] focus:outline-none"
        >
          <Dialog.Close asChild>
            <Button variant="secondary" size="icon" className="absolute top-5 right-5 z-20" aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
