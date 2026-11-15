import { ClipboardCheck, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ModelRef } from '@shared/modelRef'
import { ignoreClipboardRepo, isClipboardRepoIgnored } from '@/lib/clipboardMemory'
import { useUiStore } from '@/lib/uiStore'

/**
 * When the app regains focus holding a Hugging Face link on the clipboard,
 * offer it. The clipboard is read and parsed in the main process, so nothing
 * but a model reference (or null) ever reaches this component.
 */
export function ClipboardChip() {
  const openModel = useUiStore((s) => s.openModel)
  const selectedModelId = useUiStore((s) => s.selectedModelId)
  const [ref, setRef] = useState<ModelRef | null>(null)
  const lastRead = useRef(0)

  useEffect(() => {
    const check = async (): Promise<void> => {
      const now = Date.now()
      if (now - lastRead.current < 1500) return
      lastRead.current = now
      const found = await window.hfgui.readClipboardModelRef()
      setRef(found && !isClipboardRepoIgnored(found.repoId) ? found : null)
    }
    void check()
    window.addEventListener('focus', check)
    return () => window.removeEventListener('focus', check)
  }, [])

  if (!ref || ref.repoId === selectedModelId) return null

  const dismiss = (): void => {
    ignoreClipboardRepo(ref.repoId)
    setRef(null)
  }

  return (
    <div
      data-testid="clipboard-chip"
      className="absolute top-full right-0 left-0 z-30 mt-2 flex animate-in items-center gap-2 rounded-lg border bg-popover py-1.5 pr-1.5 pl-3 text-popover-foreground shadow-lg fade-in-0 slide-in-from-top-1"
    >
      <ClipboardCheck className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        You copied <span className="font-medium text-foreground">{ref.repoId}</span>
      </span>
      <button
        type="button"
        onClick={() => {
          openModel(ref.repoId)
          dismiss()
        }}
        data-testid="clipboard-chip-open"
        className="h-6 shrink-0 cursor-pointer rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        Open
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss copied link"
        data-testid="clipboard-chip-dismiss"
        className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
