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
      aria-current={active ? 'page' : undefined}
      className={cn(
        'no-drag relative flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-full px-3.5 text-[13px] font-medium transition-colors',
        active ? 'glass text-text' : 'text-muted hover:text-text hover:bg-surface-2'
      )}
    >
      {active && (
        <span className="bg-accent absolute top-1/2 left-0 h-4 w-0.5 -translate-y-1/2 rounded-full" />
      )}
      {icon}
      {label}
      {badge != null && badge > 0 && (
        <span className="bg-accent text-accent-fg tnum ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold">
          {badge}
        </span>
      )}
    </button>
  )
}

export function Sidebar() {
  const activeCount = useDownloadsStore((s) => selectActiveCount(s.jobs))
  return (
    <aside className="drag-region flex w-[212px] shrink-0 flex-col pt-2">
      <nav className="no-drag flex flex-col gap-1 px-3">
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
