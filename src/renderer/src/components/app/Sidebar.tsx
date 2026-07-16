import { ArrowDownToLine, Compass, Settings, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { useDownloadsStore, selectActiveCount } from '@/lib/downloadsStore'
import { useUiStore, type View } from '@/lib/uiStore'
import { cn } from '@/lib/utils'

function NavItem({
  view,
  icon,
  label,
  badge
}: {
  view: View
  icon: ReactNode
  label: string
  badge?: number
}) {
  const current = useUiStore((s) => s.view)
  const setView = useUiStore((s) => s.setView)
  const active = current === view
  return (
    <button
      onClick={() => setView(view)}
      className={cn(
        'no-drag flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 text-[13px] font-medium transition-colors',
        active ? 'bg-surface-3 text-text' : 'text-muted hover:bg-surface-2 hover:text-text'
      )}
    >
      {icon}
      {label}
      {badge != null && badge > 0 && (
        <span className="bg-accent text-accent-fg ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold">
          {badge}
        </span>
      )}
    </button>
  )
}

export function Sidebar() {
  const activeCount = useDownloadsStore((s) => selectActiveCount(s.jobs))
  return (
    <aside className="drag-region bg-surface border-border flex w-[216px] shrink-0 flex-col border-r">
      {/* space for macOS traffic lights */}
      <div className="flex items-center gap-2.5 px-4 pt-12 pb-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#ffb340] to-[#ff7a45] text-base shadow-lg shadow-black/30">
          🤗
        </div>
        <div>
          <div className="text-[13px] leading-tight font-semibold">hfgui</div>
          <div className="text-faint text-[11px] leading-tight">Model downloader</div>
        </div>
      </div>
      <nav className="no-drag flex flex-col gap-1 px-2.5">
        <NavItem view="browse" icon={<Compass className="h-4 w-4" />} label="Browse" />
        <NavItem
          view="downloads"
          icon={<ArrowDownToLine className="h-4 w-4" />}
          label="Downloads"
          badge={activeCount}
        />
        <NavItem
          view="private-inference"
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Private inference"
        />
        <NavItem view="settings" icon={<Settings className="h-4 w-4" />} label="Settings" />
      </nav>
      <div className="flex-1" />
      <div className="text-faint px-4 pb-4 text-[11px] leading-relaxed">
        Models land where LM Studio &amp; exo can load them.
      </div>
    </aside>
  )
}
