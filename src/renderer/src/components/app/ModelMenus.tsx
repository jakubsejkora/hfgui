import { ArrowDownToLine, Copy, ExternalLink, MoreHorizontal, PanelRightOpen } from 'lucide-react'
import type { ReactNode } from 'react'
import { destinationRejection } from '@shared/destinationRules'
import type { DestinationInfo } from '@shared/types'
import { copyModelLink, openOnHub } from '@/lib/actions'
import type { ModelSummary } from '@/lib/hfApi'
import { useDestinations } from '@/lib/queries'
import { useDropDownload } from '@/lib/useDropDownload'
import { useUiStore } from '@/lib/uiStore'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

type MenuModel = Pick<ModelSummary, 'id' | 'name' | 'format'>

interface Target {
  info: DestinationInfo
  disabledReason: string | null
}

/**
 * The same actions for a card's right-click menu and a table row's ⋯ menu.
 * "Download best fit to…" is the keyboard-reachable twin of dragging a card
 * onto a destination: same plan (the quant hfgui would recommend for this
 * Mac's memory), same toast with Change / Undo.
 */
function useModelMenu(model: MenuModel) {
  const openModel = useUiStore((s) => s.openModel)
  const { data: destinations } = useDestinations()
  const dropDownload = useDropDownload()
  // Generic repos hold several formats; the drop plan would only open the sheet.
  const targets: Target[] =
    model.format === 'other' || !destinations
      ? []
      : destinations.map((info) => ({
          info,
          disabledReason: destinationRejection(info.kind, model.format, info)
        }))
  return {
    open: () => openModel(model.id),
    download: (info: DestinationInfo) =>
      void dropDownload({ repoId: model.id, name: model.name, format: model.format }, info),
    copyLink: () => void copyModelLink(model.id),
    openOnHub: () => openOnHub(model.id),
    targets
  }
}

const targetLabel = (t: Target): string =>
  t.info.kind === 'custom' && !t.info.path ? 'Custom folder…' : t.info.label

export function ModelContextMenu({ model, children }: { model: MenuModel; children: ReactNode }) {
  const menu = useModelMenu(model)
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem onSelect={menu.open}>
          <PanelRightOpen /> Open details
        </ContextMenuItem>
        {menu.targets.length > 0 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <ArrowDownToLine /> Download best fit to
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-56">
              {menu.targets.map((t) => (
                <ContextMenuItem
                  key={t.info.kind}
                  disabled={!!t.disabledReason}
                  onSelect={() => menu.download(t.info)}
                >
                  <span className="flex-1">{targetLabel(t)}</span>
                  {t.disabledReason && (
                    <span className="text-xs text-muted-foreground">{t.disabledReason}</span>
                  )}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={menu.copyLink}>
          <Copy /> Copy link
        </ContextMenuItem>
        <ContextMenuItem onSelect={menu.openOnHub}>
          <ExternalLink /> Open on Hugging Face
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function ModelRowMenu({ model }: { model: MenuModel }) {
  const menu = useModelMenu(model)
  return (
    // modal={false}: an item that opens the sheet must not leave a modal menu's
    // pointer lock behind.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${model.name}`}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      {/* React events bubble through portals to the row; keep menu clicks and
          keys from also opening the row. */}
      <DropdownMenuContent
        align="end"
        className="w-60"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <DropdownMenuItem onSelect={menu.open}>
          <PanelRightOpen /> Open details
        </DropdownMenuItem>
        {menu.targets.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ArrowDownToLine /> Download best fit to
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              {menu.targets.map((t) => (
                <DropdownMenuItem
                  key={t.info.kind}
                  disabled={!!t.disabledReason}
                  onSelect={() => menu.download(t.info)}
                >
                  <span className="flex-1">{targetLabel(t)}</span>
                  {t.disabledReason && (
                    <span className="text-xs text-muted-foreground">{t.disabledReason}</span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={menu.copyLink}>
          <Copy /> Copy link
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={menu.openOnHub}>
          <ExternalLink /> Open on Hugging Face
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
