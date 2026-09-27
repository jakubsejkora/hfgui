import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { planDrop } from '@shared/dropChoice'
import { formatBytes } from '@shared/format'
import type { DestinationInfo } from '@shared/types'
import { getModel, getModelTree } from './hfApi'
import type { DragModel } from './dragStore'
import { toast } from './toastStore'
import { useUiStore } from './uiStore'

const OPEN_DETAILS_MESSAGE: Record<string, string> = {
  'tree-not-loaded': 'Still reading the file list — pick a download below.',
  'unknown-format': 'This repo has several formats — pick the files you want.',
  'nothing-fits': "None of these fit this Mac's memory — here are the sizes.",
  'no-complete-group': 'No complete download in this repo — here is what it contains.'
}

/**
 * Turn "card dropped on a destination" into a running download.
 *
 * The chosen quantization is always announced, with a way to change it and a
 * way to undo, because the gesture itself says nothing about which variant the
 * user wanted.
 */
export function useDropDownload(): (model: DragModel, destination: DestinationInfo) => Promise<void> {
  const queryClient = useQueryClient()
  const openModel = useUiStore((s) => s.openModel)

  return useCallback(
    async (model, destination) => {
      if (!destination.path) return
      try {
        const detail = await queryClient.fetchQuery({
          queryKey: ['model', model.repoId],
          queryFn: () => getModel(model.repoId),
          staleTime: 5 * 60_000
        })
        const revision = detail.sha ?? 'main'
        const [tree, system] = await Promise.all([
          queryClient.fetchQuery({
            queryKey: ['tree', detail.id, revision],
            queryFn: () => getModelTree(detail.id, revision),
            staleTime: 5 * 60_000
          }),
          queryClient.fetchQuery({
            queryKey: ['system-info'],
            queryFn: () => window.hfgui.getSystemInfo(),
            staleTime: Infinity
          })
        ])

        const plan = planDrop({
          format: detail.format,
          tree,
          modelName: detail.name,
          ramBytes: system.totalMemoryBytes
        })

        if (plan.kind === 'open-details') {
          openModel(detail.id)
          toast('info', OPEN_DETAILS_MESSAGE[plan.reason])
          return
        }

        const result = await window.hfgui.startDownload({
          repoId: detail.id,
          revision,
          displayName: plan.displayName,
          format: detail.format,
          files: plan.files,
          destination: { kind: destination.kind, baseDir: destination.path }
        })

        if (!result.ok) {
          toast('error', result.message)
          return
        }

        const size = formatBytes(plan.files.reduce((sum, f) => sum + f.size, 0))
        const jobId = result.jobId
        toast(
          'success',
          plan.quantLabel
            ? `Downloading ${plan.quantLabel} (${size}) to ${destination.label} — the best fit for this Mac.`
            : `Downloading ${detail.name} (${size}) to ${destination.label}.`,
          {
            actions: [
              {
                label: 'Change',
                testid: 'toast-action-change',
                onClick: () => openModel(detail.id)
              },
              {
                label: 'Undo',
                testid: 'toast-action-undo',
                onClick: () => {
                  void window.hfgui
                    .cancelDownload(jobId, { deletePartial: true })
                    .then(() => window.hfgui.removeDownload(jobId))
                }
              }
            ]
          }
        )
      } catch (error) {
        toast('error', (error as Error).message)
      }
    },
    [openModel, queryClient]
  )
}
