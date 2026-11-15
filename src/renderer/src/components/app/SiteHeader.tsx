import { useUiStore, type View } from '@/lib/uiStore'
import { cn } from '@/lib/utils'
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar'
import { Omnibox } from './Omnibox'
import { SpeedChip } from './SpeedChip'

const TITLE: Record<View, string> = {
  overview: 'Overview',
  browse: 'Browse',
  downloads: 'Downloads',
  'private-inference': 'Private inference',
  guide: 'Guide',
  settings: 'Settings'
}

/**
 * The inset panel's header and the window's drag handle. With the sidebar
 * hidden, the traffic lights float over this bar's left end, so it pads past them.
 */
export function SiteHeader() {
  const { state } = useSidebar()
  const view = useUiStore((s) => s.view)
  const collapsed = state === 'collapsed'

  return (
    <header
      className={cn(
        'drag-region relative z-20 grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,34rem)_minmax(0,1fr)] items-center gap-4 border-b px-4 transition-[padding] duration-200 ease-linear',
        collapsed && 'pl-[84px]'
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {collapsed && <SidebarTrigger aria-label="Show sidebar" className="-ml-1" />}
        <span className="truncate text-sm font-medium">{TITLE[view]}</span>
      </div>
      <Omnibox />
      <div className="flex min-w-0 items-center justify-end gap-2">
        <SpeedChip />
      </div>
    </header>
  )
}
