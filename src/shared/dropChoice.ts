import { groupGgufFiles, recommendQuant } from './quant'
import type { ModelFormat, TreeFile } from './types'

/**
 * What a drag-and-drop onto a destination should actually download.
 *
 * Dropping a card is a one-gesture shortcut, so it must never guess wildly: it
 * either starts the quantization the app would have recommended anyway, or it
 * bows out and opens the detail sheet so the user chooses. Pure and tested
 * because it is the one place drag-to-download can go wrong quietly.
 */
export type DropPlan =
  | { kind: 'download'; files: TreeFile[]; displayName: string; quantLabel: string | null }
  | {
      kind: 'open-details'
      reason: 'tree-not-loaded' | 'unknown-format' | 'nothing-fits' | 'no-complete-group'
    }

export interface DropInput {
  format: ModelFormat
  /** null while the repo's file tree is still loading. */
  tree: TreeFile[] | null
  modelName: string
  ramBytes: number
}

export function planDrop({ format, tree, modelName, ramBytes }: DropInput): DropPlan {
  if (tree === null) return { kind: 'open-details', reason: 'tree-not-loaded' }

  // A generic repo can hold pt + safetensors + onnx copies of the same weights;
  // "everything" is the wrong default, so let the user look first.
  if (format === 'other') return { kind: 'open-details', reason: 'unknown-format' }

  if (format === 'mlx') {
    const files = tree.filter((f) => f.path !== '.gitattributes')
    if (files.length === 0) return { kind: 'open-details', reason: 'no-complete-group' }
    return { kind: 'download', files, displayName: modelName, quantLabel: null }
  }

  const { groups } = groupGgufFiles(tree)
  const usable = groups.filter((g) => !g.isExtra && g.isComplete)
  if (usable.length === 0) return { kind: 'open-details', reason: 'no-complete-group' }

  const key = recommendQuant(groups, ramBytes)
  // Nothing fits this machine's RAM: starting a model that cannot load would be
  // a waste of bandwidth, so hand over to the sheet with its size guidance.
  if (!key) return { kind: 'open-details', reason: 'nothing-fits' }

  const group = usable.find((g) => g.key === key)!
  return {
    kind: 'download',
    files: group.files,
    // Matches downloadGroup() in ModelDetailView so the manager's duplicate
    // detection treats a dropped and a clicked download as the same job.
    displayName: `${modelName} · ${group.label}`,
    quantLabel: group.label
  }
}
