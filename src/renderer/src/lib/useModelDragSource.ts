import { useRef, type DragEvent } from 'react'
import type { ModelFormat } from '@shared/types'
import { MODEL_DRAG_MIME, useDragStore, type DragModel } from './dragStore'

interface DraggableModel {
  id: string
  name: string
  format: ModelFormat
}

/**
 * Makes a card or table row draggable onto the dock's destination bays.
 *
 * The payload travels under our own MIME type (LinkDropOverlay ignores it, so
 * the link-drop overlay never appears for an internal drag) and also as the Hub
 * link in text/plain, so dropping a card into another app yields its URL.
 */
export function useModelDragSource(model: DraggableModel) {
  const beginDrag = useDragStore((s) => s.begin)
  const endDrag = useDragStore((s) => s.end)
  // Chromium can still fire a click after a drag; without this, dropping a card
  // on a destination would also open the detail sheet on top of it.
  const dragged = useRef(false)

  return {
    dragProps: {
      draggable: true,
      onDragStart: (e: DragEvent<HTMLElement>) => {
        dragged.current = true
        const payload: DragModel = { repoId: model.id, name: model.name, format: model.format }
        e.dataTransfer.effectAllowed = 'copy'
        e.dataTransfer.setData(MODEL_DRAG_MIME, JSON.stringify(payload))
        e.dataTransfer.setData('text/plain', `https://huggingface.co/${model.id}`)
        beginDrag(payload)
      },
      onDragEnd: () => {
        endDrag()
        setTimeout(() => {
          dragged.current = false
        }, 0)
      }
    },
    /** True while a drag that started on this element is still settling. */
    wasDragged: () => dragged.current
  }
}
