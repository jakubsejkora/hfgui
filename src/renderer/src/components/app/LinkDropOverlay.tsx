import { Link2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { parseModelRef, parseUriList } from '@shared/modelRef'
import { MODEL_DRAG_MIME } from '@/lib/dragStore'
import { toast } from '@/lib/toastStore'
import { useUiStore } from '@/lib/uiStore'

/**
 * Accepts a Hugging Face link dragged in from a browser.
 *
 * The listeners are unconditional and preventDefault() everything: without
 * them Chromium navigates the window to the dropped URL, which would replace
 * the app with a web page and no way back. (src/main/index.ts has a
 * will-navigate backstop for anything that slips through.)
 */
export function LinkDropOverlay() {
  const openModel = useUiStore((s) => s.openModel)
  const [active, setActive] = useState(false)

  useEffect(() => {
    // dragenter/dragleave fire for every child element, so count depth rather
    // than toggling — otherwise the overlay flickers as the pointer moves.
    let depth = 0

    const isLink = (e: DragEvent): boolean => {
      const types = e.dataTransfer?.types
      if (!types || types.includes(MODEL_DRAG_MIME)) return false
      return types.includes('text/uri-list') || types.includes('text/plain')
    }

    const onEnter = (e: DragEvent): void => {
      e.preventDefault()
      depth++
      if (isLink(e)) setActive(true)
    }
    const onOver = (e: DragEvent): void => {
      e.preventDefault()
      if (e.dataTransfer && isLink(e)) e.dataTransfer.dropEffect = 'copy'
    }
    const onLeave = (e: DragEvent): void => {
      e.preventDefault()
      depth = Math.max(0, depth - 1)
      if (depth === 0) setActive(false)
    }
    const onDrop = (e: DragEvent): void => {
      e.preventDefault()
      depth = 0
      setActive(false)
      const dt = e.dataTransfer
      if (!dt || dt.types.includes(MODEL_DRAG_MIME)) return
      if (dt.files.length > 0) {
        toast('info', 'hfgui downloads from the Hub — drop a huggingface.co link instead.')
        return
      }
      const ref =
        parseUriList(dt.getData('text/uri-list')) ?? parseModelRef(dt.getData('text/plain'))
      if (ref) openModel(ref.repoId)
      else toast('error', "That isn't a link to a Hugging Face model.")
    }

    document.addEventListener('dragenter', onEnter)
    document.addEventListener('dragover', onOver)
    document.addEventListener('dragleave', onLeave)
    document.addEventListener('drop', onDrop)
    return () => {
      document.removeEventListener('dragenter', onEnter)
      document.removeEventListener('dragover', onOver)
      document.removeEventListener('dragleave', onLeave)
      document.removeEventListener('drop', onDrop)
    }
  }, [openModel])

  if (!active) return null

  return (
    <div
      data-testid="link-drop-overlay"
      className="pointer-events-none fixed inset-0 z-[65] flex animate-in items-center justify-center bg-background/70 p-8 backdrop-blur-sm fade-in-0"
    >
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-foreground/40">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
          <Link2 className="size-5" />
        </div>
        <p className="text-base font-semibold">Drop a Hugging Face model link</p>
        <p className="text-sm text-muted-foreground">It opens right here, ready to download.</p>
      </div>
    </div>
  )
}
