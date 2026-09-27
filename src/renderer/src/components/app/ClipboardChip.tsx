import { ClipboardCheck, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ModelRef } from '@shared/modelRef'
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
  const dismissed = useRef(new Set<string>())
  const lastRead = useRef(0)

  useEffect(() => {
    const check = async (): Promise<void> => {
      const now = Date.now()
      if (now - lastRead.current < 1500) return
      lastRead.current = now
      const found = await window.hfgui.readClipboardModelRef()
      setRef(found && !dismissed.current.has(found.repoId) ? found : null)
    }
    void check()
    window.addEventListener('focus', check)
    return () => window.removeEventListener('focus', check)
  }, [])

  if (!ref || ref.repoId === selectedModelId) return null

  const dismiss = (): void => {
    dismissed.current.add(ref.repoId)
    setRef(null)
  }

  return (
    <div
      data-testid="clipboard-chip"
      className="bg-surface-2 border-border animate-pop-in absolute top-full right-0 left-0 z-20 mt-2 flex items-center gap-2 rounded-full border py-1.5 pr-1.5 pl-3.5 shadow-[var(--shadow-float)]"
    >
      <ClipboardCheck className="text-accent h-3.5 w-3.5 shrink-0" />
      <span className="text-muted min-w-0 flex-1 truncate text-xs">
        You copied <span className="text-text font-medium">{ref.repoId}</span>
      </span>
      <button
        onClick={() => {
          openModel(ref.repoId)
          dismiss()
        }}
        data-testid="clipboard-chip-open"
        className="bg-accent text-accent-fg hover:bg-accent-hover h-6 shrink-0 cursor-pointer rounded-full px-3 text-[11px] font-semibold transition-colors"
      >
        Open
      </button>
      <button
        onClick={dismiss}
        aria-label="Dismiss copied link"
        data-testid="clipboard-chip-dismiss"
        className="text-faint hover:text-text flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
