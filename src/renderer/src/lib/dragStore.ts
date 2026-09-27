import { create } from 'zustand'
import type { ModelFormat } from '@shared/types'

/** Our own MIME type, so a model drag can be told apart from a link drag. */
export const MODEL_DRAG_MIME = 'application/x-hfgui-model'

export interface DragModel {
  repoId: string
  name: string
  format: ModelFormat
}

interface DragState {
  /** The model currently being dragged, or null. */
  model: DragModel | null
  /** A link is being dragged in from outside the app. */
  linkDrag: boolean
  begin(model: DragModel): void
  end(): void
  setLinkDrag(active: boolean): void
}

export const useDragStore = create<DragState>((set) => ({
  model: null,
  linkDrag: false,
  begin: (model) => set({ model }),
  end: () => set({ model: null }),
  setLinkDrag: (linkDrag) => set({ linkDrag })
}))

/**
 * `dataTransfer.getData()` is blocked during dragover — only `types` is
 * readable — so the payload also lives in the store, where hover states can
 * check whether this model is allowed in a given destination.
 */
export function readDragModel(dt: DataTransfer): DragModel | null {
  const raw = dt.getData(MODEL_DRAG_MIME)
  if (!raw) return null
  try {
    return JSON.parse(raw) as DragModel
  } catch {
    return null
  }
}
